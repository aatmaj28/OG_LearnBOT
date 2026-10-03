#!/usr/bin/env python3
"""
One-time migration: replace plaintext passwords with bcrypt hashes.

Hashes every users.password and pending_registrations.password that is not already a
bcrypt hash. Safe to re-run (hashed rows are skipped). Run from Backend/ with env loaded:
  cd Backend && python scripts/hash_existing_passwords.py            # apply
  cd Backend && python scripts/hash_existing_passwords.py --dry-run  # count only

Logins keep working without this (plaintext rows are upgraded on the user's next
login), but until it runs, users who haven't logged in still have plaintext stored.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

from utils.passwords import hash_password, is_password_hash

TABLES = ("users", "pending_registrations")


def main():
    dry_run = "--dry-run" in sys.argv
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "learnbot"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        connect_timeout=5,
    )
    try:
        with conn, conn.cursor() as cursor:
            for table in TABLES:
                cursor.execute(f"SELECT id, password FROM {table}")
                plaintext = [(row_id, pw) for row_id, pw in cursor.fetchall() if pw and not is_password_hash(pw)]
                print(f"{table}: {len(plaintext)} plaintext password(s){' (dry run)' if dry_run else ''}")
                if dry_run:
                    continue
                for row_id, pw in plaintext:
                    cursor.execute(f"UPDATE {table} SET password = %s WHERE id = %s", (hash_password(pw), row_id))
        print("Dry run: nothing changed." if dry_run else "Done.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
