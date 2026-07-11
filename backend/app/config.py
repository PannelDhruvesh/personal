from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Its Billi"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_DB_URL: str
    SUPABASE_BUCKET: str = "its-billi"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Storage
    MAX_UPLOAD_SIZE_MB: int = 100
    ALLOWED_IMAGE_TYPES: str = "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
    ALLOWED_VIDEO_TYPES: str = "video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska"

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@itsbilli.app"

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def allowed_image_types_list(self) -> List[str]:
        return [t.strip() for t in self.ALLOWED_IMAGE_TYPES.split(",")]

    @property
    def allowed_video_types_list(self) -> List[str]:
        return [t.strip() for t in self.ALLOWED_VIDEO_TYPES.split(",")]

    @property
    def allowed_file_types(self) -> List[str]:
        return self.allowed_image_types_list + self.allowed_video_types_list


settings = Settings()
