"""
Gunicorn configuration for production

Architecture: gthread worker class with 2 processes × 25 threads = 50 concurrent.
This supports the EssayBot-pattern architecture where Flask handles RAG processing
(via /internal/process_query) and workers are thin HTTP dispatchers.

DB connection limit: PostgreSQL has max_connections (e.g. 100). Each Gunicorn process
holds a ThreadedConnectionPool (see services/db.py). With gthread, multiple threads
share the pool within a single process, so:
  total_connections <= workers * DB_POOL_MAX = 2 * 25 = 50
Workers no longer need DB connections (they dispatch via HTTP to Flask).
"""
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 2048

# Worker processes: 2 gthread workers with 25 threads each = 50 concurrent requests
# 2 processes = 2 GILs, allowing parallel CPU-bound work (embeddings)
# Each process loads the RAG pipeline (~1.4 GB), so 2 × 1.4 GB = ~2.8 GB total
workers = 2
worker_class = "gthread"
threads = 25  # 2 × 25 = 50 concurrent capacity
worker_connections = 1000
timeout = 180  # LLM calls can take 60s+, plus embedding queue time
keepalive = 5

# Logging
accesslog = "-"  # stdout
errorlog = "-"   # stderr
loglevel = os.getenv("LOG_LEVEL", "info")

# Process naming
proc_name = "learnbot-flask"

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL (if needed)
# keyfile = "/path/to/keyfile"
# certfile = "/path/to/certfile"
