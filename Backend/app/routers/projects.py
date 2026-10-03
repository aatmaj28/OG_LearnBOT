"""Projects and Git integration (P1): GET/POST /api/projects, POST /api/projects/{id}/sync, POST /api/projects/{id}/members.

SKELETON: lists Backend/data/projects.json; the write endpoints land on AJ.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core import store

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str
    git_url: str | None = None
    local_path: str | None = None
    branch: str = "main"
    token: str | None = None


class MembersIn(BaseModel):
    employee_ids: list[str]


@router.get("")
def list_projects():
    return store.read_json("projects.json", [])


@router.post("")
def create_project(req: ProjectIn):
    raise HTTPException(501, "Not implemented yet (skeleton)")


@router.post("/{project_id}/sync")
def sync_project(project_id: str):
    raise HTTPException(501, "Not implemented yet (skeleton)")


@router.post("/{project_id}/members")
def set_members(project_id: str, req: MembersIn):
    raise HTTPException(501, "Not implemented yet (skeleton)")
