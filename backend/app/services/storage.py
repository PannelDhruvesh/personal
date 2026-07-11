import uuid
import io
from typing import Optional, Tuple
from fastapi import UploadFile
from app.database import supabase_client
from app.config import settings


def build_storage_path(user_id: str, album_id: str, filename: str) -> str:
    return f"{user_id}/{album_id}/{filename}"


async def upload_file_to_storage(
    file_content: bytes,
    storage_path: str,
    content_type: str
) -> str:
    """Upload file to Supabase Storage. Returns the storage path."""
    supabase_client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=file_content,
        file_options={"content-type": content_type, "upsert": "false"}
    )
    return storage_path


async def delete_file_from_storage(storage_path: str) -> bool:
    """Delete a file from Supabase Storage."""
    try:
        supabase_client.storage.from_(settings.SUPABASE_BUCKET).remove([storage_path])
        return True
    except Exception:
        return False


def generate_signed_url(storage_path: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a signed URL for private file access."""
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=storage_path,
            expires_in=expires_in
        )
        return response.get("signedURL") or response.get("signed_url")
    except Exception:
        return None


def generate_signed_download_url(storage_path: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a signed download URL."""
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=storage_path,
            expires_in=expires_in,
            options={"download": True}
        )
        return response.get("signedURL") or response.get("signed_url")
    except Exception:
        return None


async def get_file_bytes(storage_path: str) -> Optional[bytes]:
    """Download file bytes from storage."""
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)
        return response
    except Exception:
        return None
