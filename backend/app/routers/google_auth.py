from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, timezone
import httpx
import uuid

from app.database import get_db
from app.models.user import User
from app.auth.jwt_handler import create_access_token, create_refresh_token
from app.utils.response import success_response
from app.config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])


class GoogleTokenRequest(BaseModel):
    id_token: str


async def verify_google_token(id_token: str) -> dict:
    """Verify Google ID token and return user info."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        data = resp.json()
        if "error" in data:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        return data


@router.post("/google")
async def google_login(data: GoogleTokenRequest, db: Session = Depends(get_db)):
    """Login or register via Google OAuth."""

    # Verify token with Google
    google_user = await verify_google_token(data.id_token)

    email = google_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by Google")

    name = google_user.get("name") or email.split("@")[0]
    picture = google_user.get("picture")

    # Find or create user
    user = db.query(User).filter(User.email == email).first()

    if not user:
        # Auto-generate a unique username from email
        base_username = email.split("@")[0].lower()
        # Keep only alphanumeric + underscore, max 30 chars
        import re
        base_username = re.sub(r'[^a-z0-9_]', '_', base_username)[:30]

        # Make sure username is unique
        username = base_username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{counter}"
            counter += 1

        user = User(
            email=email,
            username=username,
            display_name=name,
            password_hash="google_oauth",  # No password for Google users
            avatar_url=picture,
            is_active=True,
            is_verified=True,  # Google emails are already verified
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update avatar if changed
        if picture and user.avatar_url != picture:
            user.avatar_url = picture
        user.is_verified = True
        db.commit()

    # Create tokens
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

    # Log activity
    try:
        db.execute(
            text("INSERT INTO activity_logs (user_id, action, resource_type, details) VALUES (:uid, 'login', 'session', :details)"),
            {"uid": str(user.id), "details": '{"source":"google"}'}
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
            "avatar_url": user.avatar_url
        }
    })
