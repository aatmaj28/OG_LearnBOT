#!/usr/bin/env python3
"""
LearnBOT Chat Worker — Thin HTTP Dispatcher

Consumes chat tasks from RabbitMQ (learnbot.chat.queue) and dispatches them
to the Flask internal endpoint via HTTP. Flask handles the actual RAG processing,
Redis streaming, and DB saves.

Architecture: EssayBot pattern — workers are lightweight dispatchers (~36 MB),
all ML models load once in Flask/Gunicorn (gthread) instead of per-worker.

Memory comparison:
  Before: 5 workers × 1.4 GB each = 7.0 GB (each loaded PyTorch + embedding model)
  After:  5 workers × ~36 MB each = 180 MB (just pika + requests + redis)
         + Flask/Gunicorn loads RAG once = ~2.8 GB (2 gthread processes × 1.4 GB)
  Total saved: ~4 GB

Usage:
    python worker.py                       # Run single worker instance
    pm2 start ecosystem.config.js          # Run 5 instances via PM2
"""

import json
import os
import sys
import time
import signal
import traceback
from concurrent.futures import ThreadPoolExecutor, Future
from threading import Lock

# Add parent directory to path so we can import from services/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

import pika
import requests

from services import redis_service

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

NAMESPACE = os.getenv("NAMESPACE", "uat")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://learnbot:learnbot123@localhost:5673")
EXCHANGE_NAME = os.getenv("RABBITMQ_EXCHANGE", f"learnbot.{NAMESPACE}.chat")
QUEUE_NAME = os.getenv("RABBITMQ_QUEUE", f"learnbot.{NAMESPACE}.chat.queue")
ROUTING_KEY = f"learnbot.{NAMESPACE}.chat.request"

MAX_CONCURRENT = int(os.getenv("WORKER_MAX_CONCURRENT", "10"))
TASK_TIMEOUT = int(os.getenv("WORKER_TASK_TIMEOUT", "120"))  # 2 minutes

# Flask internal URL for delegating RAG processing
FLASK_INTERNAL_URL = os.getenv("FLASK_INTERNAL_URL", "http://localhost:8030")

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

_shutdown = False

# Reusable HTTP session for connection pooling to Flask
_http_session = requests.Session()


# ---------------------------------------------------------------------------
# Task Processing (thin HTTP dispatch)
# ---------------------------------------------------------------------------

def process_chat_task(task_id: str, request_data: dict) -> None:
    """
    Dispatch a chat task to Flask's internal endpoint via HTTP.
    
    Flask handles all the heavy work:
    - Loading RAG module (PyTorch, embedding model, LlamaIndex)
    - Calling process_query() with stream_callback → Redis pub/sub
    - Saving conversation to database
    - Publishing 'done' event to Redis
    
    This worker just dispatches and waits for the HTTP response.
    """
    start_time = time.time()
    session_id = request_data.get("conversation_id", "unknown")
    
    print(f"[WORKER] Dispatching task {task_id} to Flask (session={session_id})", flush=True)
    
    try:
        # Update Redis status
        redis_service.set_task_status(task_id, "processing")
        
        # Dispatch to Flask internal endpoint
        response = _http_session.post(
            f"{FLASK_INTERNAL_URL}/api/chat/internal/process_query",
            json={"task_id": task_id, "request_data": request_data},
            timeout=150,  # 2.5 min (TASK_TIMEOUT + buffer for LLM response)
        )
        response.raise_for_status()
        
        elapsed = time.time() - start_time
        print(f"[WORKER] Task {task_id} completed in {elapsed:.1f}s", flush=True)
        
    except requests.exceptions.Timeout:
        elapsed = time.time() - start_time
        print(f"[WORKER] Task {task_id} TIMED OUT after {elapsed:.1f}s", flush=True)
        
        # Publish error to Redis pub/sub
        redis_service.publish_chunk(task_id, {
            "error": "Processing failed",
            "message": "Request timed out after 150 seconds",
        })
        redis_service.fail_task(task_id, "Request timed out")
        
    except requests.exceptions.ConnectionError as e:
        elapsed = time.time() - start_time
        print(f"[WORKER] Task {task_id} FAILED (Flask unavailable) after {elapsed:.1f}s: {e}", flush=True)
        
        # Publish error to Redis pub/sub
        redis_service.publish_chunk(task_id, {
            "error": "Processing failed",
            "message": "Flask service unavailable",
        })
        redis_service.fail_task(task_id, f"Flask unavailable: {e}")
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"[WORKER] Task {task_id} FAILED after {elapsed:.1f}s: {e}", flush=True)
        traceback.print_exc()
        
        # Publish error to Redis pub/sub (Flask may have already done this,
        # but publish again in case the error was in the HTTP layer)
        try:
            redis_service.publish_chunk(task_id, {
                "error": "Processing failed",
                "message": str(e),
            })
            redis_service.fail_task(task_id, str(e))
        except Exception:
            pass  # Redis may also be down


# ---------------------------------------------------------------------------
# Worker (RabbitMQ Consumer)
# ---------------------------------------------------------------------------

class LearnBotWorker:
    """
    RabbitMQ consumer with ThreadPoolExecutor for concurrent HTTP dispatches.
    
    Uses pika.BlockingConnection with prefetch_count=MAX_CONCURRENT.
    Each incoming message is submitted to a thread pool which dispatches
    the task to Flask via HTTP.
    """
    
    def __init__(self):
        self.connection: pika.BlockingConnection | None = None
        self.channel = None
        self.executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT)
        self.active_futures: dict[str, Future] = {}
        self.futures_lock = Lock()
    
    def connect(self) -> None:
        """Connect to RabbitMQ with retry logic."""
        max_retries = 10
        retry_delay = 5
        
        for attempt in range(1, max_retries + 1):
            try:
                params = pika.URLParameters(RABBITMQ_URL)
                params.heartbeat = 600
                params.blocked_connection_timeout = 300
                
                self.connection = pika.BlockingConnection(params)
                self.channel = self.connection.channel()
                
                # Declare exchange and queue (idempotent)
                self.channel.exchange_declare(
                    exchange=EXCHANGE_NAME, exchange_type="direct", durable=True
                )
                self.channel.queue_declare(queue=QUEUE_NAME, durable=True)
                self.channel.queue_bind(
                    queue=QUEUE_NAME, exchange=EXCHANGE_NAME, routing_key=ROUTING_KEY
                )
                
                # Allow MAX_CONCURRENT unacked messages
                self.channel.basic_qos(prefetch_count=MAX_CONCURRENT)
                
                print(f"[WORKER] Connected to RabbitMQ (prefetch={MAX_CONCURRENT})", flush=True)
                return
                
            except Exception as e:
                print(
                    f"[WORKER] Connection attempt {attempt}/{max_retries} failed: {e}",
                    flush=True
                )
                if attempt < max_retries:
                    time.sleep(retry_delay)
                else:
                    raise
    
    def on_message(self, channel, method, properties, body):
        """
        Called when a message arrives from RabbitMQ.
        Submits the task to the thread pool for HTTP dispatch.
        """
        try:
            message = json.loads(body)
            task_id = message.get("taskId", "unknown")
            request_data = message.get("requestData", {})
            
            print(f"[WORKER] Received task {task_id}", flush=True)
            
            # Submit to thread pool
            future = self.executor.submit(
                self._process_and_ack, channel, method, task_id, request_data
            )
            
            with self.futures_lock:
                self.active_futures[task_id] = future
            
            # Clean up completed futures
            future.add_done_callback(lambda f: self._cleanup_future(task_id))
            
        except json.JSONDecodeError as e:
            print(f"[WORKER] Invalid JSON in message: {e}", flush=True)
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            print(f"[WORKER] Error handling message: {e}", flush=True)
            traceback.print_exc()
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    
    def _process_and_ack(self, channel, method, task_id: str, request_data: dict):
        """Process the task and ACK the message (runs in thread pool thread)."""
        try:
            process_chat_task(task_id, request_data)
            # ACK must happen on the connection's thread, schedule it
            self.connection.add_callback_threadsafe(
                lambda: channel.basic_ack(delivery_tag=method.delivery_tag)
            )
        except Exception as e:
            print(f"[WORKER] Task {task_id} failed, NACKing: {e}", flush=True)
            self.connection.add_callback_threadsafe(
                lambda: channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            )
    
    def _cleanup_future(self, task_id: str):
        """Remove completed future from tracking."""
        with self.futures_lock:
            self.active_futures.pop(task_id, None)
    
    def start(self):
        """Start consuming messages."""
        self.connect()
        
        self.channel.basic_consume(
            queue=QUEUE_NAME,
            on_message_callback=self.on_message,
            auto_ack=False,
        )
        
        print(f"[WORKER] Waiting for messages on {QUEUE_NAME}...", flush=True)
        print(f"[WORKER] Dispatching to Flask at {FLASK_INTERNAL_URL}", flush=True)
        
        try:
            self.channel.start_consuming()
        except KeyboardInterrupt:
            print("[WORKER] Shutting down...", flush=True)
            self.shutdown()
    
    def shutdown(self):
        """Graceful shutdown: stop consuming, wait for active tasks, close connection."""
        global _shutdown
        _shutdown = True
        
        if self.channel:
            self.channel.stop_consuming()
        
        # Wait for active tasks to complete
        with self.futures_lock:
            active = list(self.active_futures.values())
        
        if active:
            print(f"[WORKER] Waiting for {len(active)} active tasks to complete...", flush=True)
            for future in active:
                try:
                    future.result(timeout=TASK_TIMEOUT)
                except Exception:
                    pass
        
        self.executor.shutdown(wait=True)
        
        if self.connection and self.connection.is_open:
            self.connection.close()
        
        print("[WORKER] Shutdown complete.", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    pid = os.getpid()
    print(f"[WORKER] Starting LearnBOT worker (PID={pid}, max_concurrent={MAX_CONCURRENT})", flush=True)
    print(f"[WORKER] Mode: HTTP dispatch to Flask (EssayBot pattern)", flush=True)
    print(f"[WORKER] Flask URL: {FLASK_INTERNAL_URL}", flush=True)
    
    # Verify Redis is available
    if redis_service.is_redis_available():
        print("[WORKER] Redis connection: OK", flush=True)
    else:
        print("[WORKER] WARNING: Redis not available — task status/streaming won't work", flush=True)
    
    # Verify Flask is reachable
    try:
        health = _http_session.get(f"{FLASK_INTERNAL_URL}/", timeout=5)
        if health.status_code == 200:
            print("[WORKER] Flask connection: OK", flush=True)
        else:
            print(f"[WORKER] WARNING: Flask returned {health.status_code}", flush=True)
    except Exception as e:
        print(f"[WORKER] WARNING: Flask not reachable at {FLASK_INTERNAL_URL}: {e}", flush=True)
        print("[WORKER] (This is OK if Flask starts after workers — will retry on first task)", flush=True)
    
    # Start worker
    worker = LearnBotWorker()
    
    # Graceful shutdown on SIGTERM (PM2 sends this)
    def handle_signal(signum, frame):
        print(f"[WORKER] Received signal {signum}, shutting down...", flush=True)
        worker.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    worker.start()


if __name__ == "__main__":
    main()
