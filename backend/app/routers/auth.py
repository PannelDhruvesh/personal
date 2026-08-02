import random
import string
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse,
    RefreshTokenRequest, ForgotPasswordRequest,
    ResetPasswordRequest, VerifyOTPRequest
)
from app.auth.hashing import hash_password, verify_password
from app.auth.jwt_handler import create_access_token, create_refresh_token
from app.config import settings
from app.utils.response import success_response
from app.services.storage import generate_signed_url
import uuid
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger("its_billi")
router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)


def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))


async def send_otp_email(email: str, otp: str, otp_type: str):
    if not settings.SMTP_USER:
        return

    subject_map = {
        "register": "Verify your Its Billi account",
        "reset_password": "Reset your Its Billi password",
        "login": "Its Billi login code"
    }

    message = MIMEMultipart("alternative")
    message["Subject"] = subject_map.get(otp_type, "Its Billi OTP")
    message["From"] = settings.FROM_EMAIL
    message["To"] = email

    html_body = f"""
    <html><body style="font-family:Arial,sans-serif;background:#fff0f5;padding:20px;">
    <div style="max-width:400px;margin:0 auto;background:#fff;border-radius:20px;padding:30px;text-align:center;">
        <h2 style="color:#e91e8c;">Its Billi</h2>
        <p>Your verification code is:</p>
        <div style="font-size:36px;font-weight:bold;color:#e91e8c;letter-spacing:8px;margin:20px 0;">{otp}</div>
        <p style="color:#888;font-size:12px;">This code expires in 10 minutes. Do not share it with anyone.</p>
    </div>
    </body></html>
    """
    message.attach(MIMEText(html_body, "html"))

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=False,
            start_tls=True
        )
    except Exception as e:
        logger.warning(f"Failed to send OTP email to {email}: {e}")


@router.post("/register")
async def register(data: RegisterRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    existing_email = db.query(User).filter(User.email == data.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_username = db.query(User).filter(User.username == data.username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    hashed = hash_password(data.password)
    user = User(
        email=data.email,
        username=data.username.lower(),
        display_name=data.display_name or data.username,
        password_hash=hashed,
        is_verified=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    db.execute(
        text("INSERT INTO otp_verifications (user_id, email, otp_code, otp_type, expires_at) VALUES (:uid, :email, :otp, :type, :exp)"),
        {"uid": str(user.id), "email": data.email, "otp": otp, "type": "register", "exp": expires}
    )
    db.commit()

    # Send email in background — response returns immediately
    background_tasks.add_task(send_otp_email, data.email, otp, "register")

    return success_response(
        data={"user_id": str(user.id), "email": data.email},
        message="Registration successful. Check your email for verification code.",
        status_code=201
    )


@router.post("/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, data: VerifyOTPRequest, db: Session = Depends(get_db)):
    result = db.execute(
        text("""SELECT * FROM otp_verifications
           WHERE email = :email AND otp_type = :type
           AND is_used = FALSE AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 1"""),
        {"email": data.email, "type": data.otp_type}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    if result.attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")

    db.execute(
        text("UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = :id"),
        {"id": result.id}
    )
    db.commit()

    if result.otp_code != data.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    db.execute(
        text("UPDATE otp_verifications SET is_used = TRUE WHERE id = :id"),
        {"id": result.id}
    )

    if data.otp_type == "register":
        db.execute(
            text("UPDATE users SET is_verified = TRUE WHERE email = :email"),
            {"email": data.email}
        )
    db.commit()

    return success_response(message="OTP verified successfully")


@router.post("/login", response_model=None)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email, User.is_active == True).first()

    if not user or not verify_password(data.password, user.password_hash):
        logger.warning(f"Failed login attempt for email: {data.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email first")

    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    db.execute(
        text("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (:uid, :token, :exp)"),
        {"uid": str(user.id), "token": refresh_token, "exp": expires_at}
    )
    db.execute(
        text("UPDATE users SET last_login = NOW() WHERE id = :id"),
        {"id": str(user.id)}
    )
    db.commit()

    try:
        db.execute(
            text("INSERT INTO activity_logs (user_id, action, resource_type, details) VALUES (:uid, 'login', 'session', :details)"),
            {"uid": str(user.id), "details": '{"source":"login"}'}
        )
        db.commit()
    except Exception:
        pass

    return success_response(data={
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": generate_signed_url(user.avatar_url) if user.avatar_url and not user.avatar_url.startswith("http") else user.avatar_url,
            "is_admin": bool(user.is_admin)
        }
    })


@router.post("/refresh")
def refresh_token(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    result = db.execute(
        text("""SELECT rt.*, u.id as uid, u.email FROM refresh_tokens rt
           JOIN users u ON rt.user_id = u.id
           WHERE rt.token = :token AND rt.is_revoked = FALSE
           AND rt.expires_at > NOW() AND u.is_active = TRUE"""),
        {"token": data.refresh_token}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Rotate: revoke old token, issue new one
    new_access_token = create_access_token({"sub": str(result.uid), "email": result.email})
    new_refresh_token = create_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    db.execute(
        text("UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = :token"),
        {"token": data.refresh_token}
    )
    db.execute(
        text("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (:uid, :token, :exp)"),
        {"uid": str(result.uid), "token": new_refresh_token, "exp": expires_at}
    )
    db.commit()

    return success_response(data={
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    })


@router.post("/logout")
def logout(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    db.execute(
        text("UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = :token"),
        {"token": data.refresh_token}
    )
    db.commit()
    return success_response(message="Logged out successfully")


@router.post("/resend-otp")
@limiter.limit("3/minute")
async def resend_otp(request: Request, data: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Resend OTP for email verification during registration."""
    user = db.query(User).filter(User.email == data.email, User.is_verified == False).first()
    if user:
        otp = generate_otp()
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        db.execute(
            text("UPDATE otp_verifications SET is_used = TRUE WHERE email = :email AND otp_type = 'register' AND is_used = FALSE"),
            {"email": data.email}
        )
        db.execute(
            text("INSERT INTO otp_verifications (user_id, email, otp_code, otp_type, expires_at) VALUES (:uid, :email, :otp, 'register', :exp)"),
            {"uid": str(user.id), "email": data.email, "otp": otp, "exp": expires}
        )
        db.commit()
        background_tasks.add_task(send_otp_email, data.email, otp, "register")
    return success_response(message="If this account exists and is unverified, a new code has been sent.")


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, data: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        otp = generate_otp()
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        db.execute(
            text("INSERT INTO otp_verifications (user_id, email, otp_code, otp_type, expires_at) VALUES (:uid, :email, :otp, :type, :exp)"),
            {"uid": str(user.id), "email": data.email, "otp": otp, "type": "reset_password", "exp": expires}
        )
        db.commit()
        background_tasks.add_task(send_otp_email, data.email, otp, "reset_password")

    return success_response(message="If this email exists, a reset code has been sent.")


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, data: ResetPasswordRequest, db: Session = Depends(get_db)):
    result = db.execute(
        text("""SELECT * FROM otp_verifications
           WHERE email = :email AND otp_code = :otp AND otp_type = 'reset_password'
           AND is_used = FALSE AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 1"""),
        {"email": data.email, "otp": data.otp_code}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    new_hash = hash_password(data.new_password)
    db.execute(
        text("UPDATE users SET password_hash = :hash WHERE email = :email"),
        {"hash": new_hash, "email": data.email}
    )
    db.execute(
        text("UPDATE otp_verifications SET is_used = TRUE WHERE id = :id"),
        {"id": result.id}
    )
    db.execute(
        text("UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = (SELECT id FROM users WHERE email = :email)"),
        {"email": data.email}
    )
    db.commit()
    return success_response(message="Password reset successfully")
