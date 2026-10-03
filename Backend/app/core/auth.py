"""Accounts and sessions for the manager and employee portals (standard library only).

Users live in DATA_DIR/users.json: {"id", "role": "manager"|"employee", "name", "email", "password_hash",
"employee_id"?}. Passwords are PBKDF2-SHA256. A session token is "user_id.expiry.signature" (HMAC-SHA256 with
AUTH_SECRET, or a random secret kept in DATA_DIR/.auth_secret).
"""
import base64
import hashlib
import hmac
import os
import secrets
import time

from fastapi import Header, HTTPException

from app.core import store
from app.core.config import data_dir

TOKEN_TTL = 7 * 24 * 3600
_ITER = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITER)
    return f"pbkdf2_sha256${_ITER}${salt}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iters))
        return hmac.compare_digest(base64.b64encode(dk).decode(), digest)
    except (ValueError, AttributeError):
        return False


def _secret() -> bytes:
    env = os.getenv("AUTH_SECRET")
    if env:
        return env.encode()
    f = data_dir() / ".auth_secret"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text().strip().encode()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def make_token(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time()) + TOKEN_TTL}"
    return f"{payload}.{_sign(payload)}"


def users() -> list[dict]:
    return store.read_json("users.json", [])


def public(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "password_hash"}


def login(email: str, password: str):
    for u in users():
        if u["email"].lower() == email.strip().lower() and verify_password(password, u["password_hash"]):
            return u
    return None


def user_from_token(token: str):
    try:
        user_id, expiry, sig = token.rsplit(".", 2)
    except ValueError:
        return None
    if not hmac.compare_digest(sig, _sign(f"{user_id}.{expiry}")) or int(expiry) < time.time():
        return None
    return next((u for u in users() if u["id"] == user_id), None)


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: the signed-in user (401 otherwise)."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    u = user_from_token(token) if token else None
    if not u:
        raise HTTPException(401, "Sign in required")
    return u


def require_manager(authorization: str | None = Header(default=None)) -> dict:
    u = current_user(authorization)
    if u["role"] != "manager":
        raise HTTPException(403, "Managers only")
    return u
