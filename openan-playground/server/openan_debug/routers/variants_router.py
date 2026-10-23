from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..deps import get_db
from ..models import Agent, Seed, Variant
from ..schemas import VariantImportRequest, VariantPatch

router = APIRouter(prefix="/api/v1/variants", tags=["variants"])


def _variant_view(variant: Variant) -> dict:
    return {
        "id": variant.id,
        "seedId": variant.seed_id,
        "agentId": variant.agent_id,
        "templateUri": variant.template_uri,
        "variantJson": variant.variant_json,
        "enabled": variant.enabled,
        "source": variant.source,
        "seq": variant.seq,
    }


@router.get("")
def list_variants(template_uri: str | None = None, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    query = select(Variant).order_by(Variant.template_uri, Variant.seq, Variant.id)
    if template_uri:
        query = query.where(Variant.template_uri == template_uri)
    return [_variant_view(v) for v in db.scalars(query).all()]


@router.post("/import")
def import_variants(
    body: VariantImportRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    agent_id = body.agentId or request.app.state.runtime["agent_id"]
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.enabled:
        raise HTTPException(status_code=409, detail="Agent 已禁用")
    if body.seedId is not None and db.get(Seed, body.seedId) is None:
        raise HTTPException(status_code=404, detail="Seed not found")
    first_seq = db.scalar(
        select(func.coalesce(func.max(Variant.seq) + 1, 0)).where(
            Variant.agent_id == agent_id, Variant.template_uri == body.templateUri
        )
    )
    created = []
    for offset, item in enumerate(body.variants):
        variant = Variant(
            seed_id=body.seedId,
            agent_id=agent_id,
            template_uri=body.templateUri,
            variant_json=item,
            enabled=True,
            source="import",
            seq=first_seq + offset,
        )
        db.add(variant)
        created.append(variant)
    db.commit()
    for variant in created:
        db.refresh(variant)
    return {"imported": len(created), "firstSeq": first_seq, "ids": [v.id for v in created]}


@router.patch("/{variant_id}")
def patch_variant(variant_id: int, body: VariantPatch, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    variant = db.get(Variant, variant_id)
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    if body.enabled is not None:
        variant.enabled = body.enabled
    if body.variantJson is not None:
        variant.variant_json = body.variantJson
    db.commit()
    return _variant_view(variant)
