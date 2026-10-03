#!/usr/bin/env bash
# Runs `docker "$@"` from the repo root. If the default Docker endpoint is down but a
# colima context exists (common on macOS without Docker Desktop), uses colima instead.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DOCKER_HOST:-}${DOCKER_CONTEXT:-}" ] && ! docker info >/dev/null 2>&1; then
  if docker context inspect colima >/dev/null 2>&1; then
    export DOCKER_CONTEXT=colima
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop or run \`colima start\`, then try again." >&2
  exit 1
fi

exec docker "$@"
