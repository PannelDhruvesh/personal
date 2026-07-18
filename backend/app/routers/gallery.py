from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.services.storage import generate_signed_url
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


@router.get("/")
async def get_gallery(
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
    # Only filter by album_id if it's a valid non-null UUID string
    if album_id and album_id.lower() not in ("null", "undefined", "none", ""):
        import uuid as _uuid
        try:
            _uuid.UUID(album_id)
            query = query.filter(File.album_id == album_id)
        except ValueError:
            pass  # invalid UUID — ignore filter

    total = query.count()
    files = query.order_by(File.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    result = []
    for f in files:
        signed_url = generate_signed_url(f.storage_path)
        result.append(serialize_file(f, signed_url))

    return paginated_response(items=result, total=total, page=page, limit=limit)


@router.get("/recent")
async def get_recent(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    files = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == False
    ).order_by(File.created_at.desc()).limit(limit).all()

    result = []
    for f in files:
        signed_url = generate_signed_url(f.storage_path)
        result.append(serialize_file(f, signed_url))

    return {"success": True, "data": result}


@router.get("/search")
async def search_files(
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

    result = []
    for f in files:
        signed_url = generate_signed_url(f.storage_path)
        result.append(serialize_file(f, signed_url))

    return paginated_response(items=result, total=total, page=page, limit=limit)


@router.get("/trash")
async def get_trash(
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

    result = []
    for f in files:
        signed_url = generate_signed_url(f.storage_path)
        result.append(serialize_file(f, signed_url))

    return paginated_response(items=result, total=total, page=page, limit=limit)
