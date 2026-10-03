"""
User management endpoints
Migrated from app/api/users/*/route.ts and app/api/students/route.ts
"""
from flask import Blueprint, request, jsonify
from services import auth_service, db_service
from utils.pii_masking import mask_user_data, MaskingContext
import os

bp = Blueprint("users", __name__)

def get_requesting_user():
    """Gets requesting user from session"""
    session_id = request.headers.get("X-Session-Id")
    if not session_id:
        return None
    
    session = auth_service.get_session(session_id)
    if not session:
        return None
    
    return session['user']

@bp.route("", methods=["GET"])
def get_users():
    """Get users endpoint - migrated from app/api/users/route.ts"""
    try:
        requesting_user = get_requesting_user()
        
        role = request.args.get("role")
        user_id = request.args.get("id")
        email = request.args.get("email")
        
        if user_id:
            # Get specific user by ID
            user = db_service.get_user_by_id(
                user_id,
                requesting_user.get('id') if requesting_user else None,
                requesting_user.get('role') if requesting_user else None
            )
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            return jsonify({
                "user": {
                    "id": user.get("id"),
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "role": user.get("role"),
                    "nuid": user.get("nuid"),
                    "degree": user.get("degree"),
                    "major": user.get("major"),
                    "createdAt": user.get("createdAt").isoformat() if user.get("createdAt") else None,
                }
            })
        
        if email:
            # Get specific user by email
            user = db_service.get_user_by_email(
                email,
                requesting_user.get('id') if requesting_user else None,
                requesting_user.get('role') if requesting_user else None
            )
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            return jsonify({
                "user": {
                    "id": user.get("id"),
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "role": user.get("role"),
                    "nuid": user.get("nuid"),
                    "degree": user.get("degree"),
                    "major": user.get("major"),
                    "createdAt": user.get("createdAt").isoformat() if user.get("createdAt") else None,
                }
            })
        
        # Get all users
        users = db_service.get_users(
            requesting_user.get('id') if requesting_user else None,
            requesting_user.get('role') if requesting_user else None
        )
        
        if role:
            users = [u for u in users if u.get('role') == role]
        
        return jsonify({
            "users": [{
                "id": u.get("id"),
                "email": u.get("email"),
                "name": u.get("name"),
                "role": u.get("role"),
                "nuid": u.get("nuid"),
                "degree": u.get("degree"),
                "major": u.get("major"),
                "createdAt": u.get("createdAt").isoformat() if u.get("createdAt") else None,
            } for u in users]
        })
    except Exception as error:
        print(f"[USERS] GET USERS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/ta-mode", methods=["GET", "PUT"])
def ta_mode():
    """TA mode endpoint - migrated from app/api/users/ta-mode/route.ts"""
    try:
        if request.method == "GET":
            user_id = request.args.get("userId")
            if not user_id:
                return jsonify({"error": "User ID is required"}), 400
            
            ta_mode = db_service.get_user_ta_mode(user_id)
            if ta_mode is None:
                return jsonify({"error": "User not found"}), 404
            
            return jsonify({"taMode": ta_mode})
        
        elif request.method == "PUT":
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            user_id = data.get("userId")
            ta_mode = data.get("taMode")
            
            if not user_id:
                return jsonify({"error": "User ID is required"}), 400
            
            if ta_mode not in ("lenient", "normal", "strict"):
                return jsonify({"error": "Invalid TA mode. Must be 'lenient', 'normal', or 'strict'"}), 400
            
            # Verify user exists and is faculty
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if user.get('role') != 'faculty':
                return jsonify({"error": "Only faculty can set TA mode"}), 403
            
            # Update TA mode
            success = db_service.update_user_ta_mode(user_id, ta_mode)
            if not success:
                return jsonify({"error": "Failed to update TA mode"}), 500
            
            return jsonify({"success": True, "taMode": ta_mode})
    except Exception as error:
        print(f"[USERS] TA MODE ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500
