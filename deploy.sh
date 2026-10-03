#!/usr/bin/env bash
# Deploy LearnBOT into the GB10's plan-a OpenShell sandbox (SETUP-GB10.md section 10) and run it on 127.0.0.1:8000.
#
#   ./deploy.sh              build the frontend, upload code + data, restart, health check
#   SKIP_BUILD=1 ./deploy.sh reuse Frontend/out
#
# Project repos and their indexes (Backend/data/repos, Backend/data/index) are shipped from this machine:
# the sandbox has no route to GitHub (default-deny policy), so repos are cloned and indexed here or on the host.
# Runtime data in the sandbox (events, memory, chats, learn sessions, manager context, meetings, repos added in
# the UI) is kept across deploys: code and the static build are replaced, data is only added or overwritten.
set -euo pipefail
cd "$(dirname "$0")"

GB10="${GB10:-dell@172.20.65.152}"
SANDBOX="${SANDBOX:-plan-a}"
APP=/sandbox/learnbot
STAGE="learnbot-deploy"   # staging dir in the GB10 user's home
SSH=(ssh -o BatchMode=yes "$GB10")

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

if [ -z "${SKIP_BUILD:-}" ]; then
  step "Building the static frontend"
  npm --prefix Frontend run build:static >/dev/null
fi

step "Staging code and data"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/learnbot/Backend" "$TMP/learnbot/Frontend"
rsync -a --exclude '__pycache__' Backend/app Backend/requirements-app.txt "$TMP/learnbot/Backend/"
rsync -a --exclude 'events.jsonl' --exclude 'memory' --exclude 'learn_sessions.json' --exclude '.git' \
  --exclude 'chats' --exclude 'context' --exclude 'meetings/mtg_*' --exclude '.auth_secret' --exclude 'index/ctx_*' \
  Backend/data "$TMP/learnbot/Backend/"
rsync -a Frontend/out "$TMP/learnbot/Frontend/"
cat > "$TMP/learnbot/.env" <<'EOF'
# Production (GB10 sandbox). OLLAMA_PROXY_TOKEN comes from the sandbox environment, not this file.
LLM_BASE_URL=https://inference.local/v1
LLM_MODEL=nemotron-3.5-lightning:30b
LLM_API_KEY=local
EMBED_URL=http://host.openshell.internal:11435/api/embed
EMBED_MODEL=nemotron-embed-1b-v2
DATA_DIR=/sandbox/learnbot/Backend/data
FRONTEND_DIR=/sandbox/learnbot/Frontend/out
DEMO_EMPLOYEE_ID=emp_demo
EOF
du -sh "$TMP/learnbot" | sed 's/^/  size: /'

step "Copying to $GB10:~/$STAGE"
"${SSH[@]}" "rm -rf ~/$STAGE && mkdir -p ~/$STAGE"
rsync -az "$TMP/learnbot" "$GB10:$STAGE/"

# openshell exec over SSH needs stdin from /dev/null or it hangs (SETUP-GB10.md section 10)
step "Uploading into sandbox $SANDBOX and installing dependencies offline"
"${SSH[@]}" bash -s <<EOF
set -e
export PATH="\$HOME/.local/bin:\$PATH"
X="openshell sandbox exec -n $SANDBOX --no-tty --"
\$X sh -c 'pkill -f "[u]vicorn app.main:app" || true; pkill -f "[u]vicorn server:app" || true; rm -rf $APP/Backend/app $APP/Frontend/out' < /dev/null
tmux kill-session -t learnbot 2>/dev/null || true
tmux kill-session -t plan-a 2>/dev/null || true
openshell sandbox upload $SANDBOX ~/$STAGE/learnbot /sandbox --no-git-ignore < /dev/null | tail -1
\$X sh -c 'test -x /sandbox/agent-venv/bin/python || python3 -m venv /sandbox/agent-venv; /sandbox/agent-venv/bin/pip install -q --no-index --find-links /sandbox/python-wheels -r $APP/Backend/requirements-app.txt' < /dev/null
\$X sh -c 'test -n "\$OLLAMA_PROXY_TOKEN" && echo "  OLLAMA_PROXY_TOKEN is set in the sandbox" || echo "  WARNING: OLLAMA_PROXY_TOKEN missing (embeddings will fail)"' < /dev/null
EOF

step "Starting uvicorn in tmux session 'learnbot' (sandbox 127.0.0.1:8000)"
"${SSH[@]}" bash -s <<EOF
set -e
export PATH="\$HOME/.local/bin:\$PATH"
cat > ~/learnbot-server.sh <<'SH'
#!/usr/bin/env bash
export PATH="\$HOME/.local/bin:\$PATH"
openshell sandbox exec -n $SANDBOX --no-tty -- sh -c 'cd $APP/Backend && exec /sandbox/agent-venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000'
echo "learnbot exited (\$?) - press Enter"; read -r _
SH
chmod +x ~/learnbot-server.sh
tmux new-session -d -s learnbot ~/learnbot-server.sh
openshell forward list 2>/dev/null | grep -q " 8000 .*running" || openshell forward start 8000 $SANDBOX -d < /dev/null > /dev/null 2>&1
for i in \$(seq 1 60); do curl -sf -m 2 http://127.0.0.1:8000/api/health > /dev/null && break; sleep 1; done
echo "  health: \$(curl -s -m 5 http://127.0.0.1:8000/api/health)"
EOF

step "Done"
echo "  GB10:   http://127.0.0.1:8000/  (tmux attach -t learnbot)"
echo "  Laptop: ssh -N -L 18000:127.0.0.1:8000 $GB10, then http://localhost:18000/"
