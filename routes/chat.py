"""
Chat and RAG endpoints
Migrated from app/api/chat/*/route.ts and app/api/rag/*/route.ts
"""
from flask import Blueprint, request, jsonify, Response, stream_with_context
from services import db_service, auth_service
from datetime import datetime
import sys
import os
import pathlib
import json
import queue
import threading

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
            stream_param = request.form.get("stream", "true")  # Default to "true" string
            stream = stream_param.lower() == "true" if stream_param else True  # Default to True
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
            stream = data.get("stream", True)  # Default to streaming for better UX
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
        
        # Handle streaming vs non-streaming responses
        if stream:
            print(f"[CHAT] STREAMING MODE ENABLED (session_id={session_id}, class_id={conv_class_id})", flush=True)
            
            def generate_stream():
                """Generator function that yields SSE-formatted chunks"""
                accumulated_response = ""
                chunk_queue = queue.Queue()
                streaming_done = threading.Event()
                result_container = {'result': None, 'error': None}
                
                def stream_callback(chunk_data):
                    """Callback function called by RAG service for each chunk"""
                    nonlocal accumulated_response
                    if chunk_data.get('type') == 'chunk':
                        chunk_text = chunk_data.get('chunk', '')
                        if chunk_text:
                            accumulated_response += chunk_text
                            # Put chunk in queue for generator to yield
                            chunk_queue.put(('chunk', chunk_text))
                
                # Update conversation with user message first
                updated_history = conversation.get('messageHistory', [])
                now_iso = datetime.now().isoformat()
                updated_history.append({
                    "role": "user",
                    "content": message,
                    "timestamp": now_iso,
                })
                
                def run_rag_service():
                    """Run RAG service in a separate thread"""
                    try:
                        print(f"[CHAT] Calling process_query with stream_callback", flush=True)
                        result = process_query(request_data, stream_callback=stream_callback)
                        result_container['result'] = result
                        print(f"[CHAT] process_query completed, result keys: {list(result.keys()) if result else 'None'}", flush=True)
                    except Exception as e:
                        print(f"[CHAT] Error in RAG service thread: {e}", flush=True)
                        import traceback
                        traceback.print_exc()
                        result_container['error'] = str(e)
                    finally:
                        streaming_done.set()
                        chunk_queue.put(('done', None))  # Signal generator to finish
                
                # Start RAG service in background thread
                rag_thread = threading.Thread(target=run_rag_service, daemon=True)
                rag_thread.start()
                
                # Yield chunks as they arrive
                try:
                    import time
                    while True:
                        try:
                            # Wait for chunk with timeout to check if streaming is done
                            item_type, item_data = chunk_queue.get(timeout=0.1)
                            
                            if item_type == 'chunk':
                                # Yield SSE-formatted chunk immediately
                                sse_data = json.dumps({"content": item_data}, ensure_ascii=False)
                                chunk_line = f"data: {sse_data}\n\n"
                                print(f"[CHAT] YIELDED CHUNK ({len(item_data)} chars): {item_data[:50]}...", flush=True)
                                yield chunk_line
                                # Force flush to ensure chunk is sent immediately
                                sys.stdout.flush()
                            elif item_type == 'done':
                                # Streaming complete, break to handle final result
                                break
                        except queue.Empty:
                            # Check if streaming is done
                            if streaming_done.is_set():
                                break
                            continue
                    
                    # Wait for RAG service thread to complete
                    rag_thread.join(timeout=30)
                    
                    if result_container['error']:
                        error_data = json.dumps({"error": "Streaming failed", "message": result_container['error']}, ensure_ascii=False)
                        yield f"data: {error_data}\n\n"
                        return
                    
                    # Get final result
                    result = result_container['result']
                    if not result:
                        result = {'response': accumulated_response, 'model_used': preferred_model}
                    
                    final_response = result.get('response', accumulated_response)
                    model_used = result.get('model_used', preferred_model)
                    
                    # Log final response
                    try:
                        response_preview = (final_response or '').strip()
                        if len(response_preview) > 500:
                            response_preview = response_preview[:500] + "... [truncated]"
                        print(f"[CHAT] AI RAW RESPONSE (session_id={session_id}, class_id={conv_class_id}): {response_preview}", flush=True)
                    except Exception as log_error:
                        print(f"[CHAT] Error logging AI response: {log_error}", flush=True)
                    
                    # Update conversation with assistant message
                    updated_history.append({
                        "role": "assistant",
                        "content": final_response,
                        "timestamp": datetime.now().isoformat(),
                    })
                    
                    db_service.update_rag_conversation(session_id, {
                        "messageHistory": updated_history,
                        "checkpointState": result.get('checkpoint_state', conversation.get('checkpointState', {}))
                    })
                    
                    # Send final done event
                    done_data = json.dumps({
                        "done": True,
                        "content": final_response,
                        "modelUsed": model_used,
                        "mode": result.get('mode', 'rag'),
                        "contentFound": result.get('content_found', False),
                        "timeTaken": result.get('time_taken', 0)
                    }, ensure_ascii=False)
                    yield f"data: {done_data}\n\n"
                    print(f"[CHAT] STREAMING COMPLETE", flush=True)
                    
                except Exception as stream_error:
                    print(f"[CHAT] STREAMING ERROR: {stream_error}", flush=True)
                    import traceback
                    traceback.print_exc()
                    error_data = json.dumps({"error": "Streaming failed", "message": str(stream_error)}, ensure_ascii=False)
                    yield f"data: {error_data}\n\n"
            
            # Return streaming response
            response = Response(
                stream_with_context(generate_stream()),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'X-Accel-Buffering': 'no',
                    'Connection': 'keep-alive'
                }
            )
            # Ensure response is not buffered
            response.direct_passthrough = True
            return response
        else:
            # Non-streaming response (existing logic)
            print(f"[CHAT] NON-STREAMING MODE (session_id={session_id}, class_id={conv_class_id})", flush=True)
            
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
            # Persist accurate timestamps for both user and assistant messages
            now_iso = datetime.now().isoformat()
            updated_history.append({
                "role": "user",
                "content": message,
                "timestamp": now_iso,
            })
            if result.get('response'):
                updated_history.append({
                    "role": "assistant",
                    "content": result['response'],
                    "timestamp": datetime.now().isoformat(),
                })
            
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
