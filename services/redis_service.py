"""
Redis service for LearnBOT task management and real-time streaming.

Two responsibilities:
1. Task status storage: learnbot:task:<id> — lifecycle tracking (queued → processing → completed/failed)
2. Real-time streaming: learnbot:stream:<id> — pub/sub for token-by-token streaming to SSE endpoint

All keys are prefixed with 'learnbot:' to avoid collisions with EssayBOT's Redis usage.
"""

import json
import os
import time
import redis

# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_PREFIX = os.getenv("REDIS_KEY_PREFIX", "learnbot")
_TASK_TTL = 3600  # Keys expire after 1 hour (auto-cleanup)

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Get or create a Redis connection (lazy singleton)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(_REDIS_URL, decode_responses=True)
    return _redis_client


def is_redis_available() -> bool:
    """Check if Redis is reachable."""
    try:
        get_redis().ping()
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Task Status (key: learnbot:task:<task_id>)
# ---------------------------------------------------------------------------

def _task_key(task_id: str) -> str:
    return f"{_PREFIX}:task:{task_id}"


def set_task_status(task_id: str, status: str, data: dict | None = None) -> None:
    """Create or update task status in Redis."""
    r = get_redis()
    payload = {
        "status": status,
        "updatedAt": time.time(),
    }
    if data:
        payload.update(data)
    r.set(_task_key(task_id), json.dumps(payload), ex=_TASK_TTL)


def get_task_status(task_id: str) -> dict | None:
    """Get task status from Redis. Returns None if task doesn't exist."""
    r = get_redis()
    raw = r.get(_task_key(task_id))
    if raw is None:
        return None
    return json.loads(raw)


def create_task(task_id: str, request_data: dict) -> None:
    """Initialize a task as 'queued' in Redis."""
    set_task_status(task_id, "queued", {
        "createdAt": time.time(),
        "sessionId": request_data.get("conversation_id", ""),
    })


def complete_task(task_id: str, result: dict) -> None:
    """Mark a task as completed with its result."""
    set_task_status(task_id, "completed", {
        "result": result,
        "completedAt": time.time(),
    })


def fail_task(task_id: str, error: str) -> None:
    """Mark a task as failed with an error message."""
    set_task_status(task_id, "failed", {
        "error": error,
        "failedAt": time.time(),
    })


# ---------------------------------------------------------------------------
# Streaming (pub/sub channel: learnbot:stream:<task_id>)
# ---------------------------------------------------------------------------

def _stream_channel(task_id: str) -> str:
    return f"{_PREFIX}:stream:{task_id}"


def publish_chunk(task_id: str, chunk_data: dict) -> None:
    """Publish a streaming chunk to the task's pub/sub channel."""
    r = get_redis()
    r.publish(_stream_channel(task_id), json.dumps(chunk_data, ensure_ascii=False))


def subscribe_to_stream(task_id: str):
    """
    Subscribe to a task's streaming channel.
    Returns a pubsub object. Caller should iterate with .listen().
    """
    r = get_redis()
    ps = r.pubsub()
    ps.subscribe(_stream_channel(task_id))
    return ps
