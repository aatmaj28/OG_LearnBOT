"""OnboardAI FastAPI app: every router under /api, plus the built frontend at /.

Dev (from Backend/):  .venv-app/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
Prod (GB10 sandbox):  uvicorn app.main:app --host 127.0.0.1 --port 8000   (see deploy.sh)
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.core import config
from app.routers import admin, analytics, auth, chat, feedback, files, learn, projects, team, teams

app = FastAPI(title="OnboardAI", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",  # next dev, SSH-tunnelled browsers
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, chat, files, admin, projects, teams, learn, feedback, analytics, team):
    app.include_router(module.router, prefix="/api")


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
def api_not_found(path: str):
    raise HTTPException(404, f"No API route /api/{path}")


def _frontend_file(path: str):
    """Maps a URL path to the static export: /x -> x, x.html or x/index.html (trailingSlash builds)."""
    root = config.FRONTEND_DIR.resolve()
    rel = path.strip("/")
    for candidate in ((rel,) if rel else ()) + (f"{rel}.html", f"{rel}/index.html" if rel else "index.html"):
        f = (root / candidate).resolve()
        if f.is_file() and f.is_relative_to(root):
            return f
    return None


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if not config.FRONTEND_DIR.is_dir():
        return JSONResponse({"ok": True, "message": "OnboardAI API. Build the frontend (npm run build:web) to serve "
                             f"the UI from {config.FRONTEND_DIR}; the API is under /api."})
    f = _frontend_file(path)
    if f is None:
        f = _frontend_file("404")
        return FileResponse(f, status_code=404) if f else JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse(f)
