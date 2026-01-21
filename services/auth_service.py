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
from services.db_service import get_user_by_email_internal

# Session storage (in production, use Redis or database)
_sessions: dict[str, dict] = {}

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
        if user.get('password') == password:
            print(f'[AUTH] Password matches! Authentication successful for: {email}')
            return user
        else:
            print(f'[AUTH] Password mismatch for: {email}')
            return None
        
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
    Creates a new session for a user
    
    Args:
        user: User dictionary
    
    Returns:
        Session ID
    """
    # Generate session ID
    session_id = f"{int(time.time() * 1000)}{''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}"
    
    # Set expiration (24 hours)
    expires_at = datetime.now() + timedelta(hours=24)
    
    # Store session
    _sessions[session_id] = {
        'user': user,
        'expires_at': expires_at.isoformat()
    }
    
    print(f"[AUTH] Session created: {session_id} for user: {user.get('email')}")
    print(f"[AUTH] Total sessions in storage: {len(_sessions)}")
    
    return session_id

def get_session(session_id: str) -> Optional[dict]:
    """
    Gets a session by session ID
    
    Args:
        session_id: Session ID
    
    Returns:
        Session dictionary if valid, None otherwise
    """
    print(f"[AUTH] Looking for session: {session_id}")
    print(f"[AUTH] Available sessions: {list(_sessions.keys())}")
    
    session = _sessions.get(session_id)
    if not session:
        print("[AUTH] Session not found in storage")
        return None
    
    # Check expiration
    expires_at = datetime.fromisoformat(session['expires_at'])
    if expires_at < datetime.now():
        print("[AUTH] Session expired, deleting")
        del _sessions[session_id]
        return None
    
    print(f"[AUTH] Session found and valid for user: {session['user'].get('email')}")
    return session

def delete_session(session_id: str):
    """Deletes a session"""
    if session_id in _sessions:
        del _sessions[session_id]
