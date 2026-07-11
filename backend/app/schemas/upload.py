from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class FileResponse(BaseModel):
    id: uuid.UUID
    album_id: Optional[uuid.UUID]
    filename: str
    original_filename: str
    file_type: str
    mime_type: str
    file_size: int
    width: Optional[int]
    height: Optional[int]
    duration_seconds: Optional[int]
    is_favorite: bool
    is_deleted: bool
    signed_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FileUpdate(BaseModel):
    album_id: Optional[uuid.UUID] = None
    is_favorite: Optional[bool] = None
