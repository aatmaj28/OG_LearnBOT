"""
Database Service
Migrated from lib/db-service.ts

Handles all database operations for users, classes, etc.
"""
from typing import Optional, List, Dict, Any
from services.db import get_connection, return_connection
from utils.masked_id import get_masked_id
from utils.pii_masking import mask_user_data, MaskingContext
from utils.passwords import hash_password
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
import os

FACULTY_SESSION_KEY = 'app.current_user_id'

def set_faculty_session_variable(conn, faculty_user_id: Optional[str] = None):
    """Sets PostgreSQL session variable for RLS policies"""
    cursor = conn.cursor()
    try:
        if not faculty_user_id:
            cursor.execute('SELECT set_config(%s, %s, true)', (FACULTY_SESSION_KEY, ''))
        else:
            numeric_id = int(faculty_user_id)
            cursor.execute('SELECT set_config(%s, %s, true)', (FACULTY_SESSION_KEY, str(numeric_id)))
        conn.commit()
    except Exception as e:
        print(f'[DB] Failed to set faculty session variable: {e}')
    finally:
        cursor.close()

def map_row_to_user(row: Dict) -> Dict:
    """Maps database row to User dictionary"""
    return {
        'id': str(row['id']),
        'email': row['email'],
        'password': row['password'],
        'name': row['name'],
        'role': row['role'],
        'nuid': row.get('nuid'),
        'degree': row.get('degree'),
        'major': row.get('major'),
        'taMode': row.get('ta_mode', 'normal'),
        'createdAt': row.get('created_at')
    }

# ============================================================================
# AUTH SESSIONS (shared across workers; fixes "Invalid or expired session")
# ============================================================================

def _ensure_auth_sessions_table(conn) -> None:
    """Create auth_sessions table if it does not exist."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id VARCHAR(128) PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL
            )
        """)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'[DB] Error ensuring auth_sessions table: {e}')
        raise
    finally:
        cursor.close()

def session_create(session_id: str, user_id: str, expires_at: datetime) -> None:
    """Insert a session row. Table is created if missing."""
    conn = get_connection()
    cursor = None
    try:
        _ensure_auth_sessions_table(conn)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (%s, %s, %s)',
            (session_id, int(user_id), expires_at)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'[DB] Error creating session: {e}')
        raise
    finally:
        if cursor is not None:
            cursor.close()
        return_connection(conn)  # required: never leak pool connection

def session_get(session_id: str) -> Optional[Dict]:
    """Get session by id. Returns dict with user_id, expires_at or None. Deletes if expired."""
    conn = get_connection()
    cursor = None
    try:
        _ensure_auth_sessions_table(conn)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            'SELECT user_id, expires_at FROM auth_sessions WHERE id = %s',
            (session_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        cursor = None
        if not row:
            return None
        row = dict(row)
        expires_at = row['expires_at'] if isinstance(row['expires_at'], datetime) else datetime.fromisoformat(str(row['expires_at']))
        if expires_at < datetime.now():
            del_cursor = conn.cursor()
            del_cursor.execute('DELETE FROM auth_sessions WHERE id = %s', (session_id,))
            conn.commit()
            del_cursor.close()
            return None
        return {'user_id': str(row['user_id']), 'expires_at': expires_at}
    except Exception as e:
        conn.rollback()
        print(f'[DB] Error getting session: {e}')
        raise
    finally:
        if cursor is not None:
            cursor.close()
        return_connection(conn)  # required: never leak pool connection

def session_delete(session_id: str) -> None:
    """Delete a session by id."""
    conn = get_connection()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM auth_sessions WHERE id = %s', (session_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'[DB] Error deleting session: {e}')
        raise
    finally:
        if cursor is not None:
            cursor.close()
        return_connection(conn)  # required: never leak pool connection

# ============================================================================
# USER OPERATIONS
# ============================================================================

def get_user_by_email_internal(email: str, faculty_user_id: Optional[str] = None) -> Optional[Dict]:
    """
    Gets user by email (internal function - bypasses masking)
    Used for authentication where we need real email
    """
    conn = get_connection()
    try:
        set_faculty_session_variable(conn, faculty_user_id)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute('SELECT id, email, password, name, role, nuid, degree, major, ta_mode, created_at FROM users WHERE email = %s', (email,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return map_row_to_user(dict(row))
    except Exception as e:
        print(f'[DB] Error getting user by email: {e}')
        raise
    finally:
        return_connection(conn)

def get_user_by_nuid_internal(nuid: str, faculty_user_id: Optional[str] = None) -> Optional[Dict]:
    """Gets user by NUID (internal function - bypasses masking)"""
    conn = get_connection()
    try:
        set_faculty_session_variable(conn, faculty_user_id)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute('SELECT id, email, password, name, role, nuid, degree, major, ta_mode, created_at FROM users WHERE nuid = %s', (nuid,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return map_row_to_user(dict(row))
    except Exception as e:
        print(f'[DB] Error getting user by NUID: {e}')
        raise
    finally:
        return_connection(conn)

def get_users_internal(faculty_user_id: Optional[str] = None) -> List[Dict]:
    """Gets all users (internal function - bypasses masking)"""
    conn = get_connection()
    try:
        set_faculty_session_variable(conn, faculty_user_id)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute('SELECT id, email, password, name, role, nuid, degree, major, ta_mode, created_at FROM users ORDER BY created_at DESC')
        rows = cursor.fetchall()
        cursor.close()
        
        return [map_row_to_user(dict(row)) for row in rows]
    except Exception as e:
        print(f'[DB] Error getting users: {e}')
        raise
    finally:
        return_connection(conn)

def get_user_by_id_internal(user_id: str, faculty_user_id: Optional[str] = None) -> Optional[Dict]:
    """Gets user by ID (internal function - bypasses masking)"""
    conn = get_connection()
    try:
        set_faculty_session_variable(conn, faculty_user_id)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute('SELECT id, email, password, name, role, nuid, degree, major, ta_mode, created_at FROM users WHERE id = %s', (user_id,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return map_row_to_user(dict(row))
    except Exception as e:
        print(f'[DB] Error getting user by ID: {e}')
        raise
    finally:
        return_connection(conn)

def get_users(requesting_user_id: Optional[str] = None, requesting_user_role: Optional[str] = None) -> List[Dict]:
    """Gets all users with PII masking applied"""
    faculty_user_id = (requesting_user_role == 'faculty' and requesting_user_id) if requesting_user_id else None
    users = get_users_internal(faculty_user_id)
    
    environment = os.getenv("FLASK_ENV", "development")
    context = MaskingContext(
        requesting_user_id=requesting_user_id,
        requesting_user_role=requesting_user_role,
        environment=environment
    )
    
    return [mask_user_data(user, context) for user in users]

def get_user_by_id(user_id: str, requesting_user_id: Optional[str] = None, requesting_user_role: Optional[str] = None) -> Optional[Dict]:
    """Gets user by ID with PII masking applied"""
    faculty_user_id = (requesting_user_role == 'faculty' and requesting_user_id) if requesting_user_id else None
    user = get_user_by_id_internal(user_id, faculty_user_id)
    
    if not user:
        return None
    
    environment = os.getenv("FLASK_ENV", "development")
    context = MaskingContext(
        requesting_user_id=requesting_user_id,
        requesting_user_role=requesting_user_role,
        environment=environment
    )
    
    return mask_user_data(user, context)

def get_user_by_email(email: str, requesting_user_id: Optional[str] = None, requesting_user_role: Optional[str] = None) -> Optional[Dict]:
    """Gets user by email with PII masking applied"""
    faculty_user_id = (requesting_user_role == 'faculty' and requesting_user_id) if requesting_user_id else None
    user = get_user_by_email_internal(email, faculty_user_id)
    
    if not user:
        return None
    
    environment = os.getenv("FLASK_ENV", "development")
    context = MaskingContext(
        requesting_user_id=requesting_user_id,
        requesting_user_role=requesting_user_role,
        environment=environment
    )
    
    return mask_user_data(user, context)

def get_user_by_nuid(nuid: str, requesting_user_id: Optional[str] = None, requesting_user_role: Optional[str] = None) -> Optional[Dict]:
    """Gets user by NUID with PII masking applied"""
    faculty_user_id = (requesting_user_role == 'faculty' and requesting_user_id) if requesting_user_id else None
    user = get_user_by_nuid_internal(nuid, faculty_user_id)
    
    if not user:
        return None
    
    environment = os.getenv("FLASK_ENV", "development")
    context = MaskingContext(
        requesting_user_id=requesting_user_id,
        requesting_user_role=requesting_user_role,
        environment=environment
    )
    
    return mask_user_data(user, context)

def create_user(user_data: Dict) -> Dict:
    """Creates a new user.

    Pass the plaintext as 'password' (hashed here), or an existing bcrypt hash as
    'password_hash' (e.g. carried over from pending_registrations). The returned
    dict never includes either.
    """
    password_hash = user_data.get('password_hash') or hash_password(user_data['password'])
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Commit any pending transaction before changing autocommit
        conn.commit()
        conn.autocommit = False
        
        try:
            # Get next sequence value
            cursor.execute("SELECT nextval('users_id_seq') AS next_id")
            next_id = str(cursor.fetchone()[0])
            
            # Generate masked_id
            masked_id = get_masked_id(next_id)
            
            # Insert user (coerce empty strings to NULL for nullable unique fields)
            nuid = user_data.get('nuid') or None
            degree = user_data.get('degree') or None
            major = user_data.get('major') or None

            cursor.execute(
                """INSERT INTO users (id, email, password, name, role, nuid, degree, major, masked_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id, created_at""",
                [
                    next_id,
                    user_data['email'],
                    password_hash,
                    user_data['name'],
                    user_data['role'],
                    nuid,
                    degree,
                    major,
                    masked_id
                ]
            )
            
            row = cursor.fetchone()
            conn.commit()
            
            user = {k: v for k, v in user_data.items() if k not in ('password', 'password_hash')}
            return {
                **user,
                'id': str(row[0]),
                'createdAt': row[1]
            }
        except Exception as e:
            conn.rollback()
            raise
    except Exception as e:
        print(f'[DB] Error creating user: {e}')
        raise
    finally:
        return_connection(conn)

def update_user_password(user_id: str, password_hash: str) -> bool:
    """Stores a new bcrypt password hash for a user"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET password = %s WHERE id = %s', (password_hash, user_id))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        conn.rollback()
        print(f'[DB] Error updating user password: {e}')
        raise
    finally:
        return_connection(conn)

def update_user_ta_mode(user_id: str, ta_mode: str) -> bool:
    """Updates user's TA mode"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE users SET ta_mode = %s WHERE id = %s AND role = %s',
            (ta_mode, user_id, 'faculty')
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error updating TA mode: {e}')
        raise
    finally:
        return_connection(conn)

def get_user_ta_mode(user_id: str) -> Optional[str]:
    """Gets user's TA mode"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT ta_mode FROM users WHERE id = %s', (user_id,))
        row = cursor.fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f'[DB] Error getting TA mode: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# CLASS OPERATIONS
# ============================================================================

def generate_vector_store_folder_name(class_name: str) -> str:
    """Generates vector store folder name from class name (safe for paths and Qdrant).
    Normalizes so that 'FINA2201', 'FINA 2201', 'fina2201' all produce 'fina_2201'.
    """
    import re
    cleaned = re.sub(r'[^a-z0-9\s]', '', class_name.lower())
    # Insert underscore between letters and digits (e.g., fina2201 -> fina_2201)
    cleaned = re.sub(r'([a-z])(\d)', r'\1_\2', cleaned)
    return re.sub(r'\s+', '_', cleaned).strip() or 'default'


def update_class_vector_store_folder(class_id: str, folder_name: str, is_syllabus: bool = False) -> bool:
    """Sets vector_store_folder or syllabus_vector_store_folder for a class. Returns True if updated."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        col = 'syllabus_vector_store_folder' if is_syllabus else 'vector_store_folder'
        cursor.execute(f'UPDATE classes SET {col} = %s WHERE id = %s', (folder_name, class_id))
        updated = cursor.rowcount > 0
        conn.commit()
        cursor.close()
        return updated
    except Exception as e:
        print(f'[DB] Error updating class vector store folder: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# PENDING REGISTRATIONS (for OTP verification)
# ============================================================================

def create_pending_registration(email: str, password: str, name: str, role: str, 
                                nuid: Optional[str], degree: Optional[str], 
                                major: Optional[str], otp_code: str, expires_at: datetime) -> bool:
    """Creates a pending registration with OTP. The password is stored as a bcrypt hash."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Commit any pending transaction before changing autocommit
        conn.commit()
        conn.autocommit = False
        
        try:
            # Delete any existing pending registration
            cursor.execute('DELETE FROM pending_registrations WHERE email = %s', (email,))
            
            # Insert new pending registration
            cursor.execute(
                """INSERT INTO pending_registrations 
                   (email, password, name, role, nuid, degree, major, otp_code, otp_expires_at) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [email, hash_password(password), name, role, nuid, degree, major, otp_code, expires_at]
            )
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            raise
    except Exception as e:
        print(f'[DB] Error creating pending registration: {e}')
        raise
    finally:
        return_connection(conn)

def get_pending_registration(email: str, otp_code: str) -> Optional[Dict]:
    """Gets pending registration by email and OTP"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """SELECT * FROM pending_registrations 
               WHERE email = %s AND otp_code = %s""",
            (email, otp_code)
        )
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return dict(row)
    except Exception as e:
        print(f'[DB] Error getting pending registration: {e}')
        raise
    finally:
        return_connection(conn)

def delete_pending_registration(email: str) -> bool:
    """Deletes a pending registration"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM pending_registrations WHERE email = %s', (email,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error deleting pending registration: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# PENDING CLASS ENROLLMENTS (Invite-based Flow)
# ============================================================================

def create_pending_enrollment(email: str, class_id: str, faculty_id: str) -> bool:
    """Creates a pending class enrollment for an invited student"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute(
            """INSERT INTO pending_class_enrollments (email, class_id, faculty_id) 
               VALUES (%s, %s, %s) 
               ON CONFLICT (email, class_id) DO NOTHING""",
            (email, class_id, faculty_id)
        )
        conn.commit()
        return True
    except Exception as e:
        print(f'[DB] Error creating pending enrollment: {e}')
        raise
    finally:
        return_connection(conn)

def get_pending_enrollments_by_email(email: str) -> List[Dict]:
    """Gets all pending class enrollments for an email"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            'SELECT * FROM pending_class_enrollments WHERE email = %s',
            (email,)
        )
        rows = cursor.fetchall()
        cursor.close()
        
        return [dict(row) for row in rows]
    except Exception as e:
        print(f'[DB] Error getting pending enrollments by email: {e}')
        raise
    finally:
        return_connection(conn)

def delete_pending_enrollment(email: str, class_id: str) -> bool:
    """Deletes a specific pending class enrollment"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM pending_class_enrollments WHERE email = %s AND class_id = %s',
            (email, class_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error deleting pending enrollment: {e}')
        raise
    finally:
        return_connection(conn)

def get_class_by_id(class_id: str) -> Optional[Dict]:
    """Gets class by ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute("""
            SELECT c.*, 
                   COALESCE(
                     ARRAY_AGG(DISTINCT cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
                     ARRAY[]::INTEGER[]
                   ) as student_ids,
                   COALESCE(
                     ARRAY_AGG(DISTINCT pce.email) FILTER (WHERE pce.email IS NOT NULL), 
                     ARRAY[]::VARCHAR[]
                   ) as pending_emails
            FROM classes c
            LEFT JOIN class_students cs ON c.id = cs.class_id
            LEFT JOIN pending_class_enrollments pce ON c.id = pce.class_id
            WHERE c.id = %s
            GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder,
                     c.syllabus_vector_store_folder, c.created_at
        """, (class_id,))
        
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        row_dict = dict(row)
        return {
            'id': str(row_dict['id']),
            'name': row_dict['name'],
            'description': row_dict['description'],
            'facultyId': str(row_dict['faculty_id']),
            'vectorStoreFolder': row_dict.get('vector_store_folder'),
            'syllabusVectorStoreFolder': row_dict.get('syllabus_vector_store_folder'),
            'studentIds': [str(id) for id in (row_dict.get('student_ids') or [])],
            'pendingEmails': row_dict.get('pending_emails') or [],
            'createdAt': row_dict.get('created_at')
        }
    except Exception as e:
        print(f'[DB] Error getting class by ID: {e}')
        raise
    finally:
        return_connection(conn)

def get_classes_by_faculty(faculty_id: str) -> List[Dict]:
    """Gets classes by faculty ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute("""
            SELECT c.*, 
                   COALESCE(
                     ARRAY_AGG(DISTINCT cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
                     ARRAY[]::INTEGER[]
                   ) as student_ids,
                   COALESCE(
                     ARRAY_AGG(DISTINCT pce.email) FILTER (WHERE pce.email IS NOT NULL), 
                     ARRAY[]::VARCHAR[]
                   ) as pending_emails
            FROM classes c
            LEFT JOIN class_students cs ON c.id = cs.class_id
            LEFT JOIN pending_class_enrollments pce ON c.id = pce.class_id
            WHERE c.faculty_id = %s
            GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder,
                     c.syllabus_vector_store_folder, c.created_at
            ORDER BY c.created_at DESC
        """, (faculty_id,))
        
        rows = cursor.fetchall()
        cursor.close()
        
        return [{
            'id': str(row['id']),
            'name': row['name'],
            'description': row['description'],
            'facultyId': str(row['faculty_id']),
            'vectorStoreFolder': row.get('vector_store_folder'),
            'syllabusVectorStoreFolder': row.get('syllabus_vector_store_folder'),
            'studentIds': [str(id) for id in (row.get('student_ids') or [])],
            'pendingEmails': row.get('pending_emails') or [],
            'createdAt': row.get('created_at')
        } for row in rows]
    except Exception as e:
        print(f'[DB] Error getting classes by faculty: {e}')
        raise
    finally:
        return_connection(conn)

def get_classes_by_student(student_id: str) -> List[Dict]:
    """Gets classes by student ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cursor.execute("""
            SELECT c.*, 
                   COALESCE(
                     ARRAY_AGG(DISTINCT cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
                     ARRAY[]::INTEGER[]
                   ) as student_ids,
                   COALESCE(
                     ARRAY_AGG(DISTINCT pce.email) FILTER (WHERE pce.email IS NOT NULL), 
                     ARRAY[]::VARCHAR[]
                   ) as pending_emails
            FROM classes c
            LEFT JOIN class_students cs ON c.id = cs.class_id
            LEFT JOIN pending_class_enrollments pce ON c.id = pce.class_id
            WHERE cs.student_id = %s
            GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder,
                     c.syllabus_vector_store_folder, c.created_at
            ORDER BY c.created_at DESC
        """, (student_id,))
        
        rows = cursor.fetchall()
        cursor.close()
        
        return [{
            'id': str(row['id']),
            'name': row['name'],
            'description': row['description'],
            'facultyId': str(row['faculty_id']),
            'vectorStoreFolder': row.get('vector_store_folder'),
            'syllabusVectorStoreFolder': row.get('syllabus_vector_store_folder'),
            'studentIds': [str(id) for id in (row.get('student_ids') or [])],
            'pendingEmails': row.get('pending_emails') or [],
            'createdAt': row.get('created_at')
        } for row in rows]
    except Exception as e:
        print(f'[DB] Error getting classes by student: {e}')
        raise
    finally:
        return_connection(conn)

def create_class(class_data: Dict) -> Dict:
    """Creates a new class"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Commit any pending transaction before changing autocommit
        conn.commit()
        conn.autocommit = False
        
        try:
            # Check if class with same name exists (normalized comparison)
            vector_store_folder = generate_vector_store_folder_name(class_data['name'])
            cursor.execute(
                'SELECT id, name FROM classes WHERE faculty_id = %s',
                (class_data['facultyId'],)
            )
            for row in cursor.fetchall():
                if generate_vector_store_folder_name(row[1]) == vector_store_folder:
                    raise Exception(f'A class matching "{class_data["name"]}" already exists (as "{row[1]}"). Please use a different name.')
            
            # Insert class (folder name updated after we get the ID)
            cursor.execute(
                """INSERT INTO classes (name, description, faculty_id, vector_store_folder)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, created_at""",
                [
                    class_data['name'],
                    class_data.get('description', ''),
                    class_data['facultyId'],
                    vector_store_folder  # temporary, updated below
                ]
            )

            row = cursor.fetchone()
            class_id = row[0]

            # Append class ID to make folder name collision-free across professors
            vector_store_folder = f"{vector_store_folder}_c{class_id}"
            cursor.execute(
                'UPDATE classes SET vector_store_folder = %s WHERE id = %s',
                (vector_store_folder, class_id)
            )

            conn.commit()

            return {
                **class_data,
                'id': str(class_id),
                'vectorStoreFolder': vector_store_folder,
                'createdAt': row[1]
            }
        except Exception as e:
            conn.rollback()
            raise
    except Exception as e:
        print(f'[DB] Error creating class: {e}')
        raise
    finally:
        return_connection(conn)

def add_student_to_class(class_id: str, student_id: str) -> Optional[Dict]:
    """Adds a student to a class"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        student_masked_id = get_masked_id(student_id)
        
        cursor.execute(
            """INSERT INTO class_students (class_id, student_id, student_masked_id) 
               VALUES (%s, %s, %s) 
               ON CONFLICT (class_id, student_id) DO NOTHING""",
            (class_id, student_id, student_masked_id)
        )
        conn.commit()
        
        return get_class_by_id(class_id)
    except Exception as e:
        print(f'[DB] Error adding student to class: {e}')
        raise
    finally:
        return_connection(conn)

def remove_student_from_class(class_id: str, student_id: str) -> Optional[Dict]:
    """Removes a student from a class"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM class_students WHERE class_id = %s AND student_id = %s',
            (class_id, student_id)
        )
        conn.commit()
        
        return get_class_by_id(class_id)
    except Exception as e:
        print(f'[DB] Error removing student from class: {e}')
        raise
    finally:
        return_connection(conn)

def delete_class(class_id: str) -> bool:
    """Deletes a class"""
    conn = get_connection()
    try:
        # Check if class exists
        class_obj = get_class_by_id(class_id)
        if not class_obj:
            return False
        
        cursor = conn.cursor()
        cursor.execute('DELETE FROM classes WHERE id = %s', (class_id,))
        conn.commit()
        
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error deleting class: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# ASSIGNMENT OPERATIONS
# ============================================================================

def get_assignments_by_class(class_id: str) -> List[Dict]:
    """Gets assignments by class ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            'SELECT * FROM assignments WHERE class_id = %s ORDER BY created_at DESC',
            (class_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        
        return [{
            'id': str(row['id']),
            'classId': str(row['class_id']),
            'facultyId': str(row['faculty_id']),
            'name': row['name'],
            'dueDate': row['due_date'],
            'canvasLink': row.get('canvas_link'),
            'pdfFileName': row['pdf_file_name'],
            'createdAt': row['created_at']
        } for row in rows]
    except Exception as e:
        print(f'[DB] Error getting assignments by class: {e}')
        raise
    finally:
        return_connection(conn)

def get_assignment_by_id(assignment_id: str) -> Optional[Dict]:
    """Gets assignment by ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute('SELECT * FROM assignments WHERE id = %s', (assignment_id,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return {
            'id': str(row['id']),
            'classId': str(row['class_id']),
            'facultyId': str(row['faculty_id']),
            'name': row['name'],
            'dueDate': row['due_date'],
            'canvasLink': row.get('canvas_link'),
            'pdfFileName': row['pdf_file_name'],
            'createdAt': row['created_at']
        }
    except Exception as e:
        print(f'[DB] Error getting assignment by ID: {e}')
        raise
    finally:
        return_connection(conn)

def create_assignment(assignment_data: Dict) -> Dict:
    """Creates a new assignment"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO assignments (class_id, faculty_id, name, due_date, canvas_link, pdf_file_name) 
               VALUES (%s, %s, %s, %s, %s, %s) 
               RETURNING id, created_at""",
            [
                assignment_data['classId'],
                assignment_data['facultyId'],
                assignment_data['name'],
                assignment_data['dueDate'],
                assignment_data.get('canvasLink'),
                assignment_data['pdfFileName']
            ]
        )
        
        row = cursor.fetchone()
        conn.commit()
        
        return {
            **assignment_data,
            'id': str(row[0]),
            'createdAt': row[1]
        }
    except Exception as e:
        print(f'[DB] Error creating assignment: {e}')
        raise
    finally:
        return_connection(conn)

def delete_assignment(assignment_id: str) -> bool:
    """Deletes an assignment"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM assignments WHERE id = %s', (assignment_id,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error deleting assignment: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# RESOURCE OPERATIONS
# ============================================================================

def get_resources_by_class(class_id: str) -> List[Dict]:
    """Gets resources by class ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            'SELECT * FROM resources WHERE class_id = %s ORDER BY uploaded_at DESC',
            (class_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        
        return [{
            'id': str(row['id']),
            'classId': str(row['class_id']),
            'facultyId': str(row['faculty_id']),
            'fileName': row.get('file_name') or row.get('filename'),
            'fileSize': int(row['file_size']),
            'uploadedAt': row['uploaded_at']
        } for row in rows]
    except Exception as e:
        print(f'[DB] Error getting resources by class: {e}')
        raise
    finally:
        return_connection(conn)

def get_resource_by_file_name(class_id: str, file_name: str) -> Optional[Dict]:
    """Gets resource by class ID and file name"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            'SELECT * FROM resources WHERE class_id = %s AND file_name = %s',
            (class_id, file_name)
        )
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return {
            'id': str(row['id']),
            'classId': str(row['class_id']),
            'facultyId': str(row['faculty_id']),
            'fileName': row.get('file_name') or row.get('filename'),
            'fileSize': int(row['file_size']),
            'uploadedAt': row['uploaded_at']
        }
    except Exception as e:
        print(f'[DB] Error getting resource by file name: {e}')
        raise
    finally:
        return_connection(conn)

def create_resource(resource_data: Dict) -> Dict:
    """Creates a new resource"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO resources (class_id, faculty_id, file_name, file_size) 
               VALUES (%s, %s, %s, %s) 
               RETURNING id, uploaded_at""",
            [
                resource_data['classId'],
                resource_data['facultyId'],
                resource_data['fileName'],
                resource_data['fileSize']
            ]
        )
        
        row = cursor.fetchone()
        conn.commit()
        
        return {
            **resource_data,
            'id': str(row[0]),
            'uploadedAt': row[1]
        }
    except Exception as e:
        print(f'[DB] Error creating resource: {e}')
        raise
    finally:
        return_connection(conn)

def delete_resource_by_id(resource_id: str) -> bool:
    """Deletes a resource"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM resources WHERE id = %s', (resource_id,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error deleting resource: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# RAG CONVERSATION OPERATIONS
# ============================================================================

def _parse_json_field(value: Any, default: Any = None) -> Any:
    """Parse JSON from DB: psycopg2 may return JSONB as dict/list already, or as str."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    import json
    try:
        return json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return default

def get_rag_conversations_by_user(user_id: str, class_id: Optional[str] = None, 
                                   chat_type: Optional[str] = None) -> List[Dict]:
    """Gets RAG conversations by user"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        query = 'SELECT * FROM rag_conversations WHERE user_id = %s AND status = %s'
        params = [user_id, 'active']
        
        if class_id and class_id != 'entire-corpus':
            query += ' AND class_id = %s'
            params.append(class_id)
        elif class_id == 'entire-corpus':
            query += ' AND class_id IS NULL'
        
        if chat_type:
            query += ' AND chat_type = %s'
            params.append(chat_type)
        
        query += ' ORDER BY updated_at DESC'
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        cursor.close()
        
        conversations = []
        for row in rows:
            row_dict = dict(row)
            message_history = _parse_json_field(row_dict.get('message_history'), [])
            # First user message snippet for list card title (avoid "Chat (Date)" on frontend)
            title_snippet = None
            if isinstance(message_history, list):
                for msg in message_history:
                    if isinstance(msg, dict) and msg.get('role') == 'user':
                        content = (msg.get('content') or '').strip()
                        if content:
                            title_snippet = content[:45].strip() + ('...' if len(content) > 45 else '')
                        break
            conversations.append({
                'id': str(row_dict['id']),
                'userId': str(row_dict['user_id']),
                'userMaskedId': row_dict.get('user_masked_id') or f"USER_{row_dict['user_id']}",
                'classId': str(row_dict['class_id']) if row_dict.get('class_id') else None,
                'chatType': row_dict.get('chat_type'),
                'title': row_dict['title'],
                'titleSnippet': title_snippet,
                'createdAt': row_dict['created_at'],
                'updatedAt': row_dict['updated_at'],
                'status': row_dict['status'],
                'currentTopic': row_dict.get('current_topic'),
                'checkpointState': _parse_json_field(row_dict.get('checkpoint_state'), {}),
                'messageHistory': message_history,
                'studentProblemData': _parse_json_field(row_dict.get('student_problem_data'), {}),
                'cachedContext': _parse_json_field(row_dict.get('cached_context')),
                'lastRetrievalTopic': row_dict.get('last_retrieval_topic'),
                'cachedSentiment': float(row_dict['cached_sentiment']) if row_dict.get('cached_sentiment') else None,
                'cachedTopics': _parse_json_field(row_dict.get('cached_topics')),
                'analyticsLastUpdated': row_dict.get('analytics_last_updated'),
                'conversationSummary': row_dict.get('conversation_summary')
            })
        
        return conversations
    except Exception as e:
        print(f'[DB] Error getting RAG conversations: {e}')
        raise
    finally:
        return_connection(conn)

def get_rag_conversation_by_id(conversation_id: str, conn=None) -> Optional[Dict]:
    """Gets RAG conversation by ID. If conn is provided, uses it (caller owns it); otherwise gets and returns a pool connection."""
    if not conversation_id or conversation_id in ('undefined', 'null'):
        return None

    own_conn = conn is None
    if own_conn:
        conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute('SELECT * FROM rag_conversations WHERE id = %s', (conversation_id,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        row_dict = dict(row)
        return {
            'id': str(row_dict['id']),
            'userId': str(row_dict['user_id']),
            'userMaskedId': row_dict.get('user_masked_id') or f"USER_{row_dict['user_id']}",
            'classId': str(row_dict['class_id']) if row_dict.get('class_id') else None,
            'chatType': row_dict.get('chat_type'),
            'title': row_dict['title'],
            'createdAt': row_dict['created_at'],
            'updatedAt': row_dict['updated_at'],
            'status': row_dict['status'],
            'currentTopic': row_dict.get('current_topic'),
            'checkpointState': _parse_json_field(row_dict.get('checkpoint_state'), {}),
            'messageHistory': _parse_json_field(row_dict.get('message_history'), []),
            'studentProblemData': _parse_json_field(row_dict.get('student_problem_data'), {}),
            'cachedContext': _parse_json_field(row_dict.get('cached_context')),
            'lastRetrievalTopic': row_dict.get('last_retrieval_topic'),
            'cachedSentiment': float(row_dict['cached_sentiment']) if row_dict.get('cached_sentiment') else None,
            'cachedTopics': _parse_json_field(row_dict.get('cached_topics')),
            'analyticsLastUpdated': row_dict.get('analytics_last_updated'),
            'conversationSummary': row_dict.get('conversation_summary')
        }
    except Exception as e:
        print(f'[DB] Error getting RAG conversation by ID: {e}')
        raise
    finally:
        if own_conn:
            return_connection(conn)

def create_rag_conversation(user_id: str, title: Optional[str] = None, 
                            class_id: Optional[str] = None, 
                            chat_type: str = 'class_material') -> Dict:
    """Creates a new RAG conversation"""
    conn = get_connection()
    try:
        import json
        import hashlib
        from datetime import datetime
        
        conversation_title = title or f"Chat {datetime.now().strftime('%Y-%m-%d')}"
        user_masked_id = hashlib.sha256(str(user_id).encode()).hexdigest()[:16]
        
        # Handle "entire-corpus" special case
        db_class_id = class_id if (class_id and class_id != 'entire-corpus') else None
        
        checkpoint_state = {
            "checkpoint_1_passed": False,
            "checkpoint_2_passed": False,
            "checkpoint_3_passed": False,
            "understanding_level": 0,
            "awaiting_student_response": True
        }
        
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            """INSERT INTO rag_conversations 
               (user_id, user_masked_id, class_id, title, chat_type, checkpoint_state, message_history, student_problem_data) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) 
               RETURNING *""",
            [
                user_id,
                user_masked_id,
                db_class_id,
                conversation_title,
                chat_type,
                json.dumps(checkpoint_state),
                json.dumps([]),
                json.dumps({"numbers": [], "problem_type": None, "chapter": None})
            ]
        )
        
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        row_dict = dict(row)
        return {
            'id': str(row_dict['id']),
            'userId': str(row_dict['user_id']),
            'userMaskedId': row_dict.get('user_masked_id') or f"USER_{row_dict['user_id']}",
            'classId': str(row_dict['class_id']) if row_dict.get('class_id') else None,
            'chatType': row_dict.get('chat_type'),
            'title': row_dict['title'],
            'createdAt': row_dict['created_at'],
            'updatedAt': row_dict['updated_at'],
            'status': row_dict['status'],
            'currentTopic': row_dict.get('current_topic'),
            'checkpointState': checkpoint_state,
            'messageHistory': [],
            'studentProblemData': {"numbers": [], "problem_type": None, "chapter": None},
            'cachedContext': None,
            'lastRetrievalTopic': None,
            'cachedSentiment': None,
            'cachedTopics': None,
            'analyticsLastUpdated': None,
            'conversationSummary': None
        }
    except Exception as e:
        print(f'[DB] Error creating RAG conversation: {e}')
        raise
    finally:
        return_connection(conn)

def update_rag_conversation(conversation_id: str, updates: Dict) -> Optional[Dict]:
    """Updates a RAG conversation"""
    conn = get_connection()
    try:
        import json
        from datetime import datetime
        
        update_fields = []
        values = []
        
        if 'title' in updates:
            update_fields.append('title = %s')
            values.append(updates['title'])
        if 'status' in updates:
            update_fields.append('status = %s')
            values.append(updates['status'])
        if 'currentTopic' in updates:
            update_fields.append('current_topic = %s')
            values.append(updates['currentTopic'])
        if 'checkpointState' in updates:
            update_fields.append('checkpoint_state = %s')
            values.append(json.dumps(updates['checkpointState']))
        if 'messageHistory' in updates:
            update_fields.append('message_history = %s')
            values.append(json.dumps(updates['messageHistory']))
        if 'studentProblemData' in updates:
            update_fields.append('student_problem_data = %s')
            values.append(json.dumps(updates['studentProblemData']))
        if 'cachedContext' in updates:
            update_fields.append('cached_context = %s')
            values.append(json.dumps(updates['cachedContext']))
        if 'lastRetrievalTopic' in updates:
            update_fields.append('last_retrieval_topic = %s')
            values.append(updates['lastRetrievalTopic'])
        if 'cachedSentiment' in updates:
            update_fields.append('cached_sentiment = %s')
            values.append(updates['cachedSentiment'])
        if 'cachedTopics' in updates:
            update_fields.append('cached_topics = %s')
            values.append(json.dumps(updates['cachedTopics']))
        if 'analyticsLastUpdated' in updates:
            update_fields.append('analytics_last_updated = %s')
            values.append(updates['analyticsLastUpdated'])
        if 'conversationSummary' in updates:
            update_fields.append('conversation_summary = %s')
            values.append(updates['conversationSummary'])
        
        if not update_fields:
            return get_rag_conversation_by_id(conversation_id, conn=conn)

        update_fields.append('updated_at = %s')
        values.append(datetime.now())
        values.append(conversation_id)
        
        cursor = conn.cursor()
        cursor.execute(
            f'UPDATE rag_conversations SET {", ".join(update_fields)} WHERE id = %s',
            values
        )
        conn.commit()
        cursor.close()

        return get_rag_conversation_by_id(conversation_id, conn=conn)
    except Exception as e:
        print(f'[DB] Error updating RAG conversation: {e}')
        raise
    finally:
        return_connection(conn)

def archive_rag_conversation(conversation_id: str) -> bool:
    """Archives a RAG conversation"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE rag_conversations SET status = %s WHERE id = %s',
            ('archived', conversation_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error archiving RAG conversation: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# CORPUS FILE OPERATIONS
# ============================================================================

def get_corpus_files_by_class(class_id: str, material_type: Optional[str] = None) -> List[Dict]:
    """Gets corpus files by class ID"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        query = 'SELECT * FROM corpus_files WHERE class_id = %s'
        params = [class_id]
        
        if material_type:
            query += ' AND material_type = %s'
            params.append(material_type)
        
        query += ' ORDER BY id ASC'
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        cursor.close()
        
        return [{
            'id': str(row['id']),
            'classId': str(row['class_id']),
            'fileName': row.get('file_name') or row.get('filename'),
            'materialType': row['material_type'],
            'fileSize': row.get('file_size'),
            'chunkCount': row.get('chunk_count', 0),
            'isIndexed': row.get('is_indexed', False) or (row.get('status') == 'indexed'),
            'indexedAt': row.get('indexed_at'),
            'uploadedAt': row.get('uploaded_at') or row.get('created_at')
        } for row in rows]
    except Exception as e:
        print(f'[DB] Error getting corpus files: {e}')
        raise
    finally:
        return_connection(conn)

def get_corpus_file(class_id: str, file_name: str, material_type: str) -> Optional[Dict]:
    """Gets corpus file by class ID and file name"""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(
            'SELECT * FROM corpus_files WHERE class_id = %s AND file_name = %s AND material_type = %s',
            (class_id, file_name, material_type)
        )
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return {
            'id': str(row['id']),
            'classId': str(row['class_id']),
            'fileName': row.get('file_name') or row.get('filename'),
            'materialType': row['material_type'],
            'fileSize': row.get('file_size'),
            'chunkCount': row.get('chunk_count', 0),
            'isIndexed': row.get('is_indexed', False) or (row.get('status') == 'indexed'),
            'indexedAt': row.get('indexed_at'),
            'uploadedAt': row.get('uploaded_at') or row.get('created_at')
        }
    except Exception as e:
        print(f'[DB] Error getting corpus file: {e}')
        raise
    finally:
        return_connection(conn)

def create_corpus_file(class_id: str, file_name: str, material_type: str, 
                       file_size: Optional[int] = None, uploaded_by: Optional[str] = None) -> Dict:
    """Creates a corpus file record (uploaded_by kept for API compatibility; DB may not have column)."""
    conn = get_connection()
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            # Try minimal columns first (corpus_files may not have uploaded_by or status)
            cursor.execute(
                """INSERT INTO corpus_files (class_id, file_name, material_type, file_size)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (class_id, file_name, material_type) 
                   DO UPDATE SET file_size = EXCLUDED.file_size
                   RETURNING *""",
                [class_id, file_name, material_type, file_size]
            )
        except Exception as e:
            # If ON CONFLICT constraint differs, try without it
            conn.rollback()
            cursor.execute(
                """INSERT INTO corpus_files (class_id, file_name, material_type, file_size)
                   VALUES (%s, %s, %s, %s)
                   RETURNING *""",
                [class_id, file_name, material_type, file_size]
            )
        
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        row_dict = dict(row)
        return {
            'id': str(row_dict['id']),
            'classId': str(row_dict['class_id']),
            'fileName': row_dict.get('file_name') or row_dict.get('filename'),
            'materialType': row_dict['material_type'],
            'fileSize': row_dict.get('file_size'),
            'chunkCount': row_dict.get('chunk_count', 0),
            'isIndexed': row_dict.get('is_indexed', False) or (row_dict.get('status') == 'indexed'),
            'indexedAt': row_dict.get('indexed_at'),
            'uploadedAt': row_dict.get('uploaded_at') or row_dict.get('created_at')
        }
    except Exception as e:
        print(f'[DB] Error creating corpus file: {e}')
        raise
    finally:
        return_connection(conn)

def delete_corpus_file(class_id: str, file_name: str, material_type: str) -> bool:
    """Deletes a corpus file"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM corpus_files WHERE class_id = %s AND file_name = %s AND material_type = %s',
            (class_id, file_name, material_type)
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error deleting corpus file: {e}')
        raise
    finally:
        return_connection(conn)

def delete_all_corpus_files(class_id: str, material_type: str) -> int:
    """Deletes all corpus files for a class"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM corpus_files WHERE class_id = %s AND material_type = %s',
            (class_id, material_type)
        )
        conn.commit()
        return cursor.rowcount
    except Exception as e:
        print(f'[DB] Error deleting all corpus files: {e}')
        raise
    finally:
        return_connection(conn)

def reset_corpus_files_index(class_id: str, material_type: str) -> int:
    """Marks a class's corpus files as not indexed (after its chunks were cleared)"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE corpus_files SET is_indexed = false, chunk_count = 0, indexed_at = NULL
               WHERE class_id = %s AND material_type = %s""",
            (class_id, material_type)
        )
        conn.commit()
        return cursor.rowcount
    except Exception as e:
        conn.rollback()
        print(f'[DB] Error resetting corpus file index state: {e}')
        raise
    finally:
        return_connection(conn)

def mark_corpus_file_as_indexed(class_id: str, file_name: str, material_type: str, chunk_count: int) -> bool:
    """Marks a corpus file as indexed (schema: is_indexed, chunk_count, indexed_at)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE corpus_files 
               SET is_indexed = true, chunk_count = %s, indexed_at = CURRENT_TIMESTAMP
               WHERE class_id = %s AND file_name = %s AND material_type = %s""",
            (chunk_count, class_id, file_name, material_type)
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f'[DB] Error marking corpus file as indexed: {e}')
        raise
    finally:
        return_connection(conn)

# ============================================================================
# ANALYTICS OPERATIONS
# ============================================================================

def get_student_activity(user_id: str, class_id: Optional[str] = None, skip_llm_analysis: bool = False) -> Dict:
    """Gets student activity analytics"""
    # Get conversations
    conversations = get_rag_conversations_by_user(user_id, class_id)
    
    if not conversations:
        return {
            'userId': user_id,
            'totalChatTime': 0,
            'totalSessions': 0,
            'averageSentiment': 0,
            'topTopics': [],
            'sentimentWords': [],
            'lastActive': datetime.now().isoformat()
        }
    
    # Calculate total chat time
    total_chat_time = 0
    all_messages = []
    
    for conversation in conversations:
        messages = conversation.get('messageHistory', [])
        all_messages.extend(messages)
        
        if len(messages) >= 2:
            user_messages = [m for m in messages if m.get('role') == 'user']
            assistant_messages = [m for m in messages if m.get('role') == 'assistant']
            
            if user_messages and assistant_messages:
                try:
                    first_user_time = datetime.fromisoformat(str(user_messages[0].get('timestamp', '')))
                    last_assistant_time = datetime.fromisoformat(str(assistant_messages[-1].get('timestamp', '')))
                    session_time = (last_assistant_time - first_user_time).total_seconds() / 60
                    total_chat_time += max(0, session_time)
                except:
                    pass
    
    total_sessions = len(conversations)
    last_active = conversations[0].get('updatedAt') if conversations else datetime.now()
    
    # Get sentiment and topics from latest conversation
    latest_conversation = conversations[0] if conversations else None
    average_sentiment = latest_conversation.get('cachedSentiment', 0) if latest_conversation else 0
    top_topics = latest_conversation.get('cachedTopics', []) if latest_conversation else []
    sentiment_words = []  # Simplified for now
    
    return {
        'userId': user_id,
        'totalChatTime': int(total_chat_time),
        'totalSessions': total_sessions,
        'averageSentiment': float(average_sentiment) if average_sentiment else 0,
        'topTopics': top_topics if isinstance(top_topics, list) else [],
        'sentimentWords': sentiment_words,
        'lastActive': last_active.isoformat() if hasattr(last_active, 'isoformat') else str(last_active)
    }

def get_student_activities_by_class(class_id: str) -> List[Dict]:
    """Gets student activities for all students in a class"""
    cls = get_class_by_id(class_id)
    if not cls:
        return []
    
    student_ids = cls.get('studentIds', [])
    activities = []
    
    for student_id in student_ids:
        activity = get_student_activity(student_id, class_id, skip_llm_analysis=False)
        activities.append(activity)
    
    return activities
