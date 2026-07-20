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
    supabase_client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=file_content,
        file_options={"content-type": content_type, "upsert": "true"}
    )
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

        # supabase-py v1 returns dict, v2 returns object
        if isinstance(response, dict):
            url = (response.get("signedURL")
                   or response.get("signed_url")
                   or response.get("signedUrl"))
            # v2 may wrap in 'data' key
            if not url and "data" in response:
                data = response["data"]
                if isinstance(data, dict):
                    url = (data.get("signedURL")
                           or data.get("signed_url")
                           or data.get("signedUrl"))
        else:
            # Object response (supabase-py >= 2.x)
            url = (getattr(response, "signed_url", None)
                   or getattr(response, "signedURL", None))
            # Some versions nest it
            if not url:
                data = getattr(response, "data", None)
                if data:
                    url = (getattr(data, "signed_url", None)
                           or getattr(data, "signedURL", None)
                           or (data.get("signedURL") if isinstance(data, dict) else None)
                           or (data.get("signed_url") if isinstance(data, dict) else None))

        if not url:
            logger.warning(f"Signed URL empty for: {storage_path} | raw response type={type(response).__name__} | response={str(response)[:300]}")
        return url
    except Exception as e:
        logger.error(f"Signed URL error for {storage_path}: {e}")
        return None


def generate_signed_download_url(storage_path: str, expires_in: int = 300) -> Optional[str]:
    """Generate a signed download URL."""
    return generate_signed_url(storage_path, expires_in=expires_in)


async def get_file_bytes(storage_path: str) -> Optional[bytes]:
    """Download file bytes from storage."""
    try:
        return supabase_client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)
    except Exception as e:
        logger.warning(f"Failed to download file {storage_path}: {e}")
        return None
