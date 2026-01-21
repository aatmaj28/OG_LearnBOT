#!/usr/bin/env bash
set -euo pipefail

# Detect env by folder (hardcoded -> no mistakes)
case "$PWD" in
  "/opt/Learnbot-Server-UAT")
    APP_FLASK="learnbot-flask-uat"
    NS="uat"
    DEFAULT_BRANCH="dynamic-update"
    PM2_ENV=""  # don't pass --env production
    FLASK_PORT=5001
    ;;
  "/opt/Learnbot-Server")
    APP_FLASK="learnbot-flask"
    NS="prod"
    DEFAULT_BRANCH="main"
    PM2_ENV="--env production"  # applies env_production
    FLASK_PORT=5000
    ;;
  *)
    echo "❌ Unknown folder: $PWD"
    echo "   Expected: /opt/Learnbot-Server or /opt/Learnbot-Server-UAT"
    exit 1
    ;;
esac

BRANCH="${1:-$DEFAULT_BRANCH}"

echo "🚀 Deploying LearnBot Server (env=$NS, branch=$BRANCH) ..."

# --- Git update ---
git fetch --all
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# --- Python venv + deps ---
echo "🐍 Ensuring Python venv + deps..."
if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip3 install --upgrade pip
pip3 install -r requirements.txt
deactivate

# --- Logs dir ---
mkdir -p logs

# --- Flush old PM2 logs ---
echo "🧹 Flushing PM2 logs..."
pm2 flush 2>/dev/null || true

# --- Start / Reload PM2 (zero downtime) ---
# Flask
if pm2 describe "$APP_FLASK" >/dev/null 2>&1; then
  pm2 reload "$APP_FLASK" --namespace "$NS" --update-env
else
  NAMESPACE="$NS" pm2 start ecosystem.config.js $PM2_ENV --only "$APP_FLASK" --namespace "$NS"
fi

pm2 save
echo "✅ Backend deployment complete!"
pm2 status --namespace "$NS"
echo "🐍 Flask on $FLASK_PORT"
