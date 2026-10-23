from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..deps import get_agent_id, get_db
from ..models import Seed, Variant
from ..schemas import SeedCreate, SeedPatch

router = APIRouter(prefix="/api/v1/seeds", tags=["seeds"])


def _seed_view(seed: Seed, variant_count: int) -> dict:
    return {
        "id": seed.id,
        "agentId": seed.agent_id,
        "templateUri": seed.template_uri,
        "name": seed.name,
        "seedJson": seed.seed_json,
        "description": seed.description,
        "createdBy": seed.created_by,
        "variantCount": variant_count,
    }


@router.get("")
def list_seeds(db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    result = []
    for seed in db.scalars(select(Seed).order_by(Seed.id.desc())).all():
        count = len(db.scalars(select(Variant.id).where(Variant.seed_id == seed.id)).all())
        result.append(_seed_view(seed, count))
    return result


@router.post("", status_code=201)
def create_seed(
    body: SeedCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    agent_id: int = Depends(get_agent_id),
):
    seed = Seed(
        agent_id=agent_id,
        template_uri=body.templateUri,
        name=body.name,
        seed_json=body.seedJson,
        description=body.description,
        created_by=user["username"],
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)
    return _seed_view(seed, 0)


@router.patch("/{seed_id}")
def patch_seed(seed_id: int, body: SeedPatch, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    seed = db.get(Seed, seed_id)
    if seed is None:
        raise HTTPException(status_code=404, detail="Seed not found")
    if body.name is not None:
        seed.name = body.name
    if body.templateUri is not None:
        seed.template_uri = body.templateUri
    if body.seedJson is not None:
        seed.seed_json = body.seedJson
    if body.description is not None:
        seed.description = body.description
    db.commit()
    count = len(db.scalars(select(Variant.id).where(Variant.seed_id == seed.id)).all())
    return _seed_view(seed, count)


@router.delete("/{seed_id}", status_code=204)
def delete_seed(seed_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    seed = db.get(Seed, seed_id)
    if seed is None:
        raise HTTPException(status_code=404, detail="Seed not found")
    for variant in db.scalars(select(Variant).where(Variant.seed_id == seed_id)).all():
        variant.seed_id = None
    db.delete(seed)
    db.commit()
