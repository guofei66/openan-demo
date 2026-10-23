import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Variant

_SLOTS = re.compile(r"\{\{slots\.([A-Za-z0-9_.\-一-龥]+)\}\}")
_TIMESTAMP = "{{timestamp}}"
_UUID = "{{uuid}}"


def pick_variant(session: Session, agent_id: int, template_uri: str, cursor: dict) -> Variant | None:
    variants = session.scalars(
        select(Variant)
        .where(Variant.agent_id == agent_id, Variant.template_uri == template_uri, Variant.enabled.is_(True))
        .order_by(Variant.seq, Variant.id)
    ).all()
    if not variants:
        return None
    key = (agent_id, template_uri)
    index = cursor.get(key, 0) % len(variants)
    cursor[key] = index + 1
    return variants[index]


def fill_placeholders(value, params: dict):
    if isinstance(value, str):
        value = _SLOTS.sub(lambda m: str(params.get(m.group(1), "")), value)
        if _TIMESTAMP in value:
            value = value.replace(_TIMESTAMP, datetime.now(timezone.utc).isoformat(timespec="milliseconds"))
        if _UUID in value:
            value = value.replace(_UUID, str(uuid.uuid4()))
        return value
    if isinstance(value, list):
        return [fill_placeholders(item, params) for item in value]
    if isinstance(value, dict):
        return {key: fill_placeholders(item, params) for key, item in value.items()}
    return value
