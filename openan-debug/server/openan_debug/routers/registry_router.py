import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends

from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/registry", tags=["registry"])

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "data" / "registry_samples"


@lru_cache(maxsize=1)
def load_samples() -> list[dict]:
    samples = []
    for path in sorted(SAMPLES_DIR.glob("*.json")):
        samples.append(json.loads(path.read_text(encoding="utf-8")))
    return sorted(samples, key=lambda item: item.get("key", ""))


@router.get("/samples")
def list_samples(_: dict = Depends(get_current_user)):
    return load_samples()
