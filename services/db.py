"""
Database connection and initialization
Python equivalent of lib/db.ts

Pool size: DB_POOL_MAX (default 2) per process. Total DB connections from Flask
= Gunicorn workers × DB_POOL_MAX. Must stay under Postgres max_connections;
gunicorn_config.py caps workers using POSTGRES_MAX_CONNECTIONS and DB_POOL_MAX.
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
            pool_max = int(os.getenv("DB_POOL_MAX", "2"))
            # Keep max low so (Gunicorn workers × pool_max) doesn't exceed PostgreSQL max_connections
            connection_pool = psycopg2.pool.SimpleConnectionPool(
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
    """Get a connection from the pool"""
    global connection_pool
    if connection_pool is None:
        init_pool()
    return connection_pool.getconn()

def return_connection(conn):
    """Return a connection to the pool"""
    if connection_pool:
        connection_pool.putconn(conn)

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
