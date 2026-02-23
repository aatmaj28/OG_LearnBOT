"""
RabbitMQ service for LearnBOT task publishing.

Publishes chat tasks to the 'learnbot.chat.queue' queue via the 'learnbot.chat' exchange.
Uses the dedicated 'learnbot' RabbitMQ user with restricted permissions (learnbot\\..*).

The learnbot user can ONLY access exchanges/queues starting with 'learnbot.' —
it physically cannot interfere with EssayBOT's 'essay.*' resources.
"""

import json
import os
import uuid
import pika

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://learnbot:learnbot123@localhost:5672")
_EXCHANGE = os.getenv("RABBITMQ_EXCHANGE", "learnbot.chat")
_QUEUE = os.getenv("RABBITMQ_QUEUE", "learnbot.chat.queue")
_ROUTING_KEY = "learnbot.chat.request"

_connection: pika.BlockingConnection | None = None
_channel: pika.adapters.blocking_connection.BlockingChannel | None = None


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def _get_channel() -> pika.adapters.blocking_connection.BlockingChannel:
    """Get or create a RabbitMQ channel (lazy singleton with reconnect)."""
    global _connection, _channel
    
    if _connection is not None and _connection.is_open:
        if _channel is not None and _channel.is_open:
            return _channel
    
    # Connect (or reconnect)
    params = pika.URLParameters(_RABBITMQ_URL)
    params.heartbeat = 600
    params.blocked_connection_timeout = 300
    
    _connection = pika.BlockingConnection(params)
    _channel = _connection.channel()
    
    # Declare exchange and queue (idempotent — safe to call every time)
    _channel.exchange_declare(exchange=_EXCHANGE, exchange_type="direct", durable=True)
    _channel.queue_declare(queue=_QUEUE, durable=True)
    _channel.queue_bind(queue=_QUEUE, exchange=_EXCHANGE, routing_key=_ROUTING_KEY)
    
    return _channel


def is_rabbitmq_available() -> bool:
    """Check if RabbitMQ is reachable."""
    try:
        _get_channel()
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Publishing
# ---------------------------------------------------------------------------

def generate_task_id() -> str:
    """Generate a unique task ID."""
    return f"task_{uuid.uuid4().hex[:16]}"


def publish_chat_task(task_id: str, request_data: dict) -> bool:
    """
    Publish a chat task to the RabbitMQ queue.
    
    Returns True if published successfully, False otherwise.
    """
    try:
        channel = _get_channel()
        
        message = {
            "taskId": task_id,
            "requestData": request_data,
        }
        
        channel.basic_publish(
            exchange=_EXCHANGE,
            routing_key=_ROUTING_KEY,
            body=json.dumps(message, ensure_ascii=False),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Persistent message (survives RabbitMQ restart)
                content_type="application/json",
            ),
        )
        
        print(f"[RABBITMQ] Published task {task_id} to {_QUEUE}", flush=True)
        return True
        
    except Exception as e:
        print(f"[RABBITMQ] Failed to publish task {task_id}: {e}", flush=True)
        # Reset connection so next call will reconnect
        global _connection, _channel
        _connection = None
        _channel = None
        return False
