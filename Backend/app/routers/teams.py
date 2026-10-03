"""Teams (manager portal): GET /api/teams (the signed-in manager's teams, with projects and their context),
POST /api/teams, POST /api/teams/{id}/projects (attach a project), GET /api/my/teams (employee view).

Data: Backend/data/teams.json [{"id", "name", "manager_id", "description", "member_ids", "project_ids"}].
"""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import auth, store
from app.routers import projects as projects_router

router = APIRouter(tags=["teams"])
TEAMS = "teams.json"


def all_teams() -> list[dict]:
    return store.read_json(TEAMS, [])


def _save_all(teams):
    store.write_json(TEAMS, teams)


def _expand(team, projects_by_id, employees_by_id):
    return {**team,
            "members": [{"id": i, "name": employees_by_id.get(i, {}).get("name", i),
                         "role": employees_by_id.get(i, {}).get("role", "")} for i in team.get("member_ids", [])],
            "projects": [{**projects_by_id[p], "context": projects_router.list_context(p)}
                         for p in team.get("project_ids", []) if p in projects_by_id]}


def _expanded(teams):
    projects_by_id = {p["id"]: p for p in store.read_json("projects.json", [])}
    employees_by_id = {e["id"]: e for e in store.read_json("employees.json", [])}
    return [_expand(t, projects_by_id, employees_by_id) for t in teams]


def _own_team(team_id, manager):
    teams = all_teams()
    t = next((t for t in teams if t["id"] == team_id), None)
    if not t:
        raise HTTPException(404, "Unknown team")
    if t["manager_id"] != manager["id"]:
        raise HTTPException(403, "Not your team")
    return teams, t


class TeamIn(BaseModel):
    name: str
    description: str = ""
    member_ids: list[str] = []


class AttachIn(BaseModel):
    project_id: str


@router.get("/teams")
def my_managed_teams(manager: dict = Depends(auth.require_manager)):
    return _expanded([t for t in all_teams() if t["manager_id"] == manager["id"]])


@router.post("/teams")
def create_team(req: TeamIn, manager: dict = Depends(auth.require_manager)):
    teams = all_teams()
    tid = "team_" + (re.sub(r"[^a-z0-9]+", "_", req.name.lower()).strip("_") or "team")
    if any(t["id"] == tid for t in teams):
        raise HTTPException(409, "A team with that name exists")
    team = {"id": tid, "name": req.name, "manager_id": manager["id"], "description": req.description,
            "member_ids": req.member_ids, "project_ids": []}
    _save_all(teams + [team])
    return _expanded([team])[0]


@router.post("/teams/{team_id}/projects")
def attach_project(team_id: str, req: AttachIn, manager: dict = Depends(auth.require_manager)):
    teams, t = _own_team(team_id, manager)
    projects_router._find(req.project_id)
    if req.project_id not in t["project_ids"]:
        t["project_ids"].append(req.project_id)
    _save_all(teams)
    return _expanded([t])[0]


@router.get("/my/teams")
def my_teams(user: dict = Depends(auth.current_user)):
    eid = user.get("employee_id") or user["id"]
    return _expanded([t for t in all_teams() if eid in t.get("member_ids", [])])
