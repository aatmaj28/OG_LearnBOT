"""Projects and Git integration (P1): GET/POST /api/projects, POST /api/projects/{id}/members,
POST /api/projects/{id}/sync (not implemented yet). Records live in Backend/data/projects.json.

A project is cloned with `git clone --depth 1` into Backend/data/repos/{project_id} (or copied from a local
path), then indexed. An access token is used only inside the clone URL: it is removed from the stored remote and
from error messages, and is never logged or sent to the model.
"""
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.core import auth, store
from app.core.config import data_dir
from app.rag import index

router = APIRouter(prefix="/projects", tags=["projects"])
PROJECTS = "projects.json"


class ProjectIn(BaseModel):
    name: str
    git_url: str | None = None
    local_path: str | None = None
    branch: str = "main"
    token: str | None = None


class MembersIn(BaseModel):
    employee_ids: list[str]


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _git(args, cwd=None, secret=None, timeout=600):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout,
                       env={"GIT_TERMINAL_PROMPT": "0", "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"})
    if r.returncode != 0:
        err = (r.stderr or r.stdout).strip()
        if secret:
            err = err.replace(secret, "***")
        raise HTTPException(400, f"git {args[0]} failed: {err[-500:]}")
    return r.stdout.strip()


def _with_token(url, token):
    if not token:
        return url
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise HTTPException(400, "A token can only be used with an http(s) git URL")
    return urlunsplit(parts._replace(netloc=f"oauth2:{quote(token, safe='')}@{parts.hostname}"
                                     + (f":{parts.port}" if parts.port else "")))


def _slug(name):
    return "proj_" + (re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "project")


def _last_commit(repo):
    out = _git(["log", "-1", "--format=%H%x1f%s%x1f%an%x1f%cI"], cwd=repo)
    sha, message, author, date = out.split("\x1f")
    return {"sha": sha, "message": message, "author": author, "date": date}


def _projects():
    return store.read_json(PROJECTS, [])


def _save(project):
    projects = [p for p in _projects() if p["id"] != project["id"]] + [project]
    store.write_json(PROJECTS, projects)
    return project


def _find(project_id):
    for p in _projects():
        if p["id"] == project_id:
            return p
    raise HTTPException(404, f"Unknown project {project_id}")


def create(req: ProjectIn, project_id: str | None = None, members: list[str] | None = None) -> dict:
    if bool(req.git_url) == bool(req.local_path):
        raise HTTPException(400, "Give either git_url or local_path")
    pid = project_id or _slug(req.name)
    if any(p["id"] == pid for p in _projects()):
        raise HTTPException(409, f"Project {pid} already exists")
    repo = index.repo_dir(pid)
    shutil.rmtree(repo, ignore_errors=True)
    repo.parent.mkdir(parents=True, exist_ok=True)
    source = req.git_url or req.local_path
    _git(["clone", "--depth", "1", "--branch", req.branch, _with_token(source, req.token), str(repo)],
         secret=req.token)
    if req.token:  # don't leave the token in .git/config
        _git(["remote", "set-url", "origin", req.git_url], cwd=repo)
    commit = _last_commit(repo)
    counts = index.build_project(pid)
    return _save({"id": pid, "name": req.name, "git_url": req.git_url, "local_path": req.local_path,
                  "branch": req.branch, "members": members or [], "last_sha": commit["sha"],
                  "last_commit": commit, "last_synced": _now(), "file_count": counts["files"],
                  "chunk_count": counts["chunks"], "status": "ready", "error": None})


def project_ids_for(employee_id: str) -> list[str] | None:
    """Projects the employee can use: assigned directly or through one of their teams. None (all projects) when
    they have no assignment."""
    ids = {p["id"] for p in _projects() if employee_id in p.get("members", [])}
    for t in store.read_json("teams.json", []):
        if employee_id in t.get("member_ids", []):
            ids.update(t.get("project_ids", []))
    return sorted(ids) or None


# ---------------------------------------------------------------- project context (manager-provided docs)
CONTEXT_EXT = {".md", ".txt", ".rst", ".json", ".yaml", ".yml", ".csv", ".py", ".ts", ".tsx", ".js", ".sql", ".sh"}


def context_dir(project_id):
    return data_dir() / "context" / project_id


def list_context(project_id) -> list[dict]:
    d = context_dir(project_id)
    if not d.is_dir():
        return []
    return [{"name": f.name, "size": f.stat().st_size,
             "updated": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")}
            for f in sorted(d.iterdir()) if f.is_file()]


def _index_context(project_id):
    return index.build(f"ctx_{project_id}", context_dir(project_id), project_id, "doc")


@router.get("/{project_id}/context")
def get_context(project_id: str):
    _find(project_id)
    return list_context(project_id)


@router.get("/{project_id}/context/{name}")
def read_context(project_id: str, name: str):
    f = (context_dir(project_id) / name).resolve()
    if not f.is_file() or not f.is_relative_to(context_dir(project_id).resolve()):
        raise HTTPException(404, "Not found")
    return {"name": name, "text": f.read_text(encoding="utf-8", errors="replace")}


@router.post("/{project_id}/context")
async def add_context(project_id: str, title: str = Form(""), text: str = Form(""),
                      files: list[UploadFile] = File(default=[]), manager: dict = Depends(auth.require_manager)):
    """Add context for a project: pasted text (title + text) and/or uploaded text files. Re-indexes the
    project's context so the Ask Agent can cite it."""
    _find(project_id)
    d = context_dir(project_id)
    d.mkdir(parents=True, exist_ok=True)
    saved = []
    if text.strip():
        name = (re.sub(r"[^A-Za-z0-9_-]+", "-", title.strip()).strip("-") or "note") + ".md"
        (d / name).write_text(f"# {title.strip() or 'Note'}\n\n{text.strip()}\n", encoding="utf-8")
        saved.append(name)
    for up in files:
        name = re.sub(r"[^A-Za-z0-9_.-]+", "-", up.filename or "file").strip("-.") or "file"
        if os.path.splitext(name)[1].lower() not in CONTEXT_EXT:
            raise HTTPException(400, f"{name}: only text files ({', '.join(sorted(CONTEXT_EXT))})")
        data = await up.read()
        if len(data) > 2_000_000:
            raise HTTPException(400, f"{name}: larger than 2 MB")
        (d / name).write_bytes(data)
        saved.append(name)
    if not saved:
        raise HTTPException(400, "Paste some text or choose a file")
    counts = await run_in_threadpool(_index_context, project_id)
    return {"saved": saved, "context": list_context(project_id), "chunks": counts["chunks"]}


@router.get("")
def list_projects():
    return _projects()


class NewProjectIn(ProjectIn):
    team_id: str | None = None


@router.post("")
async def create_project(req: NewProjectIn, manager: dict = Depends(auth.require_manager)):
    """Clone + index a repository; optionally attach it to one of the manager's teams."""
    p = await run_in_threadpool(create, req)
    if req.team_id:
        teams = store.read_json("teams.json", [])
        for t in teams:
            if t["id"] == req.team_id and t["manager_id"] == manager["id"] and p["id"] not in t["project_ids"]:
                t["project_ids"].append(p["id"])
        store.write_json("teams.json", teams)
    return p


@router.post("/{project_id}/members")
def set_members(project_id: str, req: MembersIn):
    p = _find(project_id)
    p["members"] = sorted(set(req.employee_ids))
    return _save(p)


@router.post("/{project_id}/sync")
def sync_project(project_id: str):
    _find(project_id)
    raise HTTPException(501, "Sync is not implemented yet")
