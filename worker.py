#!/usr/bin/env python3
# Trigger comment for deployment reset #2 - 2026-02-23T18:02
"""
LearnBOT Chat Worker

Consumes chat tasks from RabbitMQ (learnbot.chat.queue) and processes them
using the existing RAG pipeline (process_query). Results are streamed back
to the frontend via Redis pub/sub.

Based on EssayBOT's worker.py pattern, with key differences:
- ThreadPoolExecutor for 5 concurrent requests per worker (vs 1 in EssayBOT)
- Calls process_query() directly (vs HTTP call in EssayBOT)
- Streams tokens via Redis pub/sub (vs simulated progress in EssayBOT)

Usage:
    python worker.py                       # Run single worker instance
    pm2 start ecosystem.config.js          # Run 10 instances via PM2
"""

import json
import os
import sys
import time
import signal
import traceback
from concurrent.futures import ThreadPoolExecutor, Future
from threading import Lock

# Add parent directory to path so we can import from services/ and lib/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

import pika

from services import redis_service, db_service

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

NAMESPACE = os.getenv("NAMESPACE", "uat")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://learnbot:learnbot123@localhost:5673")
EXCHANGE_NAME = os.getenv("RABBITMQ_EXCHANGE", f"learnbot.{NAMESPACE}.chat")
QUEUE_NAME = os.getenv("RABBITMQ_QUEUE", f"learnbot.{NAMESPACE}.chat.queue")
ROUTING_KEY = f"learnbot.{NAMESPACE}.chat.request"

MAX_CONCURRENT = int(os.getenv("WORKER_MAX_CONCURRENT", "5"))
TASK_TIMEOUT = int(os.getenv("WORKER_TASK_TIMEOUT", "120"))  # 2 minutes

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

_rag_module = None
_shutdown = False


def load_rag_module():
    """Load the RAG module once at startup (same as chat.py does)."""
    global _rag_module
    if _rag_module is not None:
        return _rag_module
    
    rag_path = os.path.join(os.path.dirname(__file__), "lib", "llamaindex-rag-service.py")
    if not os.path.exists(rag_path):
        print(f"[WORKER] ERROR: RAG service not found at {rag_path}", flush=True)
        return None
    
    import importlib.util
    spec = importlib.util.spec_from_file_location("rag_service", rag_path)
    _rag_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_rag_module)
    print(f"[WORKER] RAG module loaded from {rag_path}", flush=True)
    return _rag_module


# ---------------------------------------------------------------------------
# Task Processing
# ---------------------------------------------------------------------------

def process_chat_task(task_id: str, request_data: dict) -> None:
    """
    Process a single chat task.
    
    This runs inside a ThreadPoolExecutor thread. It:
    1. Calls process_query() with a stream_callback that publishes to Redis
    2. Saves the result to the database
    3. Publishes a 'done' event to Redis
    """
    start_time = time.time()
    session_id = request_data.get("conversation_id", "unknown")
    
    print(f"[WORKER] Processing task {task_id} (session={session_id})", flush=True)
    
    try:
        # Update Redis status
        redis_service.set_task_status(task_id, "processing")
        
        # Load RAG module
        rag = load_rag_module()
        if rag is None:
            raise RuntimeError("RAG module not available")
        
        # Accumulated response for final save
        accumulated_response = ""
        
        def stream_callback(chunk_data: dict) -> None:
            """Called by RAG service for each generated token/chunk."""
            nonlocal accumulated_response
            if chunk_data.get("type") == "chunk":
                chunk_text = chunk_data.get("chunk", "")
                if chunk_text:
                    accumulated_response += chunk_text
                    # Publish chunk to Redis pub/sub for SSE endpoint
                    redis_service.publish_chunk(task_id, {
                        "content": chunk_text,
                    })
        
        # Call process_query DIRECTLY (no HTTP overhead)
        result = rag.process_query(request_data, stream_callback=stream_callback)
        
        elapsed = time.time() - start_time
        final_response = result.get("response", accumulated_response)
        model_used = result.get("model_used", request_data.get("preferred_model", "unknown"))
        
        # Save to database
        try:
            conversation = db_service.get_rag_conversation_by_id(session_id)
            if conversation:
                updated_history = conversation.get("messageHistory", [])
                from datetime import datetime
                now_iso = datetime.now().isoformat()
                
                # Add user message
                updated_history.append({
                    "role": "user",
                    "content": request_data.get("query", ""),
                    "timestamp": now_iso,
                })
                
                # Add assistant message
                if final_response:
                    updated_history.append({
                        "role": "assistant",
                        "content": final_response,
                        "timestamp": datetime.now().isoformat(),
                    })
                
                db_service.update_rag_conversation(session_id, {
                    "messageHistory": updated_history,
                    "checkpointState": result.get("checkpoint_state",
                                                   conversation.get("checkpointState", {})),
                })
                print(f"[WORKER] DB updated for session {session_id}", flush=True)
        except Exception as db_err:
            print(f"[WORKER] DB save error for task {task_id}: {db_err}", flush=True)
            traceback.print_exc()
        
        # Publish 'done' event to Redis pub/sub
        redis_service.publish_chunk(task_id, {
            "done": True,
            "content": final_response,
            "modelUsed": model_used,
            "mode": result.get("mode", "rag"),
            "contentFound": result.get("content_found", False),
            "timeTaken": elapsed,
        })
        
        # Update Redis task status
        redis_service.complete_task(task_id, {
            "response": final_response[:500],  # Truncate for status storage
            "modelUsed": model_used,
            "timeTaken": elapsed,
        })
        
        print(f"[WORKER] Task {task_id} completed in {elapsed:.1f}s", flush=True)
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"[WORKER] Task {task_id} FAILED after {elapsed:.1f}s: {e}", flush=True)
        traceback.print_exc()
        
        # Publish error to Redis pub/sub (so SSE endpoint can notify frontend)
        redis_service.publish_chunk(task_id, {
            "error": "Processing failed",
            "message": str(e),
        })
        redis_service.fail_task(task_id, str(e))


# ---------------------------------------------------------------------------
# Worker (RabbitMQ Consumer)
# ---------------------------------------------------------------------------

class LearnBotWorker:
    """
    RabbitMQ consumer with ThreadPoolExecutor for concurrent processing.
    
    Uses pika.BlockingConnection (same as EssayBOT) with prefetch_count=MAX_CONCURRENT.
    Each incoming message is submitted to a thread pool for processing.
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
        Submits the task to the thread pool for processing.
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
    
    # Verify Redis is available
    if redis_service.is_redis_available():
        print("[WORKER] Redis connection: OK", flush=True)
    else:
        print("[WORKER] WARNING: Redis not available — task status/streaming won't work", flush=True)
    
    # Pre-load RAG module at startup (slow, but only happens once)
    print("[WORKER] Loading RAG module (this may take a moment)...", flush=True)
    rag = load_rag_module()
    if rag is None:
        print("[WORKER] FATAL: Cannot load RAG module. Exiting.", flush=True)
        sys.exit(1)
    print("[WORKER] RAG module ready.", flush=True)
    
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
