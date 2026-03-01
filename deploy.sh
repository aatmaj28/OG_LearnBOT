#!/usr/bin/env bash
set -euo pipefail

# Detect env by folder (hardcoded -> no mistakes)
case "$PWD" in
  "/opt/Learnbot-Server-UAT")
    APP_FLASK="learnbot-flask-uat"
    NS="uat"
    DEFAULT_BRANCH="dynamic-update"
    PM2_ENV=""  # don't pass --env production
    FLASK_PORT=8031
    ;;
  "/opt/Learnbot-Server")
    APP_FLASK="learnbot-flask"
    NS="prod"
    DEFAULT_BRANCH="main"
    PM2_ENV="--env production"  # applies env_production
    FLASK_PORT=8030
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

# --- Prepare Qdrant storage directory ---
echo "📁 Ensuring Qdrant storage directory exists..."
STORAGE_DIR="$PWD/../vector-stores/qdrant"
if [[ ! -f docker-compose.yml ]] && [[ -f ../docker-compose.yml ]]; then
    STORAGE_DIR="../vector-stores/qdrant"
fi
mkdir -p "$STORAGE_DIR"
chmod 755 "$STORAGE_DIR" 2>/dev/null || sudo chmod 755 "$STORAGE_DIR" || true
echo "✅ Storage directory ready: $STORAGE_DIR"

# --- Start Docker Compose services (Qdrant + RabbitMQ) ---
echo "🐳 Starting Docker Compose services..."
COMPOSE_FILE=""
if [[ -f docker-compose.yml ]]; then
    COMPOSE_FILE="docker-compose.yml"
elif [[ -f ../docker-compose.yml ]]; then
    COMPOSE_FILE="../docker-compose.yml"
fi

if [[ -n "$COMPOSE_FILE" ]]; then
    # Try Docker Compose V2 first (docker compose), fallback to V1 (docker-compose)
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        COMPOSE_DIR=$(dirname "$COMPOSE_FILE")
        if [[ "$COMPOSE_DIR" == ".." ]]; then
            COMPOSE_DIR=".."
        else
            COMPOSE_DIR="."
        fi
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD="docker-compose"
        COMPOSE_DIR=$(dirname "$COMPOSE_FILE")
        if [[ "$COMPOSE_DIR" == ".." ]]; then
            COMPOSE_DIR=".."
        else
            COMPOSE_DIR="."
        fi
    else
        echo "❌ Neither 'docker compose' nor 'docker-compose' found. Please install Docker Compose."
        exit 1
    fi
    
    # Clean up existing containers to avoid conflicts
    echo "🧹 Cleaning up existing containers..."
    if [[ "$COMPOSE_DIR" == ".." ]]; then
        (cd .. && $COMPOSE_CMD down 2>/dev/null || true)
        sudo docker stop learnbot-qdrant 2>/dev/null || docker stop learnbot-qdrant 2>/dev/null || true
        sudo docker rm -f learnbot-qdrant 2>/dev/null || docker rm -f learnbot-qdrant 2>/dev/null || true
        sudo docker stop learnbot-rabbitmq 2>/dev/null || docker stop learnbot-rabbitmq 2>/dev/null || true
        sudo docker rm -f learnbot-rabbitmq 2>/dev/null || docker rm -f learnbot-rabbitmq 2>/dev/null || true
    else
        $COMPOSE_CMD down 2>/dev/null || true
        sudo docker stop learnbot-qdrant 2>/dev/null || docker stop learnbot-qdrant 2>/dev/null || true
        sudo docker rm -f learnbot-qdrant 2>/dev/null || docker rm -f learnbot-qdrant 2>/dev/null || true
        sudo docker stop learnbot-rabbitmq 2>/dev/null || docker stop learnbot-rabbitmq 2>/dev/null || true
        sudo docker rm -f learnbot-rabbitmq 2>/dev/null || docker rm -f learnbot-rabbitmq 2>/dev/null || true
    fi
    sleep 2
    
    # Start all services (Qdrant + RabbitMQ)
    echo "🚀 Starting Qdrant + RabbitMQ containers..."
    if [[ "$COMPOSE_DIR" == ".." ]]; then
        if (cd .. && $COMPOSE_CMD up -d 2>/dev/null); then
            echo "✅ Containers started (Docker Compose)"
        else
            echo "⚠️ Docker permission denied, trying with sudo..."
            (cd .. && sudo $COMPOSE_CMD up -d)
            echo "✅ Containers started (Docker Compose with sudo)"
        fi
    else
        if $COMPOSE_CMD up -d 2>/dev/null; then
            echo "✅ Containers started (Docker Compose)"
        else
            echo "⚠️ Docker permission denied, trying with sudo..."
            sudo $COMPOSE_CMD up -d
            echo "✅ Containers started (Docker Compose with sudo)"
        fi
    fi
    
    # Wait for services to be ready
    echo "⏳ Waiting for services to be ready..."
    sleep 5
    
    # Verify Qdrant health (LearnBot uses host port 6335 per docker-compose)
    if curl -f http://localhost:6335/health >/dev/null 2>&1; then
        echo "✅ Qdrant is healthy (port 6335)"
    else
        echo "⚠️  Warning: Qdrant health check failed (may still be starting)"
        echo "   Check logs with: docker logs learnbot-qdrant"
    fi

    # Verify RabbitMQ health (LearnBot uses host port 5673)
    if curl -f http://localhost:15673/api/health/checks/alarms -u learnbot:learnbot123 >/dev/null 2>&1; then
        echo "✅ RabbitMQ is healthy (port 5673)"
    else
        echo "⚠️  Warning: RabbitMQ health check failed (may still be starting)"
        echo "   Check logs with: docker logs learnbot-rabbitmq"
    fi
else
    echo "⚠️ docker-compose.yml not found - container management skipped"
    echo "   Expected location: ./docker-compose.yml or ../docker-compose.yml"
fi

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
