from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, hash_password, require_admin
from ..deps import get_db
from ..models import User
from ..schemas import UserCreate, UserPatch

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _user_view(user: User) -> dict:
    return {"id": user.id, "username": user.username, "role": user.role, "enabled": user.enabled}


@router.get("")
def list_users(db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    return [_user_view(u) for u in db.scalars(select(User).order_by(User.id)).all()]


@router.post("", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    if db.scalar(select(User).where(User.username == body.username)) is not None:
        raise HTTPException(status_code=409, detail="Username exists")
    user = User(username=body.username, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_view(user)


@router.patch("/{user_id}")
def patch_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.enabled is not None:
        user.enabled = body.enabled
    if body.role is not None:
        user.role = body.role
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    db.commit()
    return _user_view(user)
