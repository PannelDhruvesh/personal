from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
import uuid
import re


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    banner_url: Optional[str]
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

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v):
        if v is not None and len(v.strip()) > 100:
            raise ValueError("Display name too long (max 100 chars)")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v):
        if v is not None and len(v) > 500:
            raise ValueError("Bio too long (max 500 chars)")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'[0-9]', v):
            raise ValueError("Password must contain at least one number")
        return v


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


# Explicit allowlist of fields that can be updated via settings
ALLOWED_SETTINGS_FIELDS = {
    "dark_mode", "notifications_enabled", "auto_backup",
    "grid_size", "sort_by", "sort_order", "show_hidden_albums"
}

VALID_GRID_SIZES = {"small", "medium", "large"}
VALID_SORT_BY = {"created_at", "name", "size", "type"}
VALID_SORT_ORDER = {"asc", "desc"}


class UpdateSettingsRequest(BaseModel):
    dark_mode: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    auto_backup: Optional[bool] = None
    grid_size: Optional[str] = None
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
    show_hidden_albums: Optional[bool] = None

    @field_validator("grid_size")
    @classmethod
    def validate_grid_size(cls, v):
        if v is not None and v not in VALID_GRID_SIZES:
            raise ValueError(f"grid_size must be one of {VALID_GRID_SIZES}")
        return v

    @field_validator("sort_by")
    @classmethod
    def validate_sort_by(cls, v):
        if v is not None and v not in VALID_SORT_BY:
            raise ValueError(f"sort_by must be one of {VALID_SORT_BY}")
        return v

    @field_validator("sort_order")
    @classmethod
    def validate_sort_order(cls, v):
        if v is not None and v not in VALID_SORT_ORDER:
            raise ValueError(f"sort_order must be one of {VALID_SORT_ORDER}")
        return v
