"""GET /api/health, GET /api/employees, POST /api/admin/reindex (P1)."""
from fastapi import APIRouter

from app.core import config, store
from app.rag import index

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
    """Rebuilds every project index plus data/docs and data/meetings."""
    projects = store.read_json("projects.json", [])
    chunks = 0
    for p in projects:
        counts = index.build_project(p["id"])
        p.update(file_count=counts["files"], chunk_count=counts["chunks"])
        chunks += counts["chunks"]
    store.write_json("projects.json", projects)
    extras = index.build_extras()
    return {"ok": True, "projects": len(projects), "chunks": chunks + sum(e["chunks"] for e in extras.values())}
