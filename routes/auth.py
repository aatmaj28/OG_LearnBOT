"""
Authentication endpoints
Migrated from app/api/auth/*/route.ts
"""
from flask import Blueprint, request, jsonify
from services import auth_service
from utils.pii_masking import mask_user_data, MaskingContext
import os

bp = Blueprint("auth", __name__)

@bp.route("/login", methods=["POST"])
def login():
    """
    Login endpoint - migrated from app/api/auth/login/route.ts
    
    Request body:
    {
        "email": "user@example.com",
        "password": "password123",
        "role": "student" (optional)
    }
    
    Response:
    {
        "success": true,
        "sessionId": "session_id_here",
        "user": { ... }
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        email = data.get("email")
        password = data.get("password")
        role = data.get("role")  # Optional
        
        print(f"[AUTH] LOGIN: Starting login process for: {email}, role: {role}")
        
        # Validate input
        if not email or not password:
            print("[AUTH] LOGIN: Missing email or password")
            return jsonify({"error": "Email and password are required"}), 400
        
        # Try to authenticate
        user = auth_service.login(email, password)
        
        if not user:
            print(f"[AUTH] LOGIN: Authentication failed for: {email}")
            return jsonify({"error": "Invalid credentials"}), 401
        
        # Check role if specified
        if role and user.get('role') != role:
            print(f"[AUTH] LOGIN: Role mismatch. Expected: {role}, Got: {user.get('role')}")
            return jsonify({"error": "Invalid role"}), 403
        
        print(f"[AUTH] LOGIN: User authenticated successfully: {user.get('email')}, role: {user.get('role')}")
        
        # Create session
        session_id = auth_service.create_session(user)
        print(f"[AUTH] LOGIN: Session created successfully: {session_id}")
        
        # Apply PII masking to response
        environment = os.getenv("FLASK_ENV", "development")
        context = MaskingContext(
            requesting_user_id=user.get('id'),
            requesting_user_role=user.get('role'),
            environment=environment
        )
        
        masked_user = mask_user_data(user, context)
        
        return jsonify({
            "success": True,
            "sessionId": session_id,
            "user": {
                "id": masked_user.get("id"),
                "email": masked_user.get("email"),
                "name": masked_user.get("name"),
                "role": masked_user.get("role"),
                "nuid": masked_user.get("nuid"),
                "degree": masked_user.get("degree"),
                "major": masked_user.get("major"),
            }
        })
    except Exception as error:
        print(f"[AUTH] LOGIN ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/register", methods=["POST"])
def register():
    """Register endpoint - migrated from app/api/auth/register/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        email = data.get("email")
        password = data.get("password")
        name = data.get("name")
        role = data.get("role")
        nuid = data.get("nuid")
        degree = data.get("degree")
        major = data.get("major")
        
        print(f"[AUTH] REGISTER: Starting registration for: {email}, role: {role}")
        
        # Validate input
        if not email or not password or not name or not role:
            return jsonify({"error": "Email, password, name, and role are required"}), 400
        
        # Validate role
        if role not in ("student", "faculty"):
            return jsonify({"error": "Role must be 'student' or 'faculty'"}), 400
        
        # Check if user already exists
        from services.db_service import get_user_by_email_internal, get_user_by_nuid_internal, create_user
        
        existing_user = get_user_by_email_internal(email)
        if existing_user:
            return jsonify({"error": "User with this email already exists"}), 409
        
        # Check NUID if provided
        if role == "student" and nuid:
            existing_nuid = get_user_by_nuid_internal(nuid)
            if existing_nuid:
                return jsonify({"error": "User with this NUID already exists"}), 409
        
        # Create user
        new_user = create_user({
            "email": email,
            "password": password,  # In production, hash this!
            "name": name,
            "role": role,
            "nuid": nuid if role == "student" else None,
            "degree": degree if role == "student" else None,
            "major": major if role == "student" else None,
        })
        
        print(f"[AUTH] REGISTER: User created successfully: {new_user.get('email')}")
        
        # Create session
        session_id = auth_service.create_session(new_user)
        
        # Apply PII masking
        environment = os.getenv("FLASK_ENV", "development")
        context = MaskingContext(
            requesting_user_id=new_user.get('id'),
            requesting_user_role=new_user.get('role'),
            environment=environment
        )
        
        masked_user = mask_user_data(new_user, context)
        
        return jsonify({
            "success": True,
            "sessionId": session_id,
            "user": {
                "id": masked_user.get("id"),
                "email": masked_user.get("email"),
                "name": masked_user.get("name"),
                "role": masked_user.get("role"),
                "nuid": masked_user.get("nuid"),
                "degree": masked_user.get("degree"),
            }
        })
    except Exception as error:
        print(f"[AUTH] REGISTER ERROR: {error}")
        return jsonify({"error": "Failed to create user"}), 500

@bp.route("/logout", methods=["POST"])
def logout():
    """Logout endpoint - migrated from app/api/auth/logout/route.ts"""
    try:
        data = request.get_json()
        session_id = data.get("sessionId") if data else None
        
        if session_id:
            auth_service.delete_session(session_id)
        
        return jsonify({"success": True})
    except Exception as error:
        print(f"[AUTH] LOGOUT ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/session", methods=["POST"])
def session():
    """Session endpoint - migrated from app/api/auth/session/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        session_id = data.get("sessionId")
        if not session_id:
            return jsonify({"error": "Session ID required"}), 400
        
        session = auth_service.get_session(session_id)
        if not session:
            return jsonify({"error": "Invalid or expired session"}), 401
        
        # Apply PII masking
        user = session['user']
        environment = os.getenv("FLASK_ENV", "development")
        context = MaskingContext(
            requesting_user_id=user.get('id'),
            requesting_user_role=user.get('role'),
            environment=environment
        )
        
        masked_user = mask_user_data(user, context)
        
        return jsonify({
            "success": True,
            "user": {
                "id": masked_user.get("id"),
                "email": masked_user.get("email"),
                "name": masked_user.get("name"),
                "role": masked_user.get("role"),
            }
        })
    except Exception as error:
        print(f"[AUTH] SESSION ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/send-otp", methods=["POST"])
def send_otp():
    """Send OTP endpoint - migrated from app/api/auth/send-otp/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        email = data.get("email")
        password = data.get("password")
        name = data.get("name")
        role = data.get("role")
        nuid = data.get("nuid")
        degree = data.get("degree")
        major = data.get("major")
        
        print(f"[AUTH] SEND-OTP: Initiating OTP send for: {email}")
        
        # Validate input
        if not email or not password or not name or not role:
            return jsonify({"error": "Email, password, name, and role are required"}), 400
        
        # Validate role
        if role not in ("student", "faculty"):
            return jsonify({"error": "Role must be 'student' or 'faculty'"}), 400
        
        # Check if user already exists
        from services.db_service import get_user_by_email_internal, get_user_by_nuid_internal, create_pending_registration
        from services.email_service import send_verification_email
        import random
        from datetime import datetime, timedelta
        
        existing_user = get_user_by_email_internal(email)
        if existing_user:
            return jsonify({"error": "User with this email already exists"}), 409
        
        # Check NUID if provided
        if role == "student" and nuid:
            existing_nuid = get_user_by_nuid_internal(nuid)
            if existing_nuid:
                return jsonify({"error": "User with this NUID already exists"}), 409
        
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        expires_at = datetime.now() + timedelta(minutes=10)
        
        # Store pending registration
        create_pending_registration(email, password, name, role, nuid, degree, major, otp, expires_at)
        print(f"[AUTH] SEND-OTP: Pending registration created with OTP: {otp}")
        
        # Send verification email
        send_verification_email(email, otp, name)
        
        return jsonify({
            "success": True,
            "message": "Verification code sent to your email",
            "email": email
        })
    except Exception as error:
        print(f"[AUTH] SEND-OTP ERROR: {error}")
        return jsonify({"error": "Failed to send verification code"}), 500

@bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    """Verify OTP endpoint - migrated from app/api/auth/verify-otp/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        email = data.get("email")
        otp = data.get("otp")
        
        print(f"[AUTH] VERIFY-OTP: Verifying OTP for: {email}")
        
        if not email or not otp:
            return jsonify({"error": "Email and OTP are required"}), 400
        
        from services.db_service import get_pending_registration, delete_pending_registration, create_user
        from datetime import datetime
        
        # Find pending registration
        pending_reg = get_pending_registration(email, otp)
        
        if not pending_reg:
            print("[AUTH] VERIFY-OTP: Invalid OTP or email")
            return jsonify({"error": "Invalid verification code"}), 400
        
        # Check if OTP has expired
        expires_at = pending_reg['otp_expires_at']
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        
        if datetime.now() > expires_at:
            print("[AUTH] VERIFY-OTP: OTP expired")
            return jsonify({"error": "Verification code has expired. Please request a new one."}), 400
        
        print("[AUTH] VERIFY-OTP: OTP verified successfully, creating user...")
        
        # Create the actual user account
        new_user = create_user({
            "email": pending_reg['email'],
            "password": pending_reg['password'],
            "name": pending_reg['name'],
            "role": pending_reg['role'],
            "nuid": pending_reg.get('nuid'),
            "degree": pending_reg.get('degree'),
            "major": pending_reg.get('major'),
        })
        
        # Delete the pending registration
        delete_pending_registration(email)
        
        print(f"[AUTH] VERIFY-OTP: User created successfully: {new_user.get('email')}")
        
        # Create session
        session_id = auth_service.create_session(new_user)
        
        # Apply PII masking
        environment = os.getenv("FLASK_ENV", "development")
        context = MaskingContext(
            requesting_user_id=new_user.get('id'),
            requesting_user_role=new_user.get('role'),
            environment=environment
        )
        
        masked_user = mask_user_data(new_user, context)
        
        return jsonify({
            "success": True,
            "message": "Account created successfully!",
            "sessionId": session_id,
            "user": {
                "id": masked_user.get("id"),
                "email": masked_user.get("email"),
                "name": masked_user.get("name"),
                "role": masked_user.get("role"),
                "nuid": masked_user.get("nuid"),
                "degree": masked_user.get("degree"),
            }
        })
    except Exception as error:
        print(f"[AUTH] VERIFY-OTP ERROR: {error}")
        return jsonify({"error": "Failed to verify code"}), 500
