"""
Class management endpoints
Migrated from app/api/classes/*/route.ts
"""
from flask import Blueprint, request, jsonify
from services import db_service
import os
import pathlib

bp = Blueprint("classes", __name__)

def create_vector_store_manually(folder_name: str, class_name: str) -> bool:
    """Manually creates vector store folder"""
    try:
        vector_stores_dir = pathlib.Path('vector_stores')
        class_vector_store_dir = vector_stores_dir / folder_name
        
        # Create directories
        class_vector_store_dir.mkdir(parents=True, exist_ok=True)
        
        # Create placeholder config.json
        config = {
            "class_name": class_name,
            "vector_store_folder": folder_name,
            "created_at": __import__('datetime').datetime.now().isoformat(),
            "embedding_model": "nomic-ai/nomic-embed-text-v1.5",
            "vector_store_type": "qdrant",
            "status": "ready_for_indexing",
            "note": "Upload PDFs and index them using the corpus management interface. Qdrant will store the vectors automatically."
        }
        
        config_path = class_vector_store_dir / 'config.json'
        import json
        config_path.write_text(json.dumps(config, indent=2))
        
        print(f'✅ Created placeholder config.json for {class_name}')
        return True
    except Exception as e:
        print(f'❌ Manual vector store creation failed: {e}')
        return False

@bp.route("", methods=["GET", "POST"])
def classes():
    """Classes endpoint - migrated from app/api/classes/route.ts"""
    try:
        if request.method == "GET":
            faculty_id = request.args.get("facultyId")
            student_id = request.args.get("studentId")
            
            if faculty_id:
                classes = db_service.get_classes_by_faculty(faculty_id)
                return jsonify({"classes": classes})
            elif student_id:
                classes = db_service.get_classes_by_student(student_id)
                return jsonify({"classes": classes})
            else:
                return jsonify({"error": "Faculty ID or Student ID required"}), 400
        
        elif request.method == "POST":
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            name = data.get("name")
            description = data.get("description", "")
            faculty_id = data.get("facultyId")
            
            if not name or not faculty_id:
                return jsonify({"error": "Name and faculty ID required"}), 400
            
            try:
                new_class = db_service.create_class({
                    "name": name,
                    "description": description,
                    "facultyId": faculty_id,
                    "studentIds": [],
                })
                
                # Create vector store for the new class
                try:
                    # Try to create vector store folder
                    create_vector_store_manually(new_class['vectorStoreFolder'], new_class['name'])
                except Exception as e:
                    print(f'❌ Error creating vector store: {e}')
                    # Continue even if vector store creation fails
                
                return jsonify({"class": new_class})
            except Exception as e:
                if 'already exists' in str(e):
                    return jsonify({"error": str(e)}), 409
                raise
    except Exception as error:
        print(f"[CLASSES] ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/add-student", methods=["POST"])
def add_student():
    """Add student endpoint - migrated from app/api/classes/add-student/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        class_id = data.get("classId")
        student_id = data.get("studentId")
        
        if not class_id or not student_id:
            return jsonify({"error": "Class ID and Student ID are required"}), 400
        
        updated_class = db_service.add_student_to_class(class_id, student_id)
        if not updated_class:
            return jsonify({"error": "Class not found"}), 404
        
        return jsonify({"class": updated_class})
    except Exception as error:
        print(f"[CLASSES] ADD STUDENT ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/remove-student", methods=["POST"])
def remove_student():
    """Remove student endpoint - migrated from app/api/classes/remove-student/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        class_id = data.get("classId")
        student_id = data.get("studentId")
        
        if not class_id or not student_id:
            return jsonify({"error": "Class ID and Student ID are required"}), 400
        
        updated_class = db_service.remove_student_from_class(class_id, student_id)
        if not updated_class:
            return jsonify({"error": "Class not found"}), 404
        
        return jsonify({"class": updated_class})
    except Exception as error:
        print(f"[CLASSES] REMOVE STUDENT ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/delete", methods=["DELETE"])
def delete_class():
    """Delete class endpoint - migrated from app/api/classes/delete/route.ts"""
    try:
        class_id = request.args.get("classId")
        if not class_id:
            return jsonify({"error": "Class ID is required"}), 400
        
        success = db_service.delete_class(class_id)
        if not success:
            return jsonify({"error": "Class not found"}), 404
        
        return jsonify({"success": True})
    except Exception as error:
        print(f"[CLASSES] DELETE ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/assignments", methods=["GET", "POST", "DELETE"])
def assignments():
    """Assignments endpoint - migrated from app/api/classes/assignments/route.ts"""
    try:
        from services import auth_service
        
        if request.method == "GET":
            class_id = request.args.get("classId")
            user_id = request.headers.get("X-User-Id") or request.args.get("userId")
            
            if not class_id:
                return jsonify({"error": "Class ID is required"}), 400
            if not user_id:
                return jsonify({"error": "User ID is required"}), 401
            
            # Get user
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            # Verify class exists
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404
            
            # Access control
            if user['role'] == "faculty":
                if cls['facultyId'] != user_id:
                    return jsonify({"error": "Unauthorized"}), 403
            elif user['role'] == "student":
                if user_id not in cls.get('studentIds', []):
                    return jsonify({"error": "Unauthorized"}), 403
            else:
                return jsonify({"error": "Invalid user role"}), 403
            
            assignments = db_service.get_assignments_by_class(class_id)
            
            return jsonify({
                "assignments": [{
                    "id": a['id'],
                    "name": a['name'],
                    "pdfUrl": f"/api/classes/assignments/download?classId={class_id}&assignmentId={a['id']}",
                    "dueDate": a['dueDate'].isoformat() if hasattr(a['dueDate'], 'isoformat') else str(a['dueDate']),
                    "canvasLink": a.get('canvasLink', ''),
                    "createdAt": a['createdAt'].isoformat() if hasattr(a['createdAt'], 'isoformat') else str(a['createdAt'])
                } for a in assignments]
            })
        
        elif request.method == "POST":
            # Handle file upload
            if not request.is_json and request.content_type and 'multipart/form-data' in request.content_type:
                class_id = request.form.get("classId")
                name = request.form.get("name")
                due_date = request.form.get("dueDate")
                canvas_link = request.form.get("canvasLink", "")
                user_id = request.headers.get("X-User-Id") or request.form.get("userId")
                
                if 'pdf' not in request.files:
                    return jsonify({"error": "PDF file is required"}), 400
                
                pdf_file = request.files['pdf']
            else:
                return jsonify({"error": "FormData with PDF file is required"}), 400
            
            if not class_id or not name or not due_date or not pdf_file:
                return jsonify({"error": "Class ID, name, due date, and PDF file are required"}), 400
            
            if not user_id:
                return jsonify({"error": "User ID is required"}), 401
            
            # Get user
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if user['role'] != "faculty":
                return jsonify({"error": "Only faculty can create assignments"}), 403
            
            # Verify class
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404
            
            if cls['facultyId'] != user_id:
                return jsonify({"error": "Unauthorized"}), 403
            
            # Save file
            import pathlib
            import uuid
            assignments_dir = pathlib.Path('assignments') / class_id
            assignments_dir.mkdir(parents=True, exist_ok=True)
            
            assignment_id = f"{int(__import__('time').time() * 1000)}-{uuid.uuid4().hex[:7]}"
            safe_file_name = pdf_file.filename.replace('/', '_').replace('\\', '_')
            pdf_file_name = f"{assignment_id}-{safe_file_name}"
            pdf_path = assignments_dir / pdf_file_name
            
            pdf_file.save(str(pdf_path))
            
            # Create assignment in database
            from datetime import datetime
            assignment = db_service.create_assignment({
                "classId": class_id,
                "facultyId": user_id,
                "name": name,
                "dueDate": datetime.fromisoformat(due_date.replace('Z', '+00:00')),
                "canvasLink": canvas_link or None,
                "pdfFileName": pdf_file_name
            })
            
            return jsonify({
                "success": True,
                "assignment": {
                    "id": assignment['id'],
                    "name": assignment['name'],
                    "pdfUrl": f"/api/classes/assignments/download?classId={class_id}&assignmentId={assignment['id']}",
                    "dueDate": assignment['dueDate'].isoformat() if hasattr(assignment['dueDate'], 'isoformat') else str(assignment['dueDate']),
                    "canvasLink": assignment.get('canvasLink', ''),
                    "createdAt": assignment['createdAt'].isoformat() if hasattr(assignment['createdAt'], 'isoformat') else str(assignment['createdAt'])
                }
            })
        
        elif request.method == "DELETE":
            class_id = request.args.get("classId")
            assignment_id = request.args.get("assignmentId")
            user_id = request.headers.get("X-User-Id") or request.args.get("userId")
            
            if not class_id or not assignment_id:
                return jsonify({"error": "Class ID and assignment ID are required"}), 400
            
            if not user_id:
                return jsonify({"error": "User ID is required"}), 401
            
            # Get assignment
            assignment = db_service.get_assignment_by_id(assignment_id)
            if not assignment:
                return jsonify({"error": "Assignment not found"}), 404
            
            if assignment['classId'] != class_id:
                return jsonify({"error": "Assignment not found for this class"}), 404
            
            # Get user
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if user['role'] != "faculty" or assignment['facultyId'] != user_id:
                return jsonify({"error": "Unauthorized"}), 403
            
            # Delete file
            import pathlib
            file_path = pathlib.Path('assignments') / class_id / assignment['pdfFileName']
            if file_path.exists():
                file_path.unlink()
            
            # Delete from database
            db_service.delete_assignment(assignment_id)
            
            return jsonify({"success": True})
    except Exception as error:
        print(f"[CLASSES] ASSIGNMENTS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/assignments/download", methods=["GET"])
def download_assignment():
    """Download assignment endpoint - migrated from app/api/classes/assignments/download/route.ts"""
    try:
        from flask import send_file
        class_id = request.args.get("classId")
        assignment_id = request.args.get("assignmentId")
        
        if not class_id or not assignment_id:
            return jsonify({"error": "Class ID and assignment ID are required"}), 400
        
        assignment = db_service.get_assignment_by_id(assignment_id)
        if not assignment or assignment['classId'] != class_id:
            return jsonify({"error": "Assignment not found"}), 404
        
        import pathlib
        file_path = pathlib.Path('assignments') / class_id / assignment['pdfFileName']
        
        if not file_path.exists():
            return jsonify({"error": "File not found"}), 404
        
        return send_file(str(file_path), as_attachment=True, download_name=assignment['pdfFileName'])
    except Exception as error:
        print(f"[CLASSES] DOWNLOAD ASSIGNMENT ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/resources", methods=["GET", "POST", "DELETE"])
def resources():
    """Resources endpoint - migrated from app/api/classes/resources/route.ts"""
    try:
        if request.method == "GET":
            class_id = request.args.get("classId")
            user_id = request.headers.get("X-User-Id") or request.args.get("userId")
            
            if not class_id:
                return jsonify({"error": "Class ID is required"}), 400
            if not user_id:
                return jsonify({"error": "User ID is required"}), 401
            
            # Get user
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            # Verify class
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404
            
            # Access control
            if user['role'] == "faculty":
                if cls['facultyId'] != user_id:
                    return jsonify({"error": "Unauthorized"}), 403
            elif user['role'] == "student":
                if user_id not in cls.get('studentIds', []):
                    return jsonify({"error": "Unauthorized"}), 403
            else:
                return jsonify({"error": "Invalid user role"}), 403
            
            resources_list = db_service.get_resources_by_class(class_id)
            
            return jsonify({
                "resources": [{
                    "name": r['fileName'],
                    "size": r['fileSize'],
                    "uploadedAt": r['uploadedAt'].isoformat() if hasattr(r['uploadedAt'], 'isoformat') else str(r['uploadedAt'])
                } for r in resources_list]
            })
        
        elif request.method == "POST":
            class_id = request.form.get("classId")
            user_id = request.headers.get("X-User-Id") or request.form.get("userId")
            
            if not class_id:
                return jsonify({"error": "Class ID is required"}), 400
            if not user_id:
                return jsonify({"error": "User ID is required"}), 401
            
            # Get user
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if user['role'] != "faculty":
                return jsonify({"error": "Only faculty can upload resources"}), 403
            
            # Verify class
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404
            
            if cls['facultyId'] != user_id:
                return jsonify({"error": "Unauthorized"}), 403
            
            # Handle file uploads
            if 'files' not in request.files:
                return jsonify({"error": "No files provided"}), 400
            
            files = request.files.getlist('files')
            uploaded_files = []
            
            import pathlib
            resources_dir = pathlib.Path('resources') / class_id
            resources_dir.mkdir(parents=True, exist_ok=True)
            
            for file in files:
                if file.filename and (file.content_type == "application/pdf" or file.filename.lower().endswith('.pdf')):
                    safe_name = file.filename.replace('/', '_').replace('\\', '_')
                    
                    # Check if already exists
                    existing = db_service.get_resource_by_file_name(class_id, safe_name)
                    if existing:
                        continue
                    
                    # Save file
                    file_path = resources_dir / safe_name
                    file.save(str(file_path))
                    
                    # Create resource in database
                    resource = db_service.create_resource({
                        "classId": class_id,
                        "facultyId": user_id,
                        "fileName": safe_name,
                        "fileSize": file_path.stat().st_size
                    })
                    
                    uploaded_files.append({
                        "name": resource['fileName'],
                        "size": resource['fileSize'],
                        "uploadedAt": resource['uploadedAt'].isoformat() if hasattr(resource['uploadedAt'], 'isoformat') else str(resource['uploadedAt'])
                    })
            
            if not uploaded_files:
                return jsonify({"error": "No valid PDF files to upload"}), 400
            
            return jsonify({"success": True, "files": uploaded_files})
        
        elif request.method == "DELETE":
            class_id = request.args.get("classId")
            file_name = request.args.get("fileName")
            user_id = request.headers.get("X-User-Id") or request.args.get("userId")
            
            if not class_id or not file_name:
                return jsonify({"error": "Class ID and file name are required"}), 400
            if not user_id:
                return jsonify({"error": "User ID is required"}), 401
            
            # Get user
            user = db_service.get_user_by_id_internal(user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if user['role'] != "faculty":
                return jsonify({"error": "Only faculty can delete resources"}), 403
            
            # Verify class
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404
            
            # Get resource
            import pathlib
            safe_file_name = pathlib.Path(file_name).name  # Prevent path traversal
            resource = db_service.get_resource_by_file_name(class_id, safe_file_name)
            if not resource:
                return jsonify({"error": "Resource not found"}), 404
            
            if cls['facultyId'] != user_id and resource['facultyId'] != user_id:
                return jsonify({"error": "Unauthorized"}), 403
            
            # Delete file
            file_path = pathlib.Path('resources') / class_id / safe_file_name
            if file_path.exists():
                file_path.unlink()
            
            # Delete from database
            db_service.delete_resource_by_id(resource['id'])
            
            return jsonify({"success": True})
    except Exception as error:
        print(f"[CLASSES] RESOURCES ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/resources/download", methods=["GET"])
def download_resource():
    """Download resource endpoint - migrated from app/api/classes/resources/download/route.ts"""
    try:
        from flask import send_file
        class_id = request.args.get("classId")
        file_name = request.args.get("fileName")
        
        if not class_id or not file_name:
            return jsonify({"error": "Class ID and file name are required"}), 400
        
        import pathlib
        safe_file_name = pathlib.Path(file_name).name  # Prevent path traversal
        file_path = pathlib.Path('resources') / class_id / safe_file_name
        
        if not file_path.exists():
            return jsonify({"error": "File not found"}), 404
        
        return send_file(str(file_path), as_attachment=True, download_name=safe_file_name)
    except Exception as error:
        print(f"[CLASSES] DOWNLOAD RESOURCE ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/send-reminder", methods=["POST"])
def send_reminder():
    """Send reminder endpoint - migrated from app/api/classes/send-reminder/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        emails = data.get("emails")
        class_name = data.get("className")
        faculty_name = data.get("facultyName")
        
        if not emails or not isinstance(emails, list) or len(emails) == 0:
            return jsonify({"error": "Email list is required"}), 400
        
        if not class_name:
            return jsonify({"error": "Class name is required"}), 400
        
        from services.email_service import send_verification_email
        from config import Config
        
        if not Config.GMAIL_USER or not Config.GMAIL_APP_PASSWORD:
            return jsonify({"error": "Email service not configured"}), 500
        
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        base_url = os.getenv("NEXT_PUBLIC_BASE_URL", request.headers.get("Origin", "http://localhost:3000"))
        registration_url = f"{base_url}/register"
        
        results = {"success": [], "failed": []}
        
        for email in emails:
            try:
                msg = MIMEMultipart('alternative')
                msg['Subject'] = f'Action Required: Register for {class_name} on LearnBOT'
                msg['From'] = f'"LearnBOT" <{Config.GMAIL_USER}>'
                msg['To'] = email
                
                html_content = f"""
<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
    .header {{ background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
    .content {{ background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }}
    .button {{ display: inline-block; background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }}
    .footer {{ background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }}
    .class-name {{ color: #4F46E5; font-weight: bold; }}
  </style>
</head>
<body>
  <div class="header">
    <h1>LearnBOT Registration Required</h1>
  </div>
  <div class="content">
    <p>Hello,</p>
    <p>{faculty_name if faculty_name else 'Your faculty'} attempted to add you to the class <span class="class-name">{class_name}</span> on LearnBOT, but your account was not found in our system.</p>
    <p><strong>To gain access to the class, you need to register on LearnBOT first.</strong></p>
    <p>Click the button below to register:</p>
    <div style="text-align: center;">
      <a href="{registration_url}" class="button">Register Now</a>
    </div>
    <p>Or copy and paste this link into your browser:</p>
    <p style="background-color: white; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; word-break: break-all;">
      {registration_url}
    </p>
    <p><strong>Important:</strong> Please use your Northeastern University email address ({email}) when registering.</p>
    <p>Once you complete your registration, your faculty will be able to add you to the class.</p>
    <p>Best regards,<br>The LearnBOT Team</p>
  </div>
  <div class="footer">
    <p>This is an automated message from LearnBOT. Please do not reply to this email.</p>
  </div>
</body>
</html>
                """
                
                text_content = f"""
Hello,

{faculty_name if faculty_name else 'Your faculty'} attempted to add you to the class "{class_name}" on LearnBOT, but your account was not found in our system.

To gain access to the class, you need to register on LearnBOT first.

Please visit the following link to register:
{registration_url}

Important: Please use your Northeastern University email address ({email}) when registering.

Once you complete your registration, your faculty will be able to add you to the class.

Best regards,
The LearnBOT Team
                """
                
                part1 = MIMEText(text_content, 'plain')
                part2 = MIMEText(html_content, 'html')
                msg.attach(part1)
                msg.attach(part2)
                
                with smtplib.SMTP('smtp.gmail.com', 587) as server:
                    server.starttls()
                    server.login(Config.GMAIL_USER, Config.GMAIL_APP_PASSWORD)
                    server.send_message(msg)
                
                results["success"].append(email)
                print(f"[Send Reminder] Email sent successfully to {email}")
            except Exception as e:
                print(f"[Send Reminder] Failed to send email to {email}: {e}")
                results["failed"].append(email)
        
        return jsonify({
            "message": "Reminder emails processed",
            "results": results
        })
    except Exception as error:
        print(f"[CLASSES] SEND REMINDER ERROR: {error}")
        return jsonify({"error": "Failed to send reminder emails"}), 500
