import re
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from app.config import settings


def validate_file_upload(file: UploadFile) -> str:
    """Validate uploaded file type and size. Returns file_type ('photo' or 'video')."""
    if file.content_type not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{file.content_type}' is not allowed. Allowed: images and videos only."
        )

    if file.content_type in settings.allowed_image_types_list:
        return "photo"
    return "video"


def sanitize_filename(filename: str) -> str:
    """Remove dangerous characters from filename."""
    filename = re.sub(r'[^\w\s\-.]', '', filename)
    filename = re.sub(r'\s+', '_', filename)
    filename = filename.strip('._-')
    if not filename:
        filename = "file"
    return filename[:200]


def validate_search_query(query: str) -> str:
    """Sanitize search query to prevent injection."""
    query = re.sub(r'[^\w\s\-_.]', '', query)
    return query.strip()[:100]
