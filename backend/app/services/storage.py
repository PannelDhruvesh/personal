import logging
from typing import Optional
from app.database import supabase_client
from app.config import settings

logger = logging.getLogger("its_billi")


def build_storage_path(user_id: str, album_id: str, filename: str) -> str:
    return f"{user_id}/{album_id}/{filename}"


async def upload_file_to_storage(
    file_content: bytes,
    storage_path: str,
    content_type: str
) -> str:
    """Upload file to Supabase Storage. Returns the storage path."""
    try:
        supabase_client.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": content_type, "upsert": "true"}
        )
    except Exception as e:
        # Try upsert if file already exists
        logger.warning(f"Upload attempt error (may be duplicate): {e}")
        raise
    return storage_path


async def delete_file_from_storage(storage_path: str) -> bool:
    """Delete a file from Supabase Storage."""
    try:
        supabase_client.storage.from_(settings.SUPABASE_BUCKET).remove([storage_path])
        return True
    except Exception as e:
        logger.warning(f"Storage delete error for {storage_path}: {e}")
        return False


def generate_signed_url(storage_path: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a signed URL for private file access."""
    if not storage_path:
        return None
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=storage_path,
            expires_in=expires_in
        )
        # Handle both dict and object responses from different supabase-py versions
        if isinstance(response, dict):
            url = response.get("signedURL") or response.get("signed_url") or response.get("signedUrl")
        else:
            url = getattr(response, "signed_url", None) or getattr(response, "signedURL", None)

        if not url:
            logger.warning(f"Empty signed URL for path: {storage_path} | response: {response}")
        return url
    except Exception as e:
        logger.warning(f"Failed to generate signed URL for {storage_path}: {e}")
        return None


def generate_signed_download_url(storage_path: str, expires_in: int = 300) -> Optional[str]:
    """Generate a signed download URL."""
    if not storage_path:
        return None
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=storage_path,
            expires_in=expires_in,
            options={"download": True}
        )
        if isinstance(response, dict):
            return response.get("signedURL") or response.get("signed_url") or response.get("signedUrl")
        return getattr(response, "signed_url", None) or getattr(response, "signedURL", None)
    except Exception as e:
        logger.warning(f"Failed to generate download URL for {storage_path}: {e}")
        return None


async def get_file_bytes(storage_path: str) -> Optional[bytes]:
    """Download file bytes from storage."""
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)
        return response
    except Exception as e:
        logger.warning(f"Failed to download file {storage_path}: {e}")
        return None
