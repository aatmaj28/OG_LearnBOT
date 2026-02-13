"""
Gunicorn configuration for production

Connection limit: PostgreSQL has max_connections (e.g. 100). Each Gunicorn worker
holds a DB pool (see services/db.py: max 2 conns per process). So:
  total_connections <= workers * pool_max
To stay under 100 with pool_max=2: workers <= 50. We cap workers so Flask alone
stays under ~80, leaving headroom for cron/scripts or other apps on same DB.
"""
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 2048

# Worker processes: cap so (workers * DB pool size) doesn't exceed Postgres limit
_cpu_workers = multiprocessing.cpu_count() * 2 + 1
_db_limit = int(os.getenv("POSTGRES_MAX_CONNECTIONS", "100"))
_pool_max = int(os.getenv("DB_POOL_MAX", "2"))
# Leave headroom (e.g. 15) for other clients (Next.js, scripts, admin)
_headroom = int(os.getenv("DB_CONNECTION_HEADROOM", "15"))
_max_workers = max(1, (_db_limit - _headroom) // _pool_max)
workers = min(_cpu_workers, _max_workers)
worker_class = "sync"
worker_connections = 1000
timeout = 120
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
