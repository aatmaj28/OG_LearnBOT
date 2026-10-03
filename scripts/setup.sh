#!/usr/bin/env bash
# One-time local setup: env files, Backend virtualenv, npm packages. Safe to re-run.
# Set ANTHROPIC_API_KEY in your shell first to have it written into the env files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

step "Checking prerequisites"
command -v node >/dev/null || { echo "Node.js 20+ is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker (Docker Desktop or colima) is required" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose is required. With colima/Homebrew: brew install docker-compose" >&2
  exit 1
}
echo "  node $(node -v), $(docker --version), $(docker compose version)"

step "Creating env files"
render() { # <template> <target>
  if [ -f "$2" ]; then
    echo "  $2 already exists, leaving it alone"
    return
  fi
  sed -e "s|__REPO_ROOT__|$ROOT|g" \
      -e "s|__SECRET_KEY__|$(openssl rand -hex 32)|g" \
      -e "s|__ANTHROPIC_API_KEY__|${ANTHROPIC_API_KEY:-}|g" \
      "$1" > "$2"
  echo "  wrote $2"
}
render scripts/env/backend.env Backend/.env
render scripts/env/frontend.env.local Frontend/.env.local

step "Setting up Backend Python environment (Backend/.venv)"
# The backend uses `X | None` annotations at import time, so Python 3.10+ is required
if command -v uv >/dev/null; then
  [ -x Backend/.venv/bin/python ] || uv venv --python 3.11 Backend/.venv
  uv pip install --python Backend/.venv/bin/python -r Backend/requirements.txt
else
  PY="$(command -v python3.12 || command -v python3.11 || command -v python3.10 || true)"
  [ -n "$PY" ] || { echo "Python 3.10+ is required (or install uv: https://docs.astral.sh/uv/)" >&2; exit 1; }
  [ -x Backend/.venv/bin/python ] || "$PY" -m venv Backend/.venv
  Backend/.venv/bin/pip install -r Backend/requirements.txt
fi

step "Installing npm packages"
npm install
npm --prefix Frontend install

step "Done"
if grep -qE '^ANTHROPIC_API_KEY=$' Backend/.env; then
  echo "  Add your ANTHROPIC_API_KEY to Backend/.env (and Frontend/.env.local) so chat can reach Claude."
fi
echo "  Start everything with: npm run dev"
