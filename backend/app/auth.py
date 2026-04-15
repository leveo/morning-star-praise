"""Authentication via spiritual-growth-hub's Django auth tables."""

from fastapi import Request, HTTPException

from app.database import get_db


def get_current_user(request: Request) -> dict | None:
    """Extract user from DRF token in cookie or Authorization header.

    Reads Django's authtoken_token table to validate.
    Returns user dict or None if not authenticated.
    """
    token = None

    # Try cookie first
    token = request.cookies.get("auth_token")

    # Fall back to Authorization header
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Token "):
            token = auth_header[6:]

    if not token:
        return None

    with get_db() as conn:
        result = conn.execute(
            """
            SELECT u.id, u.username, u.email, u.first_name, u.last_name
            FROM authtoken_token t
            JOIN auth_user u ON t.user_id = u.id
            WHERE t.key = %s
            """,
            (token,),
        ).fetchone()

    return result


def require_auth(request: Request) -> dict:
    """FastAPI dependency that requires authentication."""
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
