"""Settings from the environment and the repo-root .env (see CONTRACTS.md › Env).

python-dotenv isn't in the allowed packages, so .env is parsed here: KEY=VALUE lines, # comments, optional
quotes. Variables already set in the environment win over .env.
"""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../Backend
REPO_ROOT = BACKEND_DIR.parent


def _load_dotenv(path: Path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].strip()  # inline comment (needs a space before #)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


_load_dotenv(REPO_ROOT / ".env")

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:21434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "nemotron-3.5-lightning:30b")
LLM_API_KEY = os.getenv("LLM_API_KEY", "local")
EMBED_URL = os.getenv("EMBED_URL", "http://localhost:21434/api/embed")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nemotron-embed-1b-v2")
OLLAMA_PROXY_TOKEN = os.getenv("OLLAMA_PROXY_TOKEN", "")
DEMO_EMPLOYEE_ID = os.getenv("DEMO_EMPLOYEE_ID", "emp_demo")
# Built frontend (next build with STATIC_EXPORT=1) served at /
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", str(REPO_ROOT / "Frontend" / "out")))


def data_dir() -> Path:
    """DATA_DIR resolved the same way as app.analytics.data.data_dir(): as given (relative to the working
    directory), then relative to the repo root, then to Backend/. Defaults to Backend/data."""
    env = os.getenv("DATA_DIR")
    if env:
        for p in (Path(env), REPO_ROOT / env, BACKEND_DIR / env):
            if p.is_dir():
                return p.resolve()
    return BACKEND_DIR / "data"
