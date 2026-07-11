from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import uuid


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    bio: Optional[str]
    is_verified: bool
    storage_used: int
    storage_limit: int
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserSettingsResponse(BaseModel):
    dark_mode: bool
    notifications_enabled: bool
    auto_backup: bool
    grid_size: str
    sort_by: str
    sort_order: str
    show_hidden_albums: bool

    class Config:
        from_attributes = True


class UpdateSettingsRequest(BaseModel):
    dark_mode: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    auto_backup: Optional[bool] = None
    grid_size: Optional[str] = None
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
    show_hidden_albums: Optional[bool] = None
