from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.utils.response import success_response

router = APIRouter(prefix="/settings", tags=["Settings"])


def _fmt(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


@router.get("/storage-usage")
def get_storage_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Single query using conditional aggregation — replaces 3 separate queries
    row = db.query(
        func.count(case((File.file_type == "photo", File.id), else_=None)).label("photo_count"),
        func.coalesce(func.sum(case((File.file_type == "photo", File.file_size), else_=0)), 0).label("photo_size"),
        func.count(case((File.file_type == "video", File.id), else_=None)).label("video_count"),
        func.coalesce(func.sum(case((File.file_type == "video", File.file_size), else_=0)), 0).label("video_size"),
        func.count(case((File.is_deleted == True, File.id), else_=None)).label("trash_count"),
        func.coalesce(func.sum(case((File.is_deleted == True, File.file_size), else_=0)), 0).label("trash_size"),
    ).filter(
        File.user_id == current_user.id
    ).first()

    used = int(current_user.storage_used or 0)
    limit = int(current_user.storage_limit or 0)
    percent = round((used / limit) * 100, 2) if limit else 0

    return success_response(data={
        "used_bytes":      used,
        "limit_bytes":     limit,
        "percent_used":    percent,
        "used_formatted":  _fmt(used),
        "limit_formatted": _fmt(limit),
        "photos": {"count": int(row.photo_count or 0), "size": int(row.photo_size or 0)},
        "videos": {"count": int(row.video_count or 0), "size": int(row.video_size or 0)},
        "trash":  {"count": int(row.trash_count or 0), "size": int(row.trash_size or 0)},
    })


@router.delete("/trash/empty")
async def empty_trash(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.services.storage import delete_files_from_storage_batch

    trash_files = db.query(File.id, File.storage_path).filter(
        File.user_id == current_user.id,
        File.is_deleted == True
    ).all()

    if not trash_files:
        return success_response(message="Trash is already empty.")

    paths = [f.storage_path for f in trash_files]
    file_ids = [f.id for f in trash_files]

    # Batch delete from storage
    await delete_files_from_storage_batch(paths)

    # Bulk DB delete
    db.query(File).filter(File.id.in_(file_ids)).delete(synchronize_session=False)
    db.commit()

    return success_response(message=f"Trash emptied. {len(file_ids)} files deleted permanently.")
