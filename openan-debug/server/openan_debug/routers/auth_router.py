from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_token, get_current_user, verify_password
from ..deps import get_db, get_settings
from ..models import User
from ..schemas import LoginRequest

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db), settings=Depends(get_settings)):
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not user.enabled or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user.username, user.role, settings.jwt_secret, settings.jwt_expire_minutes)
    return {"token": token, "username": user.username, "role": user.role}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
