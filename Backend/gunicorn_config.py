"""
Gunicorn configuration for production

Architecture: gthread worker class with 5 processes × 10 threads = 50 concurrent.
This supports the EssayBot-pattern architecture where Flask handles RAG processing
(via /internal/process_query) and corpus indexing (in-process, no subprocess).
5 workers provide 5 GILs for parallel embedding (chat + indexing).

DB connection limit: PostgreSQL has max_connections (e.g. 100). Each Gunicorn process
holds a ThreadedConnectionPool (see services/db.py). With gthread, multiple threads
share the pool within a single process, so:
  total_connections <= workers * DB_POOL_MAX = 5 * 10 = 50
Workers no longer need DB connections (they dispatch via HTTP to Flask).
"""
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 2048

# Worker processes: 5 gthread workers with 10 threads each = 50 concurrent requests
# 5 processes = 5 GILs, allowing parallel CPU-bound work (embeddings for chat + indexing)
# Each process loads the RAG pipeline (~1.4 GB), so 5 × 1.4 GB = ~7 GB total
workers = 5
worker_class = "gthread"
threads = 10  # 5 × 10 = 50 concurrent capacity
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
