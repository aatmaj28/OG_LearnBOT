"""GET /api/health, GET /api/employees, POST /api/admin/reindex (P1)."""
from fastapi import APIRouter

from app.core import config, store

router = APIRouter(tags=["admin"])


@router.get("/health")
def health():
    return {"ok": True, "model": config.LLM_MODEL, "llm_base_url": config.LLM_BASE_URL,
            "embed_model": config.EMBED_MODEL, "demo_employee_id": config.DEMO_EMPLOYEE_ID}


@router.get("/employees")
def employees():
    return [{"id": e["id"], "name": e.get("name", e["id"]), "role": e.get("role", "")}
            for e in store.read_json("employees.json", [])]


@router.post("/admin/reindex")
def reindex():
    return {"ok": True, "projects": 0, "chunks": 0}  # SKELETON
