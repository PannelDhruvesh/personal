from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from typing import Optional
from datetime import datetime, timedelta, timezone
import uuid

from app.database import get_db
from app.dependencies import get_admin_user
from app.models.user import User
from app.models.file import File
from app.models.album import Album
from app.utils.response import success_response, paginated_response

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _fmt_bytes(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


def _serialize_user(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "username": u.username,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
        "is_active": u.is_active,
        "is_verified": u.is_verified,
        "is_admin": u.is_admin,
        "storage_used": u.storage_used,
        "storage_used_fmt": _fmt_bytes(u.storage_used),
        "storage_limit": u.storage_limit,
        "storage_limit_fmt": _fmt_bytes(u.storage_limit),
        "storage_pct": round((u.storage_used / u.storage_limit) * 100, 1) if u.storage_limit else 0,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


def _serialize_activity(row) -> dict:
    return {
        "id": str(row.id),
        "user_id": str(row.user_id),
        "username": row.username,
        "display_name": row.display_name,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": str(row.resource_id) if row.resource_id else None,
        "details": row.details or {},
        "ip_address": str(row.ip_address) if row.ip_address else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ── Overview stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user)
):
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    verified_users = db.query(func.count(User.id)).filter(User.is_verified == True).scalar()
    total_files = db.query(func.count(File.id)).filter(File.is_deleted == False).scalar()
    total_photos = db.query(func.count(File.id)).filter(File.file_type == "photo", File.is_deleted == False).scalar()
    total_videos = db.query(func.count(File.id)).filter(File.file_type == "video", File.is_deleted == False).scalar()
    total_albums = db.query(func.count(Album.id)).filter(Album.is_deleted == False).scalar()
    total_storage = int(db.query(func.coalesce(func.sum(File.file_size), 0)).filter(File.is_deleted == False).scalar() or 0)
    trash_files = db.query(func.count(File.id)).filter(File.is_deleted == True).scalar()

    # New users in last 7 days
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    new_users_week = db.query(func.count(User.id)).filter(User.created_at >= week_ago).scalar()

    # Uploads in last 7 days
    uploads_week = db.query(func.count(File.id)).filter(File.created_at >= week_ago).scalar()

    return success_response(data={
        "users": {
            "total": total_users,
            "active": active_users,
            "verified": verified_users,
            "new_this_week": new_users_week,
        },
        "files": {
            "total": total_files,
            "photos": total_photos,
            "videos": total_videos,
            "in_trash": trash_files,
            "uploads_this_week": uploads_week,
        },
        "albums": {
            "total": total_albums,
        },
        "storage": {
            "total_bytes": total_storage,
            "total_fmt": _fmt_bytes(total_storage),
        }
    })


# ── Users list ────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),  # active | inactive | unverified
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user)
):
    query = db.query(User)

    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (User.email.ilike(like)) | (User.username.ilike(like)) | (User.display_name.ilike(like))
        )

    if status_filter == "active":
        query = query.filter(User.is_active == True)
    elif status_filter == "inactive":
        query = query.filter(User.is_active == False)
    elif status_filter == "unverified":
        query = query.filter(User.is_verified == False, User.is_active == True)

    total = query.count()
    users = query.order_by(desc(User.created_at)).offset((page - 1) * limit).limit(limit).all()

    return paginated_response(
        items=[_serialize_user(u) for u in users],
        total=total, page=page, limit=limit
    )


# ── Single user detail ────────────────────────────────────────────────────────

@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    file_stats = db.query(
        func.count(File.id).label("total"),
        func.coalesce(func.sum(File.file_size), 0).label("total_size")
    ).filter(File.user_id == user_id, File.is_deleted == False).first()

    album_count = db.query(func.count(Album.id)).filter(
        Album.user_id == user_id, Album.is_deleted == False
    ).scalar()

    # Recent activity
    raw_logs = db.execute(
        text("""SELECT al.*, u.username, u.display_name
           FROM activity_logs al
           JOIN users u ON al.user_id = u.id
           WHERE al.user_id = :uid
           ORDER BY al.created_at DESC LIMIT 20"""),
        {"uid": str(user_id)}
    ).fetchall()

    return success_response(data={
        "user": _serialize_user(user),
        "stats": {
            "files": file_stats.total,
            "total_size": file_stats.total_size,
            "total_size_fmt": _fmt_bytes(file_stats.total_size),
            "albums": album_count,
        },
        "recent_activity": [_serialize_activity(r) for r in raw_logs]
    })


# ── Suspend / activate user ───────────────────────────────────────────────────

@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: uuid.UUID,
    is_active: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own status")

    user.is_active = is_active
    db.commit()

    # Log action
    _log_activity(db, admin.id, "admin_user_status_change",
                  "user", user_id,
                  {"target_user": str(user_id), "new_status": "active" if is_active else "suspended"})

    action = "activated" if is_active else "suspended"
    return success_response(message=f"User {action} successfully", data=_serialize_user(user))


# ── Toggle admin role ─────────────────────────────────────────────────────────

@router.patch("/users/{user_id}/admin")
async def toggle_admin_role(
    user_id: uuid.UUID,
    is_admin: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own admin role")

    user.is_admin = is_admin
    db.commit()

    _log_activity(db, admin.id, "admin_role_change",
                  "user", user_id,
                  {"target_user": str(user_id), "is_admin": is_admin})

    return success_response(message=f"Admin role {'granted' if is_admin else 'revoked'}", data=_serialize_user(user))


# ── Force delete user ─────────────────────────────────────────────────────────

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account via admin panel")

    email = user.email
    db.delete(user)
    db.commit()

    return success_response(message=f"User {email} permanently deleted")


# ── Update storage limit for a user ──────────────────────────────────────────

@router.patch("/users/{user_id}/storage-limit")
async def update_storage_limit(
    user_id: uuid.UUID,
    limit_gb: float = Query(..., gt=0, le=1000),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_limit = int(limit_gb * 1024 * 1024 * 1024)
    user.storage_limit = new_limit
    db.commit()

    _log_activity(db, admin.id, "admin_storage_limit_change",
                  "user", user_id,
                  {"target_user": str(user_id), "new_limit_gb": limit_gb})

    return success_response(message=f"Storage limit updated to {limit_gb} GB", data=_serialize_user(user))


# ── Activity log (all users) ──────────────────────────────────────────────────

@router.get("/activity")
async def get_activity_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user)
):
    filters = ""
    params: dict = {"offset": (page - 1) * limit, "limit": limit}

    if user_id:
        filters += " AND al.user_id = :uid"
        params["uid"] = user_id
    if action:
        filters += " AND al.action ILIKE :action"
        params["action"] = f"%{action}%"

    count_row = db.execute(
        text(f"SELECT COUNT(*) FROM activity_logs al WHERE 1=1 {filters}"),
        params
    ).scalar()

    rows = db.execute(
        text(f"""SELECT al.*, u.username, u.display_name
            FROM activity_logs al
            JOIN users u ON al.user_id = u.id
            WHERE 1=1 {filters}
            ORDER BY al.created_at DESC
            LIMIT :limit OFFSET :offset"""),
        params
    ).fetchall()

    return paginated_response(
        items=[_serialize_activity(r) for r in rows],
        total=count_row, page=page, limit=limit
    )


# ── Files overview (all users) ────────────────────────────────────────────────

@router.get("/files")
async def list_all_files(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    file_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user)
):
    query = db.query(File, User.username, User.email).join(
        User, File.user_id == User.id
    ).filter(File.is_deleted == False)

    if user_id:
        query = query.filter(File.user_id == user_id)
    if file_type in ("photo", "video"):
        query = query.filter(File.file_type == file_type)

    total = query.count()
    rows = query.order_by(desc(File.created_at)).offset((page - 1) * limit).limit(limit).all()

    items = []
    for f, username, email in rows:
        items.append({
            "id": str(f.id),
            "user_id": str(f.user_id),
            "username": username,
            "email": email,
            "original_filename": f.original_filename,
            "file_type": f.file_type,
            "mime_type": f.mime_type,
            "file_size": f.file_size,
            "file_size_fmt": _fmt_bytes(f.file_size),
            "is_favorite": f.is_favorite,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })

    return paginated_response(items=items, total=total, page=page, limit=limit)


# ── Helper: write activity log ────────────────────────────────────────────────

def _log_activity(db: Session, user_id, action: str,
                  resource_type: str = None, resource_id=None, details: dict = None):
    import json
    try:
        db.execute(
            text("""INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details)
               VALUES (:uid, :action, :rtype, :rid, :details::jsonb)"""),
            {
                "uid": str(user_id),
                "action": action,
                "rtype": resource_type,
                "rid": str(resource_id) if resource_id else None,
                "details": json.dumps(details or {})
            }
        )
        db.commit()
    except Exception:
        pass
