"""
Authentication Service
Migrated from lib/auth.ts

Handles login, session management, etc.
"""
from typing import Optional
from datetime import datetime, timedelta
import time
import random
import string
from services.db_service import get_user_by_email_internal, get_user_by_id_internal, update_user_password
from services.db_service import session_create as db_session_create
from services.db_service import session_get as db_session_get
from services.db_service import session_delete as db_session_delete
from utils.passwords import hash_password, is_password_hash, verify_password

class AuthSession:
    """Represents an authentication session"""
    def __init__(self, user: dict, expires_at: datetime):
        self.user = user
        self.expires_at = expires_at

def login(email: str, password: str) -> Optional[dict]:
    """
    Authenticates a user by email and password
    
    Args:
        email: User's email
        password: User's password
    
    Returns:
        User dictionary if authenticated, None otherwise
    """
    try:
        print(f'[AUTH] Attempting to get user from database for: {email}')
        # Get user from database (internal function - no masking)
        user = get_user_by_email_internal(email, None)
        
        if not user:
            print(f'[AUTH] User not found in database: {email}')
            return None
        
        print(f'[AUTH] User found, checking password...')
        stored = user.get('password')
        if not verify_password(password, stored):
            print(f'[AUTH] Password mismatch for: {email}')
            return None

        print(f'[AUTH] Password matches! Authentication successful for: {email}')
        if not is_password_hash(stored):
            # Legacy plaintext row: upgrade it to a bcrypt hash now that we know the password
            try:
                update_user_password(user['id'], hash_password(password))
                print(f'[AUTH] Upgraded plaintext password to bcrypt hash for: {email}')
            except Exception as e:
                print(f'[AUTH] Could not upgrade password hash for {email}: {e}')
        return user
        
    except Exception as e:
        import traceback
        print(f'[AUTH] Login error: {e}')
        print(f'[AUTH] Full traceback:')
        traceback.print_exc()
        # For now, return None on error
        # In production, you might want to log this differently
        return None

def create_session(user: dict) -> str:
    """
    Creates a new session for a user (stored in DB so all Gunicorn workers share it).
    
    Args:
        user: User dictionary
    
    Returns:
        Session ID
    """
    session_id = f"{int(time.time() * 1000)}{''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}"
    expires_at = datetime.now() + timedelta(hours=24)
    db_session_create(session_id, user['id'], expires_at)
    print(f"[AUTH] Session created (DB): {session_id} for user: {user.get('email')}")
    return session_id

def get_session(session_id: str) -> Optional[dict]:
    """
    Gets a session by session ID (from DB; works across all Gunicorn workers).
    
    Args:
        session_id: Session ID
    
    Returns:
        Session dict with 'user' and 'expires_at' if valid, None otherwise
    """
    row = db_session_get(session_id)
    if not row:
        print("[AUTH] Session not found or expired")
        return None
    user = get_user_by_id_internal(row['user_id'], None)
    if not user:
        print("[AUTH] User for session no longer exists")
        db_session_delete(session_id)
        return None
    # Do not expose password in session
    user_safe = {k: v for k, v in user.items() if k != 'password'}
    return {
        'user': user_safe,
        'expires_at': row['expires_at'].isoformat() if hasattr(row['expires_at'], 'isoformat') else row['expires_at']
    }

def delete_session(session_id: str):
    """Deletes a session from DB."""
    db_session_delete(session_id)
