from fastapi.responses import JSONResponse
from typing import Any, Optional


def success_response(data: Any = None, message: str = "Success", status_code: int = 200):
    content = {"success": True, "message": message}
    if data is not None:
        content["data"] = data
    return JSONResponse(content=content, status_code=status_code)


def error_response(message: str, status_code: int = 400, details: Optional[Any] = None):
    content = {"success": False, "message": message}
    if details:
        content["details"] = details
    return JSONResponse(content=content, status_code=status_code)


def paginated_response(items: list, total: int, page: int, limit: int):
    return {
        "success": True,
        "data": items,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
            "has_next": (page * limit) < total,
            "has_prev": page > 1
        }
    }
