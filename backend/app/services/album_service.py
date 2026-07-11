from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from app.models.album import Album
from app.models.file import File
from app.schemas.album import AlbumCreate, AlbumUpdate


def create_album(db: Session, user_id: uuid.UUID, data: AlbumCreate) -> Album:
    album = Album(
        user_id=user_id,
        name=data.name,
        description=data.description
    )
    db.add(album)
    db.commit()
    db.refresh(album)
    return album


def get_user_albums(
    db: Session,
    user_id: uuid.UUID,
    include_hidden: bool = False,
    include_deleted: bool = False,
    skip: int = 0,
    limit: int = 50
) -> tuple[List[Album], int]:
    query = db.query(Album).filter(
        Album.user_id == user_id,
        Album.is_deleted == include_deleted
    )
    if not include_hidden:
        query = query.filter(Album.is_hidden == False)

    total = query.count()
    albums = query.order_by(Album.is_favorite.desc(), Album.updated_at.desc()).offset(skip).limit(limit).all()
    return albums, total


def get_album_by_id(db: Session, album_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Album]:
    return db.query(Album).filter(
        Album.id == album_id,
        Album.user_id == user_id
    ).first()


def update_album(db: Session, album: Album, data: AlbumUpdate) -> Album:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(album, field, value)
    db.commit()
    db.refresh(album)
    return album


def soft_delete_album(db: Session, album: Album) -> Album:
    album.is_deleted = True
    album.deleted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(album)
    return album


def restore_album(db: Session, album: Album) -> Album:
    album.is_deleted = False
    album.deleted_at = None
    db.commit()
    db.refresh(album)
    return album


def permanent_delete_album(db: Session, album: Album):
    db.delete(album)
    db.commit()


def set_album_cover(db: Session, album: Album, cover_url: str) -> Album:
    album.cover_url = cover_url
    db.commit()
    db.refresh(album)
    return album
