from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..deps import get_db
from ..models import RequestLog

router = APIRouter(prefix="/api/v1/history", tags=["history"])


def _log_view(item: RequestLog, *, with_user: bool = False) -> dict:
    view = {
        "id": item.id,
        "feature": item.feature,
        "templateUri": item.template_uri,
        "direction": item.direction,
        "taskState": item.task_state,
        "negotiated": item.negotiated,
        "latencyMs": item.latency_ms,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "requestBody": item.request_body,
        "responseBody": item.response_body,
    }
    if with_user:
        view["userId"] = item.user_id
    return view


@router.get("")
def list_history(
    templateUri: str | None = None,
    direction: str | None = None,
    state: str | None = None,
    feature: str | None = None,
    limit: int = Query(50, ge=0, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    query = select(RequestLog)
    if templateUri:
        query = query.where(RequestLog.template_uri == templateUri)
    if direction:
        query = query.where(RequestLog.direction == direction)
    if state:
        query = query.where(RequestLog.task_state == state)
    if feature:
        query = query.where(RequestLog.feature == feature)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(RequestLog.id.desc()).offset(offset).limit(limit)).all()
    return {"total": total, "items": [_log_view(item) for item in items]}


@router.get("/{log_id}")
def get_history(log_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    item = db.get(RequestLog, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Log not found")
    return _log_view(item, with_user=True)
