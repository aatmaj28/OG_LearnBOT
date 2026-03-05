"""
Database connection and initialization
Python equivalent of lib/db.ts

Pool size: DB_POOL_MAX (default 10) per process. With Gunicorn gthread workers
(5 procs × 10 threads), multiple threads share a single process and need
concurrent DB access — ThreadedConnectionPool is required.
Total DB connections from Flask = 5 × 10 = 50 (under PostgreSQL max_connections).
"""
import os
import psycopg2
from psycopg2 import pool
from config import Config

# Create connection pool
connection_pool = None

def init_pool():
    """Initialize the connection pool"""
    global connection_pool
    if connection_pool is None:
        try:
            pool_max = int(os.getenv("DB_POOL_MAX", "10"))
            # ThreadedConnectionPool is thread-safe (required for Gunicorn gthread workers)
            connection_pool = psycopg2.pool.ThreadedConnectionPool(
                1,  # min connections
                max(pool_max, 1),  # max per process
                host=Config.DB_HOST,
                port=Config.DB_PORT,
                database=Config.DB_NAME,
                user=Config.DB_USER,
                password=Config.DB_PASSWORD,
                application_name="learnbot-backend"
            )
        except Exception as e:
            print(f"[DB] Error creating connection pool: {e}")
            raise

def get_connection():
    """Get a connection from the pool. If the connection is dead (e.g. server closed it),
    discard it and get another so callers don't see 'connection already closed'.
    """
    global connection_pool
    if connection_pool is None:
        init_pool()
    for _ in range(3):
        conn = connection_pool.getconn()
        try:
            cursor = conn.cursor()
            cursor.execute('SELECT 1')
            cursor.close()
            return conn
        except (Exception, psycopg2.InterfaceError, psycopg2.OperationalError):
            try:
                conn.close()
            except Exception:
                pass
    return connection_pool.getconn()

def return_connection(conn):
    """Return a connection to the pool. If the connection was closed by the server
    (e.g. idle timeout, 'connection already closed'), do not put it back so the
    pool does not hand out dead connections on the next request.
    """
    if not connection_pool or not conn:
        return
    try:
        if getattr(conn, 'closed', 0) != 0:
            try:
                conn.close()
            except Exception:
                pass
            return
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        cursor.close()
        connection_pool.putconn(conn)
    except (Exception, psycopg2.InterfaceError, psycopg2.OperationalError):
        try:
            conn.close()
        except Exception:
            pass

def close_all_connections():
    """Close all connections in the pool"""
    global connection_pool
    if connection_pool:
        connection_pool.closeall()
        connection_pool = None

# Initialize pool on import
try:
    init_pool()
except Exception as e:
    print(f"[DB] Warning: Could not initialize connection pool: {e}")
    print("[DB] Pool will be initialized on first use")
