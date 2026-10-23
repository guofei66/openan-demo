import hashlib
import hmac
import os
import time

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .deps import get_db
from .models import User

_ITERATIONS = 240_000
_MAX_ITERATIONS = 10_000_000


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations_str, salt_hex, digest_hex = stored.split("$")
        iterations = min(max(int(iterations_str), 1), _MAX_ITERATIONS)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), iterations)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, AttributeError, TypeError):
        return False


_bearer = HTTPBearer(auto_error=False)


def create_token(username: str, role: str, secret: str, expire_minutes: int) -> str:
    payload = {"sub": username, "role": role, "exp": int(time.time()) + expire_minutes * 60}
    return jwt.encode(payload, secret, algorithm="HS256")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, request.app.state.settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.scalar(select(User).where(User.username == payload["sub"]))
    if user is None or not user.enabled:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"username": user.username, "role": user.role, "id": user.id}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user
