import json
from decimal import Decimal
from fastapi.responses import JSONResponse
from typing import Any, Optional


class SafeEncoder(json.JSONEncoder):
    """Handle Decimal, bytes, and other non-serializable types."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj == obj.to_integral_value() else float(obj)
        if isinstance(obj, bytes):
            return obj.decode("utf-8", errors="replace")
        return super().default(obj)


def _safe_dumps(data) -> str:
    return json.dumps(data, cls=SafeEncoder)


class SafeJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return _safe_dumps(content).encode("utf-8")


def success_response(data: Any = None, message: str = "Success", status_code: int = 200):
    content = {"success": True, "message": message}
    if data is not None:
        content["data"] = data
    return SafeJSONResponse(content=content, status_code=status_code)


def error_response(message: str, status_code: int = 400, details: Optional[Any] = None):
    content = {"success": False, "message": message}
    if details:
        content["details"] = details
    return SafeJSONResponse(content=content, status_code=status_code)


def paginated_response(items: list, total: int, page: int, limit: int):
    return {
        "success": True,
        "data": items,
        "pagination": {
            "total": int(total) if isinstance(total, Decimal) else total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
            "has_next": (page * limit) < total,
            "has_prev": page > 1
        }
    }
