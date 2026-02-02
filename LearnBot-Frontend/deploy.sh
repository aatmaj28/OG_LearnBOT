#!/usr/bin/env bash
set -euo pipefail

APP="learnbot-ui"

case "$PWD" in
  "/var/www/Learnbot-UI-UAT")
    APP="learnbot-ui-uat"
    NS="uat"
    DEFAULT_BRANCH="dynamic-update"
    PM2_ENV=""                       # don't pass --env production
    ;;
  "/var/www/Learnbot-UI")
    APP="learnbot-ui"
    NS="prod"
    DEFAULT_BRANCH="main"
    PM2_ENV="--env production"       # use env_production from ecosystem
    ;;
  *)
    echo "❌ Unknown folder: $PWD"
    echo "   Expected: /var/www/Learnbot-UI or /var/www/Learnbot-UI-UAT"
    exit 1
    ;;
esac

BRANCH="${1:-$DEFAULT_BRANCH}"

echo "🎨 Deploying LearnBot UI (env=$NS, branch=$BRANCH) ..."

# Git update to the requested branch
git fetch --all
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Install & build
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

# Ensure logs dir
mkdir -p logs

# Start or zero-downtime reload in the right namespace
if pm2 describe "$APP" --namespace "$NS" >/dev/null 2>&1; then
  pm2 reload "$APP" --namespace "$NS" --update-env
else
  NAMESPACE="$NS" pm2 start ecosystem.config.js $PM2_ENV --namespace "$NS"
fi

pm2 save
pm2 status "$APP" --namespace "$NS"
echo "✅ Done (env=$NS, branch=$BRANCH)"
