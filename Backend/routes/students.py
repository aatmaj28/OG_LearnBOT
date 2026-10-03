"""
Students endpoint
Migrated from app/api/students/route.ts
"""
import os
import re

from flask import Blueprint, request, jsonify
from services import db_service

bp = Blueprint("students", __name__)

# Company email policy. Set COMPANY_EMAIL_DOMAIN (e.g. "acme.com") to restrict employees to a
# single domain; leave it unset to accept any well-formed work email.
COMPANY_EMAIL_DOMAIN = os.getenv("COMPANY_EMAIL_DOMAIN", "").strip().lstrip("@").lower()
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def is_valid_work_email(email: str) -> bool:
    value = (email or "").strip().lower()
    if not EMAIL_PATTERN.match(value):
        return False
    return value.endswith(f"@{COMPANY_EMAIL_DOMAIN}") if COMPANY_EMAIL_DOMAIN else True

@bp.route("", methods=["POST"])
def create_student():
    """Create student endpoint - migrated from app/api/students/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        name = data.get("name")
        email = data.get("email")
        password = data.get("password")
        nuid = data.get("nuid")
        degree = data.get("degree")
        major = data.get("major")
        
        if not name or not email:
            return jsonify({"error": "Name and email are required"}), 400
        
        if not is_valid_work_email(email):
            message = (
                f"Only @{COMPANY_EMAIL_DOMAIN} email addresses are accepted"
                if COMPANY_EMAIL_DOMAIN
                else "A valid work email address is required"
            )
            return jsonify({"error": message}), 400
        
        # Generate default password if not provided
        student_password = password or f"student{int(__import__('time').time() * 1000)}"
        
        # Check if user already exists
        existing_user = db_service.get_user_by_email_internal(email)
        if existing_user:
            return jsonify({"error": "User with this email already exists"}), 409
        
        # Check NUID if provided
        if nuid:
            existing_nuid = db_service.get_user_by_nuid_internal(nuid)
            if existing_nuid:
                return jsonify({"error": "User with this NUID already exists"}), 409
        
        # Create student
        new_student = db_service.create_user({
            "name": name,
            "email": email,
            "password": student_password,
            "role": "student",
            "nuid": nuid,
            "degree": degree,
            "major": major,
        })
        
        return jsonify({"user": new_student})
    except Exception as error:
        print(f"[STUDENTS] CREATE STUDENT ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500
