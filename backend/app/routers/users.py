from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import (UserResponse, UpdateProfileRequest, ChangePasswordRequest,
                               UpdateSettingsRequest, ALLOWED_SETTINGS_FIELDS)
from app.auth.hashing import hash_password, verify_password
from app.services.storage import upload_file_to_storage, generate_signed_url
from app.utils.response import success_response
from app.config import settings
import uuid

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    # Generate signed URL for avatar if it's a storage path
    avatar_url = current_user.avatar_url
    if avatar_url and not avatar_url.startswith("http"):
        avatar_url = generate_signed_url(avatar_url, expires_in=86400) or avatar_url

    return success_response(data={
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "avatar_url": avatar_url,
        "bio": current_user.bio,
        "is_verified": current_user.is_verified,
        "is_admin": current_user.is_admin,
        "storage_used": current_user.storage_used,
        "storage_limit": current_user.storage_limit,
        "storage_percent": round((current_user.storage_used / current_user.storage_limit) * 100, 2) if current_user.storage_limit else 0,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None
    })


@router.patch("/me")
async def update_profile(
    data: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if data.display_name is not None:
        current_user.display_name = data.display_name
    if data.bio is not None:
        current_user.bio = data.bio
    db.commit()
    db.refresh(current_user)
    return success_response(message="Profile updated successfully")


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are allowed")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Avatar must be under 5MB")

    path = f"{str(current_user.id)}/avatars/avatar_{uuid.uuid4()}.jpg"
    await upload_file_to_storage(content, path, file.content_type)
    signed_url = generate_signed_url(path, expires_in=86400 * 365)

    current_user.avatar_url = path
    db.commit()

    return success_response(data={"avatar_url": signed_url}, message="Avatar updated")


@router.post("/me/change-password")
async def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return success_response(message="Password changed successfully")


@router.get("/me/settings")
async def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = db.execute(
        text("SELECT * FROM user_settings WHERE user_id = :uid"),
        {"uid": str(current_user.id)}
    ).fetchone()

    if not result:
        return success_response(data={
            "dark_mode": True,
            "notifications_enabled": True,
            "auto_backup": False,
            "grid_size": "medium",
            "sort_by": "created_at",
            "sort_order": "desc",
            "show_hidden_albums": False
        })

    return success_response(data={
        "dark_mode": result.dark_mode,
        "notifications_enabled": result.notifications_enabled,
        "auto_backup": result.auto_backup,
        "grid_size": result.grid_size,
        "sort_by": result.sort_by,
        "sort_order": result.sort_order,
        "show_hidden_albums": result.show_hidden_albums
    })


@router.patch("/me/settings")
async def update_settings(
    data: UpdateSettingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    update_fields = data.model_dump(exclude_unset=True)
    if not update_fields:
        return success_response(message="No changes")

    # Enforce allowlist to prevent SQL injection via field names
    safe_fields = {k: v for k, v in update_fields.items() if k in ALLOWED_SETTINGS_FIELDS}
    if not safe_fields:
        return success_response(message="No valid fields to update")

    set_clause = ", ".join([f"{k} = :{k}" for k in safe_fields.keys()])
    safe_fields["uid"] = str(current_user.id)
    db.execute(
        text(f"UPDATE user_settings SET {set_clause}, updated_at = NOW() WHERE user_id = :uid"),
        safe_fields
    )
    db.commit()
    return success_response(message="Settings updated")


@router.delete("/me")
async def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    current_user.is_active = False
    db.commit()
    return success_response(message="Account deactivated")
