"""GET /api/files?project_id= and GET /api/files/content?project_id=&path= (P1)."""
from fastapi import APIRouter, HTTPException

from app.rag import files as rag_files

router = APIRouter(prefix="/files", tags=["files"])


@router.get("")
def list_files(project_id: str | None = None):
    return rag_files.list_files(project_id)


@router.get("/content")
def content(path: str, project_id: str | None = None):
    try:
        return rag_files.get_file(project_id, path)
    except FileNotFoundError:
        raise HTTPException(404, f"File not found: {path}")
