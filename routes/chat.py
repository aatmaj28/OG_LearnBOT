"""
Chat and RAG endpoints
Migrated from app/api/chat/*/route.ts and app/api/rag/*/route.ts
"""
from flask import Blueprint, request, jsonify
from services import db_service, auth_service
import sys
import os
import pathlib

bp = Blueprint("chat", __name__)

# Create separate blueprint for RAG routes (for /api/rag compatibility)
rag_bp = Blueprint("rag", __name__)

def get_requesting_user():
    """Gets requesting user from session"""
    session_id = request.headers.get("X-Session-Id")
    if not session_id:
        return None
    
    session = auth_service.get_session(session_id)
    if not session:
        return None
    
    return session['user']

@bp.route("/conversations", methods=["GET", "POST", "PUT", "DELETE"])
def conversations():
    """Conversations endpoint - migrated from app/api/chat/conversations/route.ts"""
    try:
        if request.method == "GET":
            user_id = request.args.get('userId')
            class_id = request.args.get('classId')
            chat_type = request.args.get('chatType')
            
            if not user_id:
                return jsonify({"error": "User ID is required"}), 400
            
            conversations_list = db_service.get_rag_conversations_by_user(
                user_id, 
                class_id if class_id else None,
                chat_type if chat_type else None
            )
            
            return jsonify({"conversations": conversations_list})
        
        elif request.method == "POST":
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            user_id = data.get("userId")
            title = data.get("title")
            class_id = data.get("classId")
            chat_type = data.get("chatType", "class_material")
            
            if not user_id:
                return jsonify({"error": "User ID is required"}), 400
            
            conversation = db_service.create_rag_conversation(user_id, title, class_id, chat_type)
            return jsonify({"conversation": conversation})
        
        elif request.method == "PUT":
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            conversation_id = data.get("conversationId")
            updates = data.get("updates", {})
            
            if not conversation_id:
                return jsonify({"error": "Conversation ID is required"}), 400
            
            conversation = db_service.update_rag_conversation(conversation_id, updates)
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            
            return jsonify({"conversation": conversation})
        
        elif request.method == "DELETE":
            conversation_id = request.args.get('conversationId')
            if not conversation_id:
                return jsonify({"error": "Conversation ID is required"}), 400
            
            db_service.archive_rag_conversation(conversation_id)
            return jsonify({"success": True})
    except Exception as error:
        print(f"[CHAT] CONVERSATIONS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/conversations/<conversation_id>", methods=["GET", "PUT", "DELETE"])
def conversation_detail(conversation_id):
    """Conversation detail endpoint - migrated from app/api/chat/conversations/[id]/route.ts"""
    try:
        if request.method == "GET":
            conversation = db_service.get_rag_conversation_by_id(conversation_id)
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            return jsonify({"conversation": conversation})
        
        elif request.method == "PUT":
            data = request.get_json()
            updates = data.get("updates", {}) if data else {}
            
            conversation = db_service.update_rag_conversation(conversation_id, updates)
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            return jsonify({"conversation": conversation})
        
        elif request.method == "DELETE":
            db_service.archive_rag_conversation(conversation_id)
            return jsonify({"success": True})
    except Exception as error:
        print(f"[CHAT] CONVERSATION DETAIL ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/ai-response", methods=["POST"])
def ai_response():
    """AI response endpoint - migrated from app/api/chat/ai-response/route.ts"""
    try:
        # RAG service lives in backend lib/ as llamaindex-rag-service.py (hyphen; use importlib)
        backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        rag_service_path = os.path.join(backend_root, 'lib', 'llamaindex-rag-service.py')
        if not os.path.isfile(rag_service_path):
            return jsonify({"error": "RAG service not found (lib/llamaindex-rag-service.py). Deploy may be incomplete."}), 500
        import importlib.util
        spec = importlib.util.spec_from_file_location("llamaindex_rag_service", rag_service_path)
        rag_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rag_module)
        process_query = rag_module.process_query
        
        # Handle both JSON and FormData
        if request.content_type and 'multipart/form-data' in request.content_type:
            message = request.form.get("message")
            user_id = request.form.get("userId")
            session_id = request.form.get("sessionId")
            class_id = request.form.get("classId")
            chat_type = request.form.get("chatType", "class_material")
            preferred_model = request.form.get("preferredModel", "remote-a6000")
            stream = request.form.get("stream") == "true"
            deep_thinking = request.form.get("deepThinking") == "true"
        else:
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            message = data.get("message")
            user_id = data.get("userId")
            session_id = data.get("sessionId")
            class_id = data.get("classId")
            chat_type = data.get("chatType", "class_material")
            preferred_model = data.get("preferredModel", "remote-a6000")
            stream = data.get("stream", False)
            deep_thinking = data.get("deepThinking", False)
        
        if not message:
            return jsonify({"error": "Message is required"}), 400
        
        if not user_id or not session_id:
            return jsonify({"error": "User ID and Session ID are required"}), 400
        
        # Get conversation
        conversation = db_service.get_rag_conversation_by_id(session_id)
        if not conversation:
            return jsonify({"error": "Conversation not found"}), 404
        
        # Resolve vector store path from conversation's class (required for RAG)
        conv_class_id = conversation.get("classId") or class_id
        if not conv_class_id:
            return jsonify({"error": "Class is required for RAG chat. Create or open a class conversation."}), 400
        cls = db_service.get_class_by_id(conv_class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        is_syllabus = (chat_type or conversation.get("chatType") or "class_material") == "syllabus"
        folder = cls.get("syllabusVectorStoreFolder" if is_syllabus else "vectorStoreFolder")
        if not folder:
            folder = db_service.generate_vector_store_folder_name(cls["name"]) + ("_syllabus" if is_syllabus else "")
        vector_store_path = str(pathlib.Path("vector_stores") / folder)
        
        # Prepare request for RAG service
        request_data = {
            "query": message,
            "conversation_id": session_id,
            "user_id": user_id,
            "vector_store_path": vector_store_path,
            "system_prompt": "",  # Will be generated by RAG service
            "preferred_model": preferred_model,
            "request_id": f"req_{__import__('time').time()}",
            "message_history": conversation.get('messageHistory', []),
            "chat_type": chat_type,
            "checkpoint_state": conversation.get('checkpointState', {}),
            "deep_thinking": deep_thinking,
            "attachments": []
        }
        
        # Call RAG service
        result = process_query(request_data)

        # Log AI response to server logs BEFORE attempting DB write, so we can see it even if DB fails
        try:
            response_preview = (result.get('response') or '').strip()
            # Truncate long responses to avoid huge logs
            if len(response_preview) > 500:
                response_preview = response_preview[:500] + "... [truncated]"
            print(f"[CHAT] AI RAW RESPONSE (session_id={session_id}, class_id={conv_class_id}): {response_preview}", flush=True)
        except Exception as log_error:
            print(f"[CHAT] Error logging AI response: {log_error}", flush=True)

        # Update conversation with new message
        updated_history = conversation.get('messageHistory', [])
        updated_history.append({"role": "user", "content": message})
        if result.get('response'):
            updated_history.append({"role": "assistant", "content": result['response']})
        
        db_service.update_rag_conversation(session_id, {
            "messageHistory": updated_history,
            "checkpointState": result.get('checkpoint_state', conversation.get('checkpointState', {}))
        })
        
        return jsonify({
            "response": result.get('response', ''),
            "mode": result.get('mode', 'rag'),
            "contentFound": result.get('content_found', False),
            "modelUsed": result.get('model_used', preferred_model),
            "timeTaken": result.get('time_taken', 0)
        })
    except Exception as error:
        print(f"[CHAT] AI RESPONSE ERROR: {error}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/messages", methods=["GET", "POST"])
def messages():
    """Messages endpoint - migrated from app/api/chat/messages/route.ts"""
    try:
        if request.method == "GET":
            session_id = request.args.get("sessionId")
            if not session_id:
                return jsonify({"error": "Session ID is required"}), 400
            
            conversation = db_service.get_rag_conversation_by_id(session_id)
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            
            return jsonify({"messages": conversation.get('messageHistory', [])})
        
        elif request.method == "POST":
            # Messages are handled through ai-response endpoint
            return jsonify({"error": "Use /ai-response endpoint to send messages"}), 400
    except Exception as error:
        print(f"[CHAT] MESSAGES ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/send", methods=["POST"])
def send():
    """Send message endpoint - migrated from app/api/chat/send/route.ts"""
    # This is a legacy endpoint, redirect to ai-response
    return ai_response()

@bp.route("/sessions", methods=["GET", "POST"])
def sessions():
    """Sessions endpoint - migrated from app/api/chat/sessions/route.ts"""
    try:
        if request.method == "GET":
            user_id = request.args.get("userId")
            if not user_id:
                return jsonify({"error": "User ID is required"}), 400
            
            conversations = db_service.get_rag_conversations_by_user(user_id)
            return jsonify({"sessions": conversations})
        
        elif request.method == "POST":
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            user_id = data.get("userId")
            title = data.get("title")
            class_id = data.get("classId")
            
            if not user_id:
                return jsonify({"error": "User ID is required"}), 400
            
            conversation = db_service.create_rag_conversation(user_id, title, class_id)
            return jsonify({"session": conversation})
    except Exception as error:
        print(f"[CHAT] SESSIONS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

def rag_preload():
    """RAG preload endpoint - migrated from app/api/rag/preload/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        user_id = data.get("userId")
        user_role = data.get("userRole")
        
        if not user_id or not user_role:
            return jsonify({"error": "userId and userRole are required"}), 400
        
        if user_role not in ("student", "faculty"):
            return jsonify({"error": "userRole must be 'student' or 'faculty'"}), 400
        
        # RAG preload logic - for now return success
        # The actual preload will be handled by the RAG service when needed
        return jsonify({
            "success": True,
            "loaded": 0,
            "failed": 0,
            "total": 0,
            "message": "RAG service will load classes on demand"
        })
    except Exception as error:
        print(f"[CHAT] RAG PRELOAD ERROR: {error}")
        return jsonify({
            "error": "Internal server error",
            "success": False,
            "loaded": 0,
            "failed": 0,
            "total": 0
        }), 500

def rag_status():
    """RAG status endpoint - migrated from app/api/rag/status/route.ts"""
    try:
        # Check RAG service availability
        # For now, assume available - in production check actual service
        return jsonify({
            "isAvailable": True,
            "message": "RAG service is ready"
        })
    except Exception as error:
        print(f"[CHAT] RAG STATUS ERROR: {error}")
        return jsonify({
            "isAvailable": False,
            "message": "Error checking RAG service status"
        }), 500

# Register RAG functions to both blueprints (at end of file, after function definitions)
# This allows both /api/chat/rag/* and /api/rag/* to work
bp.route("/rag/preload", methods=["POST"])(rag_preload)
bp.route("/rag/status", methods=["GET"])(rag_status)
rag_bp.route("/preload", methods=["POST"])(rag_preload)
rag_bp.route("/status", methods=["GET"])(rag_status)
