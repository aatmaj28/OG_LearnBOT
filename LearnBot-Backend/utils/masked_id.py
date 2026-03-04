"""
Masked ID Utility
Migrated from lib/masked-id-utils.ts

Generates deterministic SHA256-based masked_id for users.
"""
import hashlib

# Cache for masked IDs
_masked_id_cache = {}

def generate_masked_id(user_id: str | int) -> str:
    """
    Generates a deterministic masked_id from user_id
    Same user_id always produces the same masked_id
    
    Args:
        user_id: The user's ID (string or number)
    Returns:
        SHA256 hash (64 hex characters)
    """
    user_id_str = str(user_id)
    hash_obj = hashlib.sha256(user_id_str.encode('utf-8'))
    return hash_obj.hexdigest()

def is_valid_masked_id(masked_id: str) -> bool:
    """
    Validates if a string is a valid masked_id format
    (64 character hex string)
    """
    import re
    return bool(re.match(r'^[a-f0-9]{64}$', masked_id, re.IGNORECASE))

def get_masked_id(user_id: str | int) -> str:
    """
    Gets masked_id from user_id (with caching for performance)
    """
    user_id_str = str(user_id)
    
    if user_id_str not in _masked_id_cache:
        _masked_id_cache[user_id_str] = generate_masked_id(user_id_str)
    
    return _masked_id_cache[user_id_str]

def clear_masked_id_cache():
    """Clears the masked_id cache (useful for testing)"""
    _masked_id_cache.clear()
