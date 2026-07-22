from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.album import AlbumCreate, AlbumUpdate
from app.services import album_service
from app.utils.response import success_response, paginated_response
import uuid

router = APIRouter(prefix="/albums", tags=["Albums"])


def serialize_album(album) -> dict:
    return {
        "id": str(album.id),
        "name": album.name,
        "description": album.description,
        "cover_url": album.cover_url,
        "is_favorite": album.is_favorite,
        "is_hidden": album.is_hidden,
        "is_deleted": album.is_deleted,
        "file_count": album.file_count,
        "total_size": album.total_size,
        "created_at": album.created_at.isoformat() if album.created_at else None,
        "updated_at": album.updated_at.isoformat() if album.updated_at else None,
    }


@router.get("/")
def list_albums(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    include_hidden: bool = Query(False),
    favorites_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    skip = (page - 1) * limit
    albums, total = album_service.get_user_albums(
        db, current_user.id,
        include_hidden=include_hidden,
        favorites_only=favorites_only,
        skip=skip,
        limit=limit
    )
    return paginated_response(
        items=[serialize_album(a) for a in albums],
        total=total, page=page, limit=limit
    )


@router.post("/")
def create_album(
    data: AlbumCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    album = album_service.create_album(db, current_user.id, data)
    return success_response(data=serialize_album(album), status_code=201)


@router.get("/trash")
def get_trash(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    skip = (page - 1) * limit
    albums, total = album_service.get_user_albums(
        db, current_user.id,
        include_deleted=True,
        include_hidden=True,
        skip=skip,
        limit=limit
    )
    return paginated_response(
        items=[serialize_album(a) for a in albums],
        total=total, page=page, limit=limit
    )


@router.get("/{album_id}")
def get_album(
    album_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    album = album_service.get_album_by_id(db, album_id, current_user.id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    return success_response(data=serialize_album(album))


@router.patch("/{album_id}")
def update_album(
    album_id: uuid.UUID,
    data: AlbumUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    album = album_service.get_album_by_id(db, album_id, current_user.id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    album = album_service.update_album(db, album, data)
    return success_response(data=serialize_album(album))


@router.delete("/{album_id}")
def delete_album(
    album_id: uuid.UUID,
    permanent: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    album = album_service.get_album_by_id(db, album_id, current_user.id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    if permanent:
        album_service.permanent_delete_album(db, album)
        return success_response(message="Album permanently deleted")

    album_service.soft_delete_album(db, album)
    return success_response(message="Album moved to trash")


@router.post("/{album_id}/restore")
def restore_album(
    album_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    album = album_service.get_album_by_id(db, album_id, current_user.id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    album = album_service.restore_album(db, album)
    return success_response(data=serialize_album(album), message="Album restored")


@router.post("/{album_id}/favorite")
def toggle_favorite(
    album_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    album = album_service.get_album_by_id(db, album_id, current_user.id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    update = AlbumUpdate(is_favorite=not album.is_favorite)
    album = album_service.update_album(db, album, update)
    return success_response(data={"is_favorite": album.is_favorite})
