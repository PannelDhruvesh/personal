from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import logging

from app.config import settings
from app.middleware.logger import RequestLoggerMiddleware
from app.routers import auth, users, albums, uploads, gallery, download, settings as settings_router, admin
from app.routers import google_auth

logger = logging.getLogger("its_billi")

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Private memory storage API — Its Billi",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — never use wildcard with credentials
_allowed_origins = settings.allowed_origins_list
if "*" in _allowed_origins:
    _allowed_origins = [
        "https://its-billi.vercel.app",
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

# Request logging
app.add_middleware(RequestLoggerMiddleware)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(google_auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(albums.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(gallery.router, prefix="/api/v1")
app.include_router(download.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy", "version": settings.APP_VERSION}


# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Don't cache auth responses
    if "/auth/" in str(request.url):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"success": False, "message": "Resource not found"})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    logger.error(f"Internal server error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"success": False, "message": "Internal server error"})
