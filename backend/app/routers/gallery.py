from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.services.storage import generate_signed_url, generate_signed_urls_batch
from app.utils.response import paginated_response
from app.utils.validator import validate_search_query

router = APIRouter(prefix="/gallery", tags=["Gallery"])


def serialize_file(file, signed_url: str = None) -> dict:
    return {
        "id": str(file.id),
        "album_id": str(file.album_id) if file.album_id else None,
        "original_filename": file.original_filename,
        "file_type": file.file_type,
        "mime_type": file.mime_type,
        "file_size": file.file_size,
        "width": file.width,
        "height": file.height,
        "duration_seconds": file.duration_seconds,
        "is_favorite": file.is_favorite,
        "signed_url": signed_url,
        "created_at": file.created_at.isoformat() if file.created_at else None,
    }


def _serialize_batch(files) -> list:
    """Serialize files with batch-generated signed URLs."""
    paths = [f.storage_path for f in files if f.storage_path]
    url_map = generate_signed_urls_batch(paths)
    return [serialize_file(f, url_map.get(f.storage_path)) for f in files]


@router.get("/")
def get_gallery(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    file_type: str = Query(None),
    favorites_only: bool = Query(False),
    album_id: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == False
    )

    if file_type in ("photo", "video"):
        query = query.filter(File.file_type == file_type)
    if favorites_only:
        query = query.filter(File.is_favorite == True)
    if album_id and album_id.lower() not in ("null", "undefined", "none", ""):
        import uuid as _uuid
        try:
            _uuid.UUID(album_id)
            query = query.filter(File.album_id == album_id)
        except ValueError:
            pass

    total = query.count()
    files = query.order_by(File.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return paginated_response(items=_serialize_batch(files), total=total, page=page, limit=limit)


@router.get("/recent")
def get_recent(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    files = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == False
    ).order_by(File.created_at.desc()).limit(limit).all()

    return {"success": True, "data": _serialize_batch(files)}


@router.get("/search")
def search_files(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    safe_query = validate_search_query(q)
    query = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == False,
        File.original_filename.ilike(f"%{safe_query}%")
    )
    total = query.count()
    files = query.order_by(File.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return paginated_response(items=_serialize_batch(files), total=total, page=page, limit=limit)


@router.get("/trash")
def get_trash(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == True
    )
    total = query.count()
    files = query.order_by(File.deleted_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return paginated_response(items=_serialize_batch(files), total=total, page=page, limit=limit)
