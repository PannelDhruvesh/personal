import uuid
import mimetypes
from datetime import datetime, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException, status
from PIL import Image
import io

from app.models.file import File
from app.models.album import Album
from app.services.storage import upload_file_to_storage, build_storage_path
from app.config import settings
from app.utils.validator import sanitize_filename


def get_image_dimensions(file_content: bytes, mime_type: str) -> Tuple[Optional[int], Optional[int]]:
    try:
        if mime_type.startswith("image/"):
            img = Image.open(io.BytesIO(file_content))
            return img.width, img.height
    except Exception:
        pass
    return None, None


async def process_and_upload_file(
    db: Session,
    user_id: uuid.UUID,
    album_id: Optional[uuid.UUID],
    file: UploadFile,
    file_type: str
) -> File:
    file_content = await file.read()
    file_size = len(file_content)

    if file_size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds limit of {settings.MAX_UPLOAD_SIZE_MB}MB"
        )

    # Get user storage info
    from app.models.user import User
    user = db.query(User).filter(User.id == user_id).first()
    if user and (user.storage_used + file_size) > user.storage_limit:
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail="Storage limit exceeded"
        )

    original_filename = file.filename or "upload"
    safe_filename = sanitize_filename(original_filename)
    unique_filename = f"{uuid.uuid4()}_{safe_filename}"

    # Use default album if none provided
    effective_album_id = str(album_id) if album_id else "uncategorized"
    storage_path = build_storage_path(str(user_id), effective_album_id, unique_filename)

    await upload_file_to_storage(file_content, storage_path, file.content_type)

    width, height = None, None
    if file_type == "photo":
        width, height = get_image_dimensions(file_content, file.content_type)

    db_file = File(
        user_id=user_id,
        album_id=album_id,
        filename=unique_filename,
        original_filename=original_filename,
        file_type=file_type,
        mime_type=file.content_type,
        file_size=file_size,
        storage_path=storage_path,
        width=width,
        height=height,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file


def get_file_by_id(db: Session, file_id: uuid.UUID, user_id: uuid.UUID) -> Optional[File]:
    return db.query(File).filter(
        File.id == file_id,
        File.user_id == user_id
    ).first()


def soft_delete_file(db: Session, file: File) -> File:
    file.is_deleted = True
    file.deleted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(file)
    return file


def restore_file(db: Session, file: File) -> File:
    file.is_deleted = False
    file.deleted_at = None
    db.commit()
    db.refresh(file)
    return file


def toggle_favorite(db: Session, file: File) -> File:
    file.is_favorite = not file.is_favorite
    db.commit()
    db.refresh(file)
    return file
