import io
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.file import File
from app.services.storage import generate_signed_download_url, get_file_bytes
import uuid

router = APIRouter(prefix="/download", tags=["Download"])


@router.get("/file/{file_id}")
def download_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(File).filter(
        File.id == file_id,
        File.user_id == current_user.id,
        File.is_deleted == False
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    signed_url = generate_signed_download_url(file.storage_path, expires_in=300)
    if not signed_url:
        raise HTTPException(status_code=500, detail="Could not generate download link")

    return {"success": True, "data": {"download_url": signed_url, "filename": file.original_filename}}


@router.get("/album/{album_id}/zip")
async def download_album_zip(
    album_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    files = db.query(File).filter(
        File.album_id == album_id,
        File.user_id == current_user.id,
        File.is_deleted == False
    ).all()

    if not files:
        raise HTTPException(status_code=404, detail="No files found in this album")

    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Album too large to zip (max 100 files)")

    # Fetch all file bytes concurrently
    import asyncio
    all_bytes = await asyncio.gather(*[get_file_bytes(f.storage_path) for f in files])

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for file, file_bytes in zip(files, all_bytes):
            if file_bytes:
                zf.writestr(file.original_filename, file_bytes)

    zip_buffer.seek(0)

    from app.models.album import Album
    album = db.query(Album).filter(Album.id == album_id).first()
    album_name = album.name if album else "album"
    safe_name = "".join(c for c in album_name if c.isalnum() or c in " _-").strip()

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'}
    )
