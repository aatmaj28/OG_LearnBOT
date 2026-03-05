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
import base64
import queue
import threading
import time

# RabbitMQ + Redis for async worker architecture
try:
    from services import rabbitmq_service, redis_service
    _QUEUE_AVAILABLE = True
except ImportError:
    _QUEUE_AVAILABLE = False
    print("[CHAT] WARNING: rabbitmq_service/redis_service not available. Queue mode disabled.", flush=True)

bp = Blueprint("chat", __name__)

# Create separate blueprint for RAG routes (for /api/rag compatibility)
rag_bp = Blueprint("rag", __name__)


def _derive_persistent_attachments_from_history(conversation):
    """If cachedContext has no persistent_attachments or persistent_images, derive from messageHistory so 'Documents/Images in this chat' persists."""
    if not conversation:
        return conversation
    cached = conversation.get("cachedContext") or {}
    if not isinstance(cached, dict):
        cached = {}
    pa = (cached.get("persistent_attachments") or [])[:3]
    pi = (cached.get("persistent_images") or [])[:3]
    history = conversation.get("messageHistory") or []
    need_derived_pa = len(pa) == 0
    need_derived_pi = len(pi) == 0
    if need_derived_pa or need_derived_pi:
        seen_doc = set()
        seen_img = set()
        derived_pa = list(pa)
        derived_pi = list(pi)
        for msg in history:
            if isinstance(msg, dict) and msg.get("role") == "user":
                for att in (msg.get("attachments") or []):
                    if not isinstance(att, dict):
                        continue
                    name = att.get("name") or "Document"
                    is_image = (att.get("type") or "").lower().startswith("image")
                    if is_image:
                        if name not in seen_img and len(derived_pi) < 3:
                            seen_img.add(name)
                            derived_pi.append({"name": name})
                    else:
                        if name not in seen_doc and len(derived_pa) < 3:
                            seen_doc.add(name)
                            derived_pa.append({"name": name, "summary": ""})
        if need_derived_pa and not derived_pa and history:
            for msg in history:
                if isinstance(msg, dict) and msg.get("role") == "assistant":
                    content = (msg.get("content") or "").lower()
                    if "uploaded a pdf" in content or "attached" in content or "uploaded a document" in content:
                        derived_pa = [{"name": "Document", "summary": ""}]
                    break
        if derived_pa or derived_pi:
            out = dict(conversation)
            new_cached = {**cached, "persistent_attachments": derived_pa[:3], "persistent_images": derived_pi[:3]}
            out["cachedContext"] = new_cached
            return out
    return conversation

# Cache the loaded RAG module so we only import once (used by ai_response and by startup preload)
_rag_module = None

def load_rag_module():
    """Load the RAG service module (llamaindex-rag-service.py). Called at startup to trigger preload thread, and by ai_response to get process_query."""
    global _rag_module
    if _rag_module is not None:
        return _rag_module
    import importlib.util
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    rag_service_path = os.path.join(backend_root, 'lib', 'llamaindex-rag-service.py')
    if not os.path.isfile(rag_service_path):
        return None
    spec = importlib.util.spec_from_file_location("llamaindex_rag_service", rag_service_path)
    _rag_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_rag_module)
    return _rag_module

def trigger_rag_preload_at_startup():
    """Call once at Flask app startup to load the RAG module and start embedding/vector-store preload in the background."""
    try:
        load_rag_module()
    except Exception as e:
        print(f"[CHAT] RAG preload at startup failed (non-fatal): {e}", flush=True)

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
            # Derive cachedContext.persistent_attachments from message history when null (so "Documents in this chat" persists)
            conversations_list = [_derive_persistent_attachments_from_history(c) for c in conversations_list]
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
            conversation = _derive_persistent_attachments_from_history(conversation)
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
        # RAG service lives in backend lib/ as llamaindex-rag-service.py (loaded once, cached)
        rag_module = load_rag_module()
        if rag_module is None:
            return jsonify({"error": "RAG service not found (lib/llamaindex-rag-service.py). Deploy may be incomplete."}), 500
        process_query = rag_module.process_query
        
        # Handle both JSON and FormData (never call get_json() on multipart/binary body)
        content_type = (request.content_type or "").strip().lower()
        if "multipart/form-data" in content_type:
            message = request.form.get("message")
            user_id = request.form.get("userId")
            session_id = request.form.get("sessionId")
            class_id = request.form.get("classId")
            chat_type = request.form.get("chatType", "class_material")
            preferred_model = request.form.get("preferredModel", "remote-a6000")
            stream_param = request.form.get("stream", "true")  # Default to "true" string
            stream = stream_param.lower() == "true" if stream_param else True  # Default to True
            deep_thinking = request.form.get("deepThinking") == "true"
        elif "application/json" in content_type:
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
        else:
            return jsonify({
                "error": "Request must be application/json or multipart/form-data (for file attachments)."
            }), 400
        
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

        # TA mode (lenient/normal/strict) is configured per faculty and applies to all classes they teach.
        ta_mode = "normal"
        try:
            faculty_id = cls.get("facultyId")
            if faculty_id:
                found = db_service.get_user_ta_mode(str(faculty_id))
                if isinstance(found, str):
                    found_norm = found.strip().lower()
                    if found_norm in ("lenient", "normal", "strict"):
                        ta_mode = found_norm
        except Exception as e:
            print(f"[CHAT] Failed to resolve TA mode (defaulting to normal): {e}", flush=True)
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
            "ta_mode": ta_mode,
            "attachments": []
        }
        
        # Populate attachments from FormData (base64) and detect images for non-Claude early-return
        has_image_attachment = False
        if request.content_type and 'multipart/form-data' in request.content_type:
            files = request.files.getlist('attachments') or []
            attachments_list = []
            for f in files:
                ct = (getattr(f, 'content_type') or '').strip() or 'application/octet-stream'
                name = (getattr(f, 'filename') or '').strip() or 'attachment'
                raw = f.read()
                data_b64 = base64.b64encode(raw).decode('utf-8')
                attachments_list.append({"type": ct, "data": data_b64, "name": name})
                if ct.lower().startswith('image/'):
                    has_image_attachment = True
            request_data["attachments"] = attachments_list
        # When the user attaches images and the model is not Claude, we do NOT early-return here.
        # The RAG service will run on the text query, then prepend an image notice (with file names)
        # and return the RAG response so the user still gets an answer from the corpus.

        # ── RabbitMQ Queue Mode ──────────────────────────────────────────
        # If RabbitMQ is available, publish to queue and return taskId instantly.
        # Workers will process the request and stream results via Redis pub/sub.
        # This frees Gunicorn workers to handle other requests (login, etc.).
        use_queue = (
            _QUEUE_AVAILABLE
            and rabbitmq_service.is_rabbitmq_available()
            and redis_service.is_redis_available()
        )
        
        if use_queue:
            try:
                task_id = rabbitmq_service.generate_task_id()
                
                # Create task in Redis (status: queued)
                redis_service.create_task(task_id, request_data)
                
                # Publish to RabbitMQ queue
                published = rabbitmq_service.publish_chat_task(task_id, request_data)
                if not published:
                    raise RuntimeError("Failed to publish to RabbitMQ")
                
                print(f"[CHAT] Task {task_id} queued (session={session_id})", flush=True)
                
                # Return taskId immediately — frontend will open SSE to /stream/<taskId>
                return jsonify({
                    "taskId": task_id,
                    "status": "queued",
                    "message": "Task queued for processing",
                })
                
            except Exception as queue_err:
                print(f"[CHAT] Queue mode failed, falling back to sync: {queue_err}", flush=True)
                # Fall through to synchronous processing below
        
        # ── Synchronous Fallback ───────────────────────────────────────
        # Handle streaming vs non-streaming responses (original behavior)
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
                
                # Update conversation with user message first (include attachments for persistence)
                updated_history = conversation.get('messageHistory', [])
                now_iso = datetime.now().isoformat()
                attachments_for_message = [
                    {"name": a.get("name", "attachment"), "type": "image" if (a.get("type") or "").startswith("image/") else "file"}
                    for a in request_data.get("attachments", [])
                ]
                user_msg = {
                    "role": "user",
                    "content": message,
                    "timestamp": now_iso,
                }
                if attachments_for_message:
                    user_msg["attachments"] = attachments_for_message
                updated_history.append(user_msg)
                
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
                                # Yield SSE-formatted chunk as bytes (Gunicorn sync worker expects bytes)
                                sse_data = json.dumps({"content": item_data}, ensure_ascii=False)
                                chunk_line = f"data: {sse_data}\n\n"
                                print(f"[CHAT] YIELDED CHUNK ({len(item_data)} chars): {item_data[:50]}...", flush=True)
                                yield chunk_line.encode('utf-8')
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
                        yield f"data: {error_data}\n\n".encode('utf-8')
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
                    
                    # Send final done event (bytes for Gunicorn)
                    done_data = json.dumps({
                        "done": True,
                        "content": final_response,
                        "modelUsed": model_used,
                        "mode": result.get('mode', 'rag'),
                        "contentFound": result.get('content_found', False),
                        "timeTaken": result.get('time_taken', 0)
                    }, ensure_ascii=False)
                    yield f"data: {done_data}\n\n".encode('utf-8')
                    print(f"[CHAT] STREAMING COMPLETE", flush=True)
                    
                except Exception as stream_error:
                    print(f"[CHAT] STREAMING ERROR: {stream_error}", flush=True)
                    import traceback
                    traceback.print_exc()
                    error_data = json.dumps({"error": "Streaming failed", "message": str(stream_error)}, ensure_ascii=False)
                    yield f"data: {error_data}\n\n".encode('utf-8')
            
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

            # Update conversation with new message (include attachments for persistence)
            updated_history = conversation.get('messageHistory', [])
            # Persist accurate timestamps for both user and assistant messages
            now_iso = datetime.now().isoformat()
            attachments_for_message = [
                {"name": a.get("name", "attachment"), "type": "image" if (a.get("type") or "").startswith("image/") else "file"}
                for a in request_data.get("attachments", [])
            ]
            user_msg = {"role": "user", "content": message, "timestamp": now_iso}
            if attachments_for_message:
                user_msg["attachments"] = attachments_for_message
            updated_history.append(user_msg)
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


# ---------------------------------------------------------------------------
# Internal Endpoint for Worker Delegation (EssayBot pattern)
# ---------------------------------------------------------------------------

@bp.route("/internal/process_query", methods=["POST"])
def internal_process_query():
    """
    Internal endpoint for workers to delegate RAG processing to Flask.
    
    Workers POST {"task_id": "...", "request_data": {...}} and this handler:
    1. Calls rag.process_query() with stream_callback → Redis pub/sub
    2. Saves conversation to DB
    3. Publishes 'done' event to Redis
    4. Returns result to worker
    
    Security: Only accepts requests from localhost (workers run on same machine).
    """
    # Security check: only allow localhost
    remote_addr = request.remote_addr or ""
    if remote_addr not in ("127.0.0.1", "::1", "localhost"):
        return jsonify({"error": "Forbidden: internal endpoint"}), 403
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body required"}), 400
        
        task_id = data.get("task_id")
        request_data = data.get("request_data", {})
        
        if not task_id or not request_data:
            return jsonify({"error": "task_id and request_data required"}), 400
        
        session_id = request_data.get("conversation_id", "unknown")
        start_time = time.time()
        
        print(f"[INTERNAL] Processing task {task_id} (session={session_id})", flush=True)
        
        # Load RAG module
        rag_module = load_rag_module()
        if rag_module is None:
            redis_service.publish_chunk(task_id, {
                "error": "Processing failed",
                "message": "RAG service not available",
            })
            redis_service.fail_task(task_id, "RAG service not available")
            return jsonify({"error": "RAG service not available"}), 500
        
        process_query = rag_module.process_query
        
        # Update Redis status
        redis_service.set_task_status(task_id, "processing")
        
        # Accumulated response for final save
        accumulated_response = ""
        
        def stream_callback(chunk_data: dict) -> None:
            """Called by RAG service for each generated token/chunk."""
            nonlocal accumulated_response
            if chunk_data.get("type") == "chunk":
                chunk_text = chunk_data.get("chunk", "")
                if chunk_text:
                    accumulated_response += chunk_text
                    # Publish chunk to Redis pub/sub for SSE endpoint
                    redis_service.publish_chunk(task_id, {
                        "content": chunk_text,
                    })
        
        # Call process_query with streaming
        result = process_query(request_data, stream_callback=stream_callback)
        
        elapsed = time.time() - start_time
        final_response = result.get("response", accumulated_response)
        model_used = result.get("model_used", request_data.get("preferred_model", "unknown"))
        
        # Save to database
        try:
            conversation = db_service.get_rag_conversation_by_id(session_id)
            if conversation:
                updated_history = conversation.get("messageHistory", [])
                now_iso = datetime.now().isoformat()
                
                # Add user message (include attachments for persistence)
                attachments_for_message = [
                    {"name": a.get("name", "attachment"), "type": "image" if (a.get("type") or "").startswith("image/") else "file"}
                    for a in request_data.get("attachments", [])
                ]
                user_msg = {
                    "role": "user",
                    "content": request_data.get("query", ""),
                    "timestamp": now_iso,
                }
                if attachments_for_message:
                    user_msg["attachments"] = attachments_for_message
                updated_history.append(user_msg)

                # Add assistant message
                if final_response:
                    updated_history.append({
                        "role": "assistant",
                        "content": final_response,
                        "timestamp": datetime.now().isoformat(),
                    })
                
                db_service.update_rag_conversation(session_id, {
                    "messageHistory": updated_history,
                    "checkpointState": result.get("checkpoint_state",
                                                   conversation.get("checkpointState", {})),
                })
                print(f"[INTERNAL] DB updated for session {session_id}", flush=True)
        except Exception as db_err:
            print(f"[INTERNAL] DB save error for task {task_id}: {db_err}", flush=True)
            import traceback
            traceback.print_exc()
        
        # Publish 'done' event to Redis pub/sub
        redis_service.publish_chunk(task_id, {
            "done": True,
            "content": final_response,
            "modelUsed": model_used,
            "mode": result.get("mode", "rag"),
            "contentFound": result.get("content_found", False),
            "timeTaken": elapsed,
        })
        
        # Update Redis task status
        redis_service.complete_task(task_id, {
            "response": final_response[:500],  # Truncate for status storage
            "modelUsed": model_used,
            "timeTaken": elapsed,
        })
        
        print(f"[INTERNAL] Task {task_id} completed in {elapsed:.1f}s", flush=True)
        
        return jsonify({
            "success": True,
            "task_id": task_id,
            "elapsed": elapsed,
        })
        
    except Exception as e:
        _elapsed = time.time() - start_time if 'start_time' in locals() else 0
        _tid = task_id if 'task_id' in locals() else 'unknown'
        print(f"[INTERNAL] Task {_tid} FAILED: {e}", flush=True)
        import traceback
        traceback.print_exc()
        
        # Publish error to Redis pub/sub
        if 'task_id' in locals() and task_id:
            redis_service.publish_chunk(task_id, {
                "error": "Processing failed",
                "message": str(e),
            })
            redis_service.fail_task(task_id, str(e))
        
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# RabbitMQ Worker Streaming Endpoints
# ---------------------------------------------------------------------------

@bp.route("/stream/<task_id>", methods=["GET"])
def stream_task(task_id):
    """
    SSE endpoint for streaming worker results to the frontend.
    
    Frontend opens this after POSTing to /ai-response and receiving a taskId.
    Subscribes to Redis pub/sub channel learnbot:stream:<task_id> and yields
    each chunk as an SSE event.
    """
    if not _QUEUE_AVAILABLE:
        return jsonify({"error": "Queue mode not available"}), 503
    
    def generate():
        """Generator that yields SSE events from Redis pub/sub."""
        ps = None
        try:
            ps = redis_service.subscribe_to_stream(task_id)
            
            # Check if task already completed/failed before we subscribed
            status = redis_service.get_task_status(task_id)
            if status and status.get("status") in ("completed", "failed"):
                # Task already done — send the result directly
                if status.get("status") == "completed":
                    result = status.get("result", {})
                    done_data = json.dumps({
                        "done": True,
                        "content": result.get("response", ""),
                        "modelUsed": result.get("modelUsed", ""),
                        "timeTaken": result.get("timeTaken", 0),
                    }, ensure_ascii=False)
                    yield f"data: {done_data}\n\n".encode("utf-8")
                else:
                    error_data = json.dumps({
                        "error": "Processing failed",
                        "message": status.get("error", "Unknown error"),
                    }, ensure_ascii=False)
                    yield f"data: {error_data}\n\n".encode("utf-8")
                return
            
            # Listen for messages with timeout
            timeout = 150  # 2.5 min total timeout (task timeout + buffer)
            start = time.time()
            
            for message in ps.listen():
                # Check timeout
                if time.time() - start > timeout:
                    error_data = json.dumps({
                        "error": "Stream timeout",
                        "message": "Task took too long to complete",
                    }, ensure_ascii=False)
                    yield f"data: {error_data}\n\n".encode("utf-8")
                    return
                
                if message["type"] != "message":
                    continue
                
                try:
                    data = json.loads(message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue
                
                # Forward as SSE event (same format as current streaming)
                sse_data = json.dumps(data, ensure_ascii=False)
                yield f"data: {sse_data}\n\n".encode("utf-8")
                
                # If this is the done event, stop streaming
                if data.get("done") or data.get("error"):
                    return
                    
        except Exception as e:
            print(f"[CHAT] SSE stream error for task {task_id}: {e}", flush=True)
            error_data = json.dumps({
                "error": "Stream error",
                "message": str(e),
            }, ensure_ascii=False)
            yield f"data: {error_data}\n\n".encode("utf-8")
        finally:
            if ps:
                try:
                    ps.unsubscribe()
                    ps.close()
                except Exception:
                    pass
    
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@bp.route("/task-status/<task_id>", methods=["GET"])
def task_status(task_id):
    """Get the status of a queued/processing/completed task."""
    if not _QUEUE_AVAILABLE:
        return jsonify({"error": "Queue mode not available"}), 503
    
    status = redis_service.get_task_status(task_id)
    if status is None:
        return jsonify({"error": "Task not found"}), 404
    
    return jsonify({"taskId": task_id, **status})

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
