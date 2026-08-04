from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.upload_service import process_and_upload_file, get_file_by_id, soft_delete_file, restore_file, toggle_favorite
from app.services.storage import generate_signed_url
from app.utils.validator import validate_file_upload
from app.utils.response import success_response
from app.routers.admin import _log_activity
import uuid

router = APIRouter(prefix="/uploads", tags=["Uploads"])


def serialize_file(file, signed_url: str = None, thumbnail_url: str = None) -> dict:
    return {
        "id": str(file.id),
        "album_id": str(file.album_id) if file.album_id else None,
        "filename": file.filename,
        "original_filename": file.original_filename,
        "file_type": file.file_type,
        "mime_type": file.mime_type,
        "file_size": file.file_size,
        "width": file.width,
        "height": file.height,
        "duration_seconds": file.duration_seconds,
        "is_favorite": file.is_favorite,
        "is_deleted": file.is_deleted,
        "signed_url": signed_url,
        "thumbnail_url": thumbnail_url,
        "created_at": file.created_at.isoformat() if file.created_at else None,
    }


@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    album_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file_type = validate_file_upload(file)
    parsed_album_id = uuid.UUID(album_id) if album_id else None

    db_file = await process_and_upload_file(db, current_user.id, parsed_album_id, file, file_type)
    signed_url = generate_signed_url(db_file.storage_path)
    _log_activity(db, current_user.id, "upload", "file", db_file.id,
                  {"filename": db_file.original_filename, "size": db_file.file_size, "type": file_type})
    return success_response(data=serialize_file(db_file, signed_url), status_code=201)


@router.post("/multi")
async def upload_multiple(
    files: List[UploadFile] = File(...),
    album_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per upload")

    parsed_album_id = uuid.UUID(album_id) if album_id else None
    results = []
    errors = []

    for file in files:
        try:
            file_type = validate_file_upload(file)
            db_file = await process_and_upload_file(db, current_user.id, parsed_album_id, file, file_type)
            signed_url = generate_signed_url(db_file.storage_path)
            results.append(serialize_file(db_file, signed_url))
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})

    return success_response(data={"uploaded": results, "errors": errors}, status_code=201)


@router.get("/{file_id}")
async def get_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = get_file_by_id(db, file_id, current_user.id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    signed_url = generate_signed_url(file.storage_path)
    return success_response(data=serialize_file(file, signed_url))


@router.delete("/{file_id}")
async def delete_file(
    file_id: uuid.UUID,
    permanent: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.services.storage import delete_file_from_storage
    file = get_file_by_id(db, file_id, current_user.id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    if permanent:
        await delete_file_from_storage(file.storage_path)
        db.delete(file)
        # NOTE: Do NOT manually update storage_used here.
        # The database trigger on_file_storage_change (DELETE on files)
        # decrements users.storage_used atomically.
        db.commit()
        _log_activity(db, current_user.id, "delete_permanent", "file", file_id,
                      {"filename": file.original_filename})
        return success_response(message="File permanently deleted")

    soft_delete_file(db, file)
    _log_activity(db, current_user.id, "delete", "file", file_id,
                  {"filename": file.original_filename})
    return success_response(message="File moved to trash")


@router.post("/{file_id}/restore")
async def restore_file_endpoint(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = get_file_by_id(db, file_id, current_user.id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    restored = restore_file(db, file)
    return success_response(data=serialize_file(restored), message="File restored")


@router.post("/{file_id}/favorite")
async def toggle_file_favorite(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = get_file_by_id(db, file_id, current_user.id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    updated = toggle_favorite(db, file)
    return success_response(data={"is_favorite": updated.is_favorite})
