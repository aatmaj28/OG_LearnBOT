"""Browse a project's files (see CONTRACTS.md › Shared Python helpers).

    list_files(project_id) -> ["Backend/app/main.py", ...]
    get_file(project_id, path) -> {"path", "text"}

Also accepts the project-less calls list_files() and get_file(path) (every project), which app/learn uses.
Reads the clones in Backend/data/repos/{project_id}/; falls back to sample files when nothing is cloned.
"""
import os

from app.core.config import data_dir
from app.rag import ingest
from app.rag.sample import SAMPLE_CHUNKS


def _projects():
    d = data_dir() / "repos"
    return sorted(p.name for p in d.iterdir() if p.is_dir()) if d.is_dir() else []


def list_files(project_id=None) -> list[str]:
    ids = [project_id] if project_id else _projects()
    files = set()
    for pid in ids:
        root = data_dir() / "repos" / pid
        if root.is_dir():
            files.update(ingest.walk(str(root)))
    if not files and not _projects():
        files = {c["path"] for c in SAMPLE_CHUNKS}
    return sorted(files)


def get_file(project_id, path=None) -> dict:
    if path is None:  # get_file(path)
        project_id, path = None, project_id
    for pid in ([project_id] if project_id else _projects()):
        root = (data_dir() / "repos" / pid).resolve()
        full = (root / path).resolve()
        if full.is_file() and full.is_relative_to(root):
            text = ingest.read_text(str(full))
            if text is None:
                raise FileNotFoundError(f"{path} is a binary file")
            return {"path": path, "text": text}
    if not _projects():
        for c in SAMPLE_CHUNKS:
            if c["path"] == path:
                return {"path": path, "text": c["text"]}
    raise FileNotFoundError(path)
