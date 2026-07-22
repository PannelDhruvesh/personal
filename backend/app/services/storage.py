import logging
import asyncio
from typing import Optional, List
from functools import lru_cache
from app.database import supabase_client
from app.config import settings

logger = logging.getLogger("its_billi")

# In-memory signed URL cache: path -> url (expires ~55 min)
_url_cache: dict = {}
_CACHE_TTL = 3300  # 55 minutes (URLs expire in 60)


def build_storage_path(user_id: str, album_id: str, filename: str) -> str:
    return f"{user_id}/{album_id}/{filename}"


def _extract_url(response) -> Optional[str]:
    """Extract signed URL from supabase-py v1/v2 response."""
    if isinstance(response, dict):
        url = (response.get("signedURL") or response.get("signed_url")
               or response.get("signedUrl"))
        if not url and "data" in response:
            d = response["data"]
            if isinstance(d, dict):
                url = d.get("signedURL") or d.get("signed_url") or d.get("signedUrl")
        return url
    # Object response
    url = getattr(response, "signed_url", None) or getattr(response, "signedURL", None)
    if not url:
        d = getattr(response, "data", None)
        if d:
            url = (getattr(d, "signed_url", None) or getattr(d, "signedURL", None)
                   or (d.get("signedURL") if isinstance(d, dict) else None)
                   or (d.get("signed_url") if isinstance(d, dict) else None))
    return url


def generate_signed_url(storage_path: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a signed URL, using in-memory cache to avoid repeat calls."""
    if not storage_path:
        return None

    import time
    cache_key = f"{storage_path}:{expires_in}"
    cached = _url_cache.get(cache_key)
    if cached and cached[1] > time.time():
        return cached[0]

    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=storage_path, expires_in=expires_in
        )
        url = _extract_url(response)
        if url:
            import time as _t
            _url_cache[cache_key] = (url, _t.time() + _CACHE_TTL)
            # Evict old entries if cache grows too large
            if len(_url_cache) > 1000:
                cutoff = _t.time()
                _url_cache.clear()  # simple eviction
        else:
            logger.warning(f"Empty signed URL: {storage_path} | {type(response).__name__}: {str(response)[:200]}")
        return url
    except Exception as e:
        logger.error(f"Signed URL error for {storage_path}: {e}")
        return None


def generate_signed_urls_batch(paths: List[str], expires_in: int = 3600) -> dict:
    """
    Generate signed URLs for multiple paths efficiently.
    Returns dict: {path: url}
    Uses cache for already-known URLs, batch API for the rest.
    """
    import time
    result = {}
    uncached = []

    for path in paths:
        if not path:
            continue
        cache_key = f"{path}:{expires_in}"
        cached = _url_cache.get(cache_key)
        if cached and cached[1] > time.time():
            result[path] = cached[0]
        else:
            uncached.append(path)

    if uncached:
        try:
            # Use batch endpoint
            response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_urls(
                paths=uncached, expires_in=expires_in
            )
            now = time.time()
            # Response is a list of {path, signedURL, error}
            items = response if isinstance(response, list) else getattr(response, "data", []) or []
            for item in items:
                if isinstance(item, dict):
                    p = item.get("path", "")
                    url = item.get("signedURL") or item.get("signed_url") or item.get("signedUrl")
                    err = item.get("error")
                else:
                    p = getattr(item, "path", "")
                    url = getattr(item, "signed_url", None) or getattr(item, "signedURL", None)
                    err = getattr(item, "error", None)
                if url and p:
                    result[p] = url
                    _url_cache[f"{p}:{expires_in}"] = (url, now + _CACHE_TTL)
                elif err:
                    logger.warning(f"Batch sign error for {p}: {err}")
        except Exception as e:
            logger.error(f"Batch signed URL error: {e}")
            # Fallback: individual
            for p in uncached:
                result[p] = generate_signed_url(p, expires_in)

    return result


def generate_signed_download_url(storage_path: str, expires_in: int = 300) -> Optional[str]:
    """Generate a signed download URL (short TTL, not cached)."""
    if not storage_path:
        return None
    try:
        response = supabase_client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=storage_path, expires_in=expires_in, options={"download": True}
        )
        return _extract_url(response)
    except Exception as e:
        logger.error(f"Download URL error for {storage_path}: {e}")
        return None


async def upload_file_to_storage(file_content: bytes, storage_path: str, content_type: str) -> str:
    """Upload file to Supabase Storage."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: supabase_client.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": content_type, "upsert": "true"}
        )
    )
    return storage_path


async def delete_file_from_storage(storage_path: str) -> bool:
    """Delete a file from Supabase Storage."""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: supabase_client.storage.from_(settings.SUPABASE_BUCKET).remove([storage_path])
        )
        # Evict from cache
        for key in list(_url_cache.keys()):
            if key.startswith(storage_path):
                del _url_cache[key]
        return True
    except Exception as e:
        logger.warning(f"Storage delete error for {storage_path}: {e}")
        return False


async def delete_files_from_storage_batch(paths: List[str]) -> None:
    """Delete multiple files from storage in one API call."""
    if not paths:
        return
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: supabase_client.storage.from_(settings.SUPABASE_BUCKET).remove(paths)
        )
        for p in paths:
            for key in list(_url_cache.keys()):
                if key.startswith(p):
                    del _url_cache[key]
    except Exception as e:
        logger.warning(f"Batch storage delete error: {e}")


async def get_file_bytes(storage_path: str) -> Optional[bytes]:
    """Download file bytes from storage."""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: supabase_client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)
        )
    except Exception as e:
        logger.warning(f"Failed to download {storage_path}: {e}")
        return None
