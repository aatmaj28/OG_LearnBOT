#!/usr/bin/env python3
"""
Check current PostgreSQL connection usage. Run from LearnBot-Backend with env loaded:
  cd LearnBot-Backend && python scripts/check_db_connections.py

Useful when debugging "Fatal: too many clients" - shows how many connections
each application_name is using so you can see if LearnBOT is leaking or
if worker count × pool size is too high.
"""
import os
import sys

# Load env (same as Flask app)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def main():
    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    host = os.getenv("DB_HOST", "localhost")
    port = int(os.getenv("DB_PORT", "5432"))
    dbname = os.getenv("DB_NAME", "learnbot")
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "")

    try:
        conn = psycopg2.connect(
            host=host, port=port, dbname=dbname, user=user, password=password,
            connect_timeout=5
        )
    except Exception as e:
        print(f"Cannot connect to DB: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        cur = conn.cursor()
        # Total and by application_name
        cur.execute("""
            SELECT application_name, state, count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
            GROUP BY application_name, state
            ORDER BY application_name, state
        """)
        rows = cur.fetchall()
        cur.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
        total = cur.fetchone()[0]
        cur.execute("SHOW max_connections")
        max_conn = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    print(f"Database: {dbname}")
    print(f"Total connections: {total} / max_connections: {max_conn}")
    print()
    print("By application_name and state:")
    print("-" * 50)
    for app_name, state, cnt in rows:
        app = app_name or "(none)"
        st = state or "(none)"
        print(f"  {app!r}  state={st!r}  count={cnt}")
    print("-" * 50)
    if total >= int(max_conn) * 0.9:
        print("WARNING: connection usage is near max. Consider reducing Gunicorn workers or DB_POOL_MAX.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
