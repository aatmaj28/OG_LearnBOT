"""
PII Masking Utility
Migrated from lib/pii-masking.ts

Implements strict PII masking to protect sensitive data.
"""
from typing import Optional, Literal
from dataclasses import dataclass

UserRole = Literal['student', 'faculty']

@dataclass
class MaskingContext:
    """Context for PII masking decisions"""
    requesting_user_id: Optional[str] = None
    requesting_user_role: Optional[UserRole] = None
    environment: str = 'development'

def should_mask_pii(context: MaskingContext) -> bool:
    """
    Determines if PII masking should be applied based on context
    
    Rules:
    - Faculty always see all unmasked data (any environment)
    - Users always see their own data unmasked
    - Students see other users' data masked
    """
    # Faculty always see unmasked data for other users
    if context.requesting_user_role == 'faculty':
        return False  # No masking for faculty
    
    # All other cases: mask PII
    return True

def mask_email(email: Optional[str]) -> Optional[str]:
    """Masks email address (STRICT PII)"""
    if not email:
        return email
    
    parts = email.split('@')
    if len(parts) != 2:
        return email  # Invalid email format
    
    local, domain = parts
    # Mask local part: show first 2 chars, mask the rest
    if len(local) > 2:
        masked_local = local[:2] + '*' * min(len(local) - 2, 10)
    else:
        masked_local = '**'
    
    return f"{masked_local}@{domain}"

def mask_name(name: Optional[str]) -> Optional[str]:
    """Masks name (STRICT PII)"""
    if not name:
        return name
    
    trimmed = name.strip()
    if not trimmed:
        return name
    
    parts = trimmed.split()
    if not parts:
        return '***'
    
    # Mask each name part
    masked_parts = []
    for part in parts:
        if not part:
            continue
        first_char = part[0].upper()
        masked = '*' * min(len(part) - 1, 5)
        masked_parts.append(f"{first_char}{masked}")
    
    return ' '.join(masked_parts) if masked_parts else '***'

def mask_nuid(nuid: Optional[str]) -> Optional[str]:
    """Masks NUID (STRICT PII)"""
    if not nuid:
        return nuid
    
    # Show last 2 digits only
    if len(nuid) <= 2:
        return '**'
    
    return '*' * (len(nuid) - 2) + nuid[-2:]

def mask_user_data(user: dict, context: MaskingContext) -> dict:
    """
    Main function to mask PII in User object based on context
    
    Args:
        user: User dictionary with fields: id, email, password, name, role, nuid, degree, major, etc.
        context: Masking context
    
    Returns:
        User dictionary with masked PII
    """
    # Check if masking should be applied
    if not should_mask_pii(context):
        # PRODUCTION + Faculty: No masking, return clean data
        # Still remove password for security
        result = user.copy()
        result['password'] = '[REDACTED]'
        return result
    
    # Check if user is requesting their own data
    is_own_data = context.requesting_user_id and user.get('id') == context.requesting_user_id
    
    # Users always see their own unmasked data (except password)
    if is_own_data:
        result = user.copy()
        result['password'] = '[REDACTED]'
        return result
    
    # Apply strict masking
    result = user.copy()
    result['password'] = '[REDACTED]'  # Never return password
    result['email'] = mask_email(user.get('email'))
    result['name'] = mask_name(user.get('name'))
    result['nuid'] = mask_nuid(user.get('nuid'))
    result['degree'] = None if user.get('degree') else user.get('degree')
    result['major'] = None if user.get('major') else user.get('major')
    
    return result
