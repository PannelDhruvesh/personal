from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.utils.response import success_response

router = APIRouter(prefix="/settings", tags=["Settings"])


def to_int(val) -> int:
    """Convert Decimal/float/None to int safely."""
    if val is None:
        return 0
    return int(val)


@router.get("/storage-usage")
async def get_storage_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    photo_stats = db.query(
        func.count(File.id).label("count"),
        func.coalesce(func.sum(File.file_size), 0).label("size")
    ).filter(
        File.user_id == current_user.id,
        File.file_type == "photo",
        File.is_deleted == False
    ).first()

    video_stats = db.query(
        func.count(File.id).label("count"),
        func.coalesce(func.sum(File.file_size), 0).label("size")
    ).filter(
        File.user_id == current_user.id,
        File.file_type == "video",
        File.is_deleted == False
    ).first()

    trash_stats = db.query(
        func.count(File.id).label("count"),
        func.coalesce(func.sum(File.file_size), 0).label("size")
    ).filter(
        File.user_id == current_user.id,
        File.is_deleted == True
    ).first()

    used  = to_int(current_user.storage_used)
    limit = to_int(current_user.storage_limit)
    percent = round((used / limit) * 100, 2) if limit else 0

    return success_response(data={
        "used_bytes":      used,
        "limit_bytes":     limit,
        "percent_used":    percent,
        "used_formatted":  format_bytes(used),
        "limit_formatted": format_bytes(limit),
        "photos": {"count": to_int(photo_stats.count), "size": to_int(photo_stats.size)},
        "videos": {"count": to_int(video_stats.count), "size": to_int(video_stats.size)},
        "trash":  {"count": to_int(trash_stats.count), "size": to_int(trash_stats.size)},
    })


@router.delete("/trash/empty")
async def empty_trash(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.services.storage import delete_file_from_storage

    trash_files = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == True
    ).all()

    deleted_count = 0
    for file in trash_files:
        await delete_file_from_storage(file.storage_path)
        db.delete(file)
        deleted_count += 1

    db.commit()
    return success_response(message=f"Trash emptied. {deleted_count} files deleted permanently.")


def format_bytes(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"
