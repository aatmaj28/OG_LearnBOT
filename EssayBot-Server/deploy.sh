#!/usr/bin/env bash
set -euo pipefail

# Detect env by folder (hardcoded -> no mistakes)
case "$PWD" in
  "/opt/Essaybot-server-UAT")
    APP_EXPRESS="essaybot-express-uat"
    APP_FLASK="essaybot-flask-uat"
    APP_WORKER="essaybot-worker-uat"
    NS="uat"
    DEFAULT_BRANCH="qdrant-migration"  # Updated to match workflow
    PM2_ENV=""  # don't pass --env production
    EXPRESS_PORT=8002
    FLASK_PORT=6001
    ;;
  "/opt/Essaybot-server")
    APP_EXPRESS="essaybot-express"
    APP_FLASK="essaybot-flask"
    APP_WORKER="essaybot-worker"
    NS="prod"
    DEFAULT_BRANCH="release/prod"  # PROD uses release/prod branch
    PM2_ENV="--env production"  # applies env_production
    EXPRESS_PORT=8001
    FLASK_PORT=6000
    ;;
  *)
    echo "❌ Unknown folder: $PWD"
    echo "   Expected: /opt/Essaybot-server or /opt/Essaybot-server-UAT"
    exit 1
    ;;
esac

BRANCH="${1:-$DEFAULT_BRANCH}"

echo "🚀 Deploying ESSAYBOT-SERVER (env=$NS, branch=$BRANCH) ..."

# --- Git update ---
git fetch --all
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# --- Node deps ---
echo "📦 Installing Node deps..."
if [[ -f package-lock.json ]]; then
  # Try npm ci first, fallback to npm install if lock file is out of sync
  if ! npm ci 2>/dev/null; then
    echo "⚠️ package-lock.json out of sync, using npm install..."
    npm install
  fi
else
  npm install
fi

# --- Python venv + deps ---
echo "🐍 Ensuring Python venv + deps..."
cd src/python
if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip3 install --upgrade pip
pip3 install -r requirements.txt
deactivate
cd ../..

# --- Logs dir ---
mkdir -p logs

# --- Prepare Qdrant storage directory ---
echo "📁 Ensuring Qdrant storage directory exists..."
STORAGE_DIR="$PWD/storage/qdrant"
mkdir -p "$STORAGE_DIR"
chmod 755 "$STORAGE_DIR" 2>/dev/null || sudo chmod 755 "$STORAGE_DIR" || true
echo "✅ Storage directory ready"

# --- Start Docker Compose services (RabbitMQ, Redis, Qdrant) ---
echo "🐳 Starting Docker Compose services..."
if [ -f docker-compose.yml ]; then
  # Stop and remove existing containers by explicit name to avoid conflicts
  # Try both with and without sudo to handle containers created either way
  echo "🧹 Cleaning up existing containers..."
  
  # First, try docker compose down (handles compose-managed containers)
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    sudo docker compose down 2>/dev/null || docker compose down 2>/dev/null || true
  elif command -v docker-compose >/dev/null 2>&1; then
    sudo docker-compose down 2>/dev/null || docker-compose down 2>/dev/null || true
  fi
  
  # Then explicitly stop and remove containers by name (handles containers created manually)
  for container in essaybot-rabbitmq essaybot-redis essaybot-qdrant; do
    echo "  Removing container: $container"
    # Try with sudo first, then without
    sudo docker stop "$container" 2>/dev/null || docker stop "$container" 2>/dev/null || true
    sudo docker rm -f "$container" 2>/dev/null || docker rm -f "$container" 2>/dev/null || true
    # Verify it's actually gone
    if sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$" || \
       docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
      echo "  ⚠️  Warning: Container $container still exists, forcing removal..."
      sudo docker rm -f "$container" 2>/dev/null || docker rm -f "$container" 2>/dev/null || true
    fi
  done
  
  # Wait a moment for cleanup to complete
  sleep 3
  
  # Verify containers are actually gone
  REMAINING_CONTAINERS=$(sudo docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '^(essaybot-rabbitmq|essaybot-redis|essaybot-qdrant)$' || docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '^(essaybot-rabbitmq|essaybot-redis|essaybot-qdrant)$' || true)
  if [ -n "$REMAINING_CONTAINERS" ]; then
    echo "  ⚠️  Warning: Some containers still exist, attempting force removal..."
    echo "$REMAINING_CONTAINERS" | while read -r container; do
      sudo docker rm -f "$container" 2>/dev/null || docker rm -f "$container" 2>/dev/null || true
    done
    sleep 2
  fi
  
  echo "  ✅ Cleanup complete"
  
  # Try Docker Compose V2 first (docker compose), fallback to V1 (docker-compose)
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    if docker compose up -d 2>/dev/null; then
      echo "✅ Docker services started (Docker Compose V2)"
    else
      echo "⚠️ Docker permission denied, trying with sudo..."
      sudo docker compose up -d
      echo "✅ Docker services started (Docker Compose V2 with sudo)"
    fi
  elif command -v docker-compose >/dev/null 2>&1; then
    if docker-compose up -d 2>/dev/null; then
      echo "✅ Docker services started (Docker Compose V1)"
    else
      echo "⚠️ Docker permission denied, trying with sudo..."
      sudo docker-compose up -d
      echo "✅ Docker services started (Docker Compose V1 with sudo)"
    fi
  else
    echo "❌ Neither 'docker compose' nor 'docker-compose' found. Please install Docker Compose."
    exit 1
  fi
else
  echo "⚠️ docker-compose.yml not found, skipping Docker services"
fi

# --- Update .env file if it exists (preserve but update critical vars) ---
if [ -f .env ]; then
  echo "⚠️  Existing .env file found - updating critical variables..."
  
  # Always update OLLAMA_URL and OLLAMA_MODEL_URL (critical for vLLM connectivity)
  # These should be set manually or via environment variables
  if [ -n "${OLLAMA_URL:-}" ]; then
    echo "  🔄 Updating OLLAMA_URL from environment variable..."
    sed -i.bak '/^OLLAMA_URL=/d' .env 2>/dev/null || sudo sed -i.bak '/^OLLAMA_URL=/d' .env
    echo "OLLAMA_URL=${OLLAMA_URL}" >> .env
    echo "  ✅ Updated OLLAMA_URL"
  fi
  
  if [ -n "${OLLAMA_MODEL_URL:-}" ]; then
    echo "  🔄 Updating OLLAMA_MODEL_URL from environment variable..."
    sed -i.bak '/^OLLAMA_MODEL_URL=/d' .env 2>/dev/null || sudo sed -i.bak '/^OLLAMA_MODEL_URL=/d' .env
    echo "OLLAMA_MODEL_URL=${OLLAMA_MODEL_URL}" >> .env
    echo "  ✅ Updated OLLAMA_MODEL_URL"
  else
    # If OLLAMA_MODEL_URL not set, try to derive from OLLAMA_URL
    if [ -n "${OLLAMA_URL:-}" ]; then
      OLLAMA_MODEL_URL_DERIVED=$(echo "$OLLAMA_URL" | sed 's|/v1/completions$||')
      echo "  🔄 Deriving OLLAMA_MODEL_URL from OLLAMA_URL: ${OLLAMA_MODEL_URL_DERIVED}"
      sed -i.bak '/^OLLAMA_MODEL_URL=/d' .env 2>/dev/null || sudo sed -i.bak '/^OLLAMA_MODEL_URL=/d' .env
      echo "OLLAMA_MODEL_URL=${OLLAMA_MODEL_URL_DERIVED}" >> .env
      echo "  ✅ Updated OLLAMA_MODEL_URL"
    fi
  fi
  
  # Fix common typo: /8000 should be :8000
  if grep -q 'OLLAMA_MODEL_URL=.*/8000' .env 2>/dev/null; then
    echo "  🔧 Fixing OLLAMA_MODEL_URL typo (replacing /8000 with :8000)..."
    sed -i.bak 's|OLLAMA_MODEL_URL="\([^"]*\)/8000"|OLLAMA_MODEL_URL="\1:8000"|g' .env 2>/dev/null || \
    sed -i.bak 's|OLLAMA_MODEL_URL=\([^ ]*\)/8000|OLLAMA_MODEL_URL=\1:8000|g' .env 2>/dev/null || \
    sudo sed -i.bak 's|OLLAMA_MODEL_URL="\([^"]*\)/8000"|OLLAMA_MODEL_URL="\1:8000"|g' .env || \
    sudo sed -i.bak 's|OLLAMA_MODEL_URL=\([^ ]*\)/8000|OLLAMA_MODEL_URL=\1:8000|g' .env
    echo "  ✅ Fixed OLLAMA_MODEL_URL typo"
  fi
  
  # Clean up backup files
  rm -f .env.bak 2>/dev/null || sudo rm -f .env.bak 2>/dev/null || true
  
  echo "  ℹ️  Preserved existing .env file with updated OLLAMA variables"
else
  echo "⚠️  No .env file found - you may need to create one manually"
fi

# --- Flush old PM2 logs ---
echo "🧹 Flushing PM2 logs..."
pm2 flush 2>/dev/null || true

# --- Start / Reload PM2 (zero downtime) ---
# Express
if pm2 describe "$APP_EXPRESS" >/dev/null 2>&1; then
  pm2 reload "$APP_EXPRESS" --namespace "$NS" --update-env
else
  NAMESPACE="$NS" pm2 start ecosystem.config.js $PM2_ENV --only "$APP_EXPRESS" --namespace "$NS"
fi

# Flask
if pm2 describe "$APP_FLASK" >/dev/null 2>&1; then
  pm2 reload "$APP_FLASK" --namespace "$NS" --update-env
else
  NAMESPACE="$NS" pm2 start ecosystem.config.js $PM2_ENV --only "$APP_FLASK" --namespace "$NS"
fi

# Workers
if pm2 describe "$APP_WORKER" >/dev/null 2>&1; then
  pm2 reload "$APP_WORKER" --namespace "$NS" --update-env
else
  NAMESPACE="$NS" pm2 start ecosystem.config.js $PM2_ENV --only "$APP_WORKER" --namespace "$NS"
fi

pm2 save
echo "✅ Backend deployment complete!"
pm2 status --namespace "$NS"
echo "🟢 Express on $EXPRESS_PORT   🐍 Flask on $FLASK_PORT   👷 Workers running"
