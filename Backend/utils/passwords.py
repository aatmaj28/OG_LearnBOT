"""
Password hashing (bcrypt)

Stored passwords are bcrypt hashes ("$2b$12$..."). Rows written before hashing was
added hold plaintext; verify_password still accepts those so nobody is locked out,
and callers should re-hash on a successful match (see auth_service.login).
scripts/hash_existing_passwords.py converts all remaining plaintext rows at once.

Frontend/lib/password.ts implements the same scheme for the Next.js API routes.
"""
import hmac

import bcrypt


def hash_password(password: str) -> str:
    """Returns a bcrypt hash of the password."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def is_password_hash(stored: str) -> bool:
    """True if the stored value is a bcrypt hash rather than legacy plaintext."""
    return isinstance(stored, str) and len(stored) == 60 and stored.startswith(("$2a$", "$2b$", "$2y$"))


def verify_password(password: str, stored: str) -> bool:
    """Checks a password against a stored bcrypt hash (or legacy plaintext value)."""
    if not password or not stored:
        return False
    if is_password_hash(stored):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    # Legacy plaintext row: constant-time compare
    return hmac.compare_digest(password.encode("utf-8"), stored.encode("utf-8"))
