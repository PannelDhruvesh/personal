from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class AlbumCreate(BaseModel):
    name: str
    description: Optional[str] = None


class AlbumUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_favorite: Optional[bool] = None
    is_hidden: Optional[bool] = None


class AlbumResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    cover_url: Optional[str]
    is_favorite: bool
    is_hidden: bool
    is_deleted: bool
    file_count: int
    total_size: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
