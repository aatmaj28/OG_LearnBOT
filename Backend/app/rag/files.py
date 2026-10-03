"""Browse a project's files (see CONTRACTS.md › Shared Python helpers).

    list_files(project_id) -> ["Backend/app/main.py", ...]
    get_file(project_id, path) -> {"path", "text"}

Also accepts the project-less calls list_files() and get_file(path) (all projects), which app/learn uses.

SKELETON: serves sample files. The real version reads Backend/data/repos/{project_id}/ on AJ.
"""
from app.rag.sample import SAMPLE_CHUNKS


def list_files(project_id=None) -> list[str]:
    return sorted({c["path"] for c in SAMPLE_CHUNKS if project_id in (None, c["project_id"])})


def get_file(project_id, path=None) -> dict:
    if path is None:  # get_file(path)
        project_id, path = None, project_id
    for c in SAMPLE_CHUNKS:
        if c["path"] == path and project_id in (None, c["project_id"]):
            return {"path": path, "text": c["text"]}
    raise FileNotFoundError(path)
