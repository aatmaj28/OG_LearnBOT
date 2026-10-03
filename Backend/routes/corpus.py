"""
Corpus management endpoints
Migrated from app/api/corpus/*/route.ts
"""
from flask import Blueprint, request, jsonify
from services import db_service
import os
import pathlib
import json
import threading
from typing import Optional

bp = Blueprint("corpus", __name__)

# Supported file extensions for corpus indexing
SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.doc', '.txt'}

# Limit concurrent indexing to 3 to keep at least 2 Gunicorn workers free for chat
_indexing_semaphore = threading.Semaphore(3)

def get_vector_store_path_by_folder(folder_name: str) -> str:
    """Gets vector store path by folder name"""
    return str(pathlib.Path('vector_stores') / folder_name)

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent

def _store_dir(folder_name: str) -> pathlib.Path:
    """Absolute path of a class's vector store folder (source_pdfs/, metadata.json, config.json)."""
    return (BACKEND_ROOT / get_vector_store_path_by_folder(folder_name)).resolve()

def _evict_cached_vector_store(store_dir: pathlib.Path) -> None:
    """Drops the RAG service's in-memory index for this store so chat reloads it from Qdrant."""
    # The RAG module is loaded via importlib in routes/chat.py and isn't in sys.modules
    from routes import chat
    rag = chat._rag_module
    if rag is None:  # not loaded yet, so nothing is cached
        return
    norm_path = rag.normalize_vector_store_path(str(store_dir))
    if rag.vector_stores.pop(norm_path, None) is not None:
        print(f"[CORPUS] cleared cached vector store '{norm_path}'", flush=True)

def _count_indexed_chunks(store_dir: pathlib.Path) -> Optional[int]:
    """Number of chunks in the store's Qdrant collection, or None if Qdrant can't be reached."""
    try:
        from lib import indexing_service
        collection_name = indexing_service.get_collection_name(str(store_dir))
        qdrant_client = indexing_service.get_or_init_qdrant_client()
        if not qdrant_client.collection_exists(collection_name):
            return 0
        return qdrant_client.count(collection_name, exact=True).count
    except Exception as e:
        print(f"[CORPUS] could not count Qdrant chunks for {store_dir}: {e}", flush=True)
        return None

def _remove_indexed_chunks(store_dir: pathlib.Path, source_file: Optional[str] = None) -> None:
    """Removes indexed chunks from Qdrant and metadata.json: one file's, or all when source_file
    is None. Uploaded files are left alone."""
    from lib import indexing_service
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    collection_name = indexing_service.get_collection_name(str(store_dir))
    qdrant_client = indexing_service.get_or_init_qdrant_client()
    if qdrant_client.collection_exists(collection_name):
        if source_file is None:
            qdrant_client.delete_collection(collection_name)
        else:
            qdrant_client.delete(
                collection_name=collection_name,
                points_selector=Filter(must=[FieldCondition(key="source_file", match=MatchValue(value=source_file))]),
                wait=True,
            )

    # Indexing skips files listed in metadata.json, so it has to match what's left in Qdrant
    metadata_path = store_dir / "metadata.json"
    if metadata_path.exists():
        entries = [] if source_file is None else [
            entry for entry in json.loads(metadata_path.read_text(encoding="utf-8"))
            if entry.get("source_file") != source_file
        ]
        metadata_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")

    _evict_cached_vector_store(store_dir)

@bp.route("/upload", methods=["POST"])
def upload():
    """Upload corpus endpoint - migrated from app/api/corpus/upload/route.ts"""
    try:
        class_id = request.args.get("classId")
        material_type = request.args.get("materialType", "class_material")
        is_syllabus = material_type == "syllabus"
        
        if not class_id:
            return jsonify({"error": "Class ID is required"}), 400
        
        cls = db_service.get_class_by_id(class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        
        # Get or create vector store folder
        current_folder = cls.get('syllabusVectorStoreFolder' if is_syllabus else 'vectorStoreFolder')
        folder_suffix = "_syllabus" if is_syllabus else ""
        
        if not current_folder:
            base = cls.get('vectorStoreFolder') or db_service.generate_vector_store_folder_name(cls['name'])
            current_folder = (base + folder_suffix) if is_syllabus else base
            db_service.update_class_vector_store_folder(class_id, current_folder, is_syllabus=is_syllabus)
        
        pdf_dir = _store_dir(current_folder) / "source_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        
        # Handle file uploads
        if 'files' not in request.files:
            return jsonify({"error": "No files provided"}), 400
        
        files = request.files.getlist('files')
        
        for file in files:
            if file.filename:
                ext = os.path.splitext(file.filename.lower())[1]
                if ext in SUPPORTED_EXTENSIONS:
                    safe_name = file.filename.replace('/', '_').replace('\\', '_')
                    dest = pdf_dir / safe_name
                    file.save(str(dest))
                
                # Store metadata in database
                db_service.create_corpus_file(
                    class_id,
                    safe_name,
                    material_type,
                    dest.stat().st_size,
                    cls.get('facultyId')
                )
        
        return jsonify({"success": True})
    except Exception as error:
        print(f"[CORPUS] UPLOAD ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/index", methods=["POST"])
def index():
    """Index corpus endpoint - calls indexing service in-process (no subprocess).
    
    Uses Flask's pre-loaded embedding model for instant indexing (no 5-10s PyTorch startup).
    A semaphore limits concurrent indexing to 3 to keep at least 2 Gunicorn workers free for chat.
    """
    # Try to acquire the semaphore (non-blocking check first for immediate feedback)
    acquired = _indexing_semaphore.acquire(timeout=0)
    if not acquired:
        # All 3 indexing slots are busy — wait with a timeout
        print("[CORPUS] INDEX: 3 concurrent indexing jobs running, waiting for a slot...", flush=True)
        acquired = _indexing_semaphore.acquire(timeout=600)  # Wait up to 10 min
        if not acquired:
            return jsonify({
                "error": "Server is busy with other indexing requests. Please try again in a few minutes.",
                "success": False
            }), 503

    try:
        print("[CORPUS] INDEX request received (Start indexing clicked)", flush=True)
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        class_id = data.get("classId")
        material_type = data.get("materialType", "class_material")
        force_reindex = data.get("forceReindex", False)
        is_syllabus = material_type == "syllabus"
        print(f"[CORPUS] INDEX params: classId={class_id} materialType={material_type} is_syllabus={is_syllabus} forceReindex={force_reindex}", flush=True)
        
        if not class_id:
            return jsonify({"error": "Class ID is required"}), 400
        
        cls = db_service.get_class_by_id(class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        
        vector_store_folder = cls.get('syllabusVectorStoreFolder' if is_syllabus else 'vectorStoreFolder')
        if not vector_store_folder:
            base = cls.get('vectorStoreFolder') or db_service.generate_vector_store_folder_name(cls.get('name', 'class'))
            vector_store_folder = (base + '_syllabus') if is_syllabus else base
            db_service.update_class_vector_store_folder(class_id, vector_store_folder, is_syllabus=is_syllabus)
            print(f"[CORPUS] INDEX assigned vector_store_folder={vector_store_folder} for class id={class_id}", flush=True)
        print(f"[CORPUS] INDEX class name={cls.get('name')} vector_store_folder={vector_store_folder}", flush=True)
        
        backend_root = pathlib.Path(__file__).resolve().parent.parent
        store_path = get_vector_store_path_by_folder(vector_store_folder)
        pdf_dir = (backend_root / store_path / "source_pdfs").resolve()
        pdf_dir.mkdir(parents=True, exist_ok=True)
        output_path_abs = (backend_root / store_path).resolve()
        print(f"[CORPUS] INDEX backend_root={backend_root} store_path={store_path} pdf_dir={pdf_dir} output_path_abs={output_path_abs}", flush=True)
        
        if not pdf_dir.exists():
            return jsonify({"error": "No documents directory found. Upload files first."}), 400
        
        # Collect all supported file types (PDF, Word, TXT)
        doc_files = []
        for ext in SUPPORTED_EXTENSIONS:
            doc_files.extend([str(f) for f in pdf_dir.glob(f'*{ext}')])
        # Also check uppercase extensions
        for ext in SUPPORTED_EXTENSIONS:
            doc_files.extend([str(f) for f in pdf_dir.glob(f'*{ext.upper()}')])
        # Deduplicate (in case of case-insensitive filesystem)
        doc_files = list(dict.fromkeys(doc_files))
        print(f"[CORPUS] INDEX pdf_dir.exists=True doc_files ({len(doc_files)}): {doc_files}", flush=True)
        
        if not doc_files:
            return jsonify({"error": "No supported files found to index (PDF, Word, TXT)"}), 400
        
        # Force reindex: delete existing Qdrant collection and metadata so indexing starts fresh
        if force_reindex:
            print(f"[CORPUS] INDEX forceReindex=True — deleting existing collection and metadata...", flush=True)
            try:
                from lib import indexing_service as _idx_svc
                collection_name = _idx_svc.get_collection_name(str(output_path_abs))
                qdrant_client = _idx_svc.get_or_init_qdrant_client()
                try:
                    qdrant_client.delete_collection(collection_name)
                    print(f"[CORPUS] INDEX forceReindex: deleted Qdrant collection '{collection_name}'", flush=True)
                except Exception as del_err:
                    print(f"[CORPUS] INDEX forceReindex: could not delete collection '{collection_name}': {del_err}", flush=True)
                # Also clear metadata.json so files aren't skipped
                metadata_json = output_path_abs / "metadata.json"
                if metadata_json.exists():
                    metadata_json.unlink()
                    print(f"[CORPUS] INDEX forceReindex: deleted metadata.json", flush=True)
                # Clear cached vector store in RAG service so it reloads from Qdrant
                try:
                    _evict_cached_vector_store(output_path_abs)
                except Exception as cache_err:
                    print(f"[CORPUS] INDEX forceReindex: could not clear cache: {cache_err}", flush=True)
            except Exception as force_err:
                print(f"[CORPUS] INDEX forceReindex: cleanup error (continuing anyway): {force_err}", flush=True)
                import traceback
                traceback.print_exc()
        
        # Call indexing service directly (in-process, no subprocess)
        # The embedding model is either already loaded by the RAG service or will be
        # lazily initialized by the indexing service on first use.
        import time as _time
        start_time = _time.time()
        print(f"[CORPUS] INDEX calling index_pdfs() in-process (no subprocess)...", flush=True)
        
        try:
            from lib import indexing_service
            index_result = indexing_service.index_pdfs(
                pdf_paths=doc_files,
                output_path=str(output_path_abs),
                is_syllabus=is_syllabus,
                class_id=class_id,
                class_name=cls.get('name', '')
            )
        except Exception as idx_err:
            elapsed = _time.time() - start_time
            print(f"[CORPUS] INDEX index_pdfs() raised exception after {elapsed:.1f}s: {idx_err}", flush=True)
            import traceback
            traceback.print_exc()
            return jsonify({
                "error": f"Indexing failed: {idx_err}",
                "success": False
            }), 500
        
        elapsed = _time.time() - start_time
        print(f"[CORPUS] INDEX index_pdfs() completed in {elapsed:.1f}s: success={index_result.get('success')}", flush=True)
        
        # Handle failure from indexing service
        if index_result.get('success') is False:
            err = index_result.get('error', 'Indexing failed')
            print(f"[CORPUS] INDEX index_pdfs() reported success=false: error={err}", flush=True)
            return jsonify({"error": err, "success": False}), 500
        
        chunks_per_file = index_result.get('chunks_per_file') or {}
        print(f"[CORPUS] INDEX success: chunks={index_result.get('chunks')} pdfs={index_result.get('pdfs')} newChunks={index_result.get('new_chunks')} chunks_per_file={chunks_per_file}", flush=True)
        
        # Mark every attempted file as indexed in the database
        print("[CORPUS] INDEX marking corpus files as indexed in DB...", flush=True)
        for doc_path in doc_files:
            safe_name = pathlib.Path(doc_path).name
            chunk_count = chunks_per_file.get(safe_name)
            if chunk_count is None:
                chunk_count = chunks_per_file.get(doc_path, 0)
            if not isinstance(chunk_count, int):
                chunk_count = int(chunk_count) if chunk_count is not None else 0
            db_service.mark_corpus_file_as_indexed(class_id, safe_name, material_type, chunk_count)
            print(f"[CORPUS] INDEX marked: {safe_name} -> chunk_count={chunk_count}", flush=True)
        
        print(f"[CORPUS] INDEX completed successfully in {elapsed:.1f}s.", flush=True)
        return jsonify({
            "success": True,
            "chunks": index_result.get('chunks', 0),
            "pdfs": index_result.get('pdfs', len(doc_files)),
            "newChunks": index_result.get('new_chunks', 0)
        })
    except Exception as error:
        print(f"[CORPUS] INDEX ERROR: {error}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500
    finally:
        _indexing_semaphore.release()

@bp.route("/files", methods=["GET", "DELETE"])
def files():
    """Files endpoint - migrated from app/api/corpus/files/route.ts"""
    try:
        if request.method == "GET":
            class_id = request.args.get("classId")
            material_type = request.args.get("materialType", "class_material")
            
            if not class_id:
                return jsonify({"error": "Class ID is required"}), 400
            
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"files": []})
            
            corpus_files = db_service.get_corpus_files_by_class(class_id, material_type)
            files = [f['fileName'] for f in corpus_files]
            total_chunks = sum(f.get('chunkCount', 0) or 0 for f in corpus_files)
            # Prefer Qdrant's count: it includes chunks left behind by deleted files (which the
            # UI then offers to clear) and falls back to the DB totals if Qdrant is unreachable
            folder = cls.get('syllabusVectorStoreFolder' if material_type == "syllabus" else 'vectorStoreFolder')
            if folder:
                indexed_chunks = _count_indexed_chunks(_store_dir(folder))
                if indexed_chunks is not None:
                    total_chunks = indexed_chunks
            return jsonify({
                "files": files,
                "totalChunks": total_chunks,
                "filesData": [{"fileName": f["fileName"], "chunkCount": f.get("chunkCount", 0)} for f in corpus_files]
            })
        
        elif request.method == "DELETE":
            class_id = request.args.get("classId")
            filename = request.args.get("filename")
            material_type = request.args.get("materialType", "class_material")
            is_syllabus = material_type == "syllabus"
            
            if not class_id or not filename:
                return jsonify({"error": "Class ID and filename are required"}), 400
            
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404
            
            vector_store_folder = cls.get('syllabusVectorStoreFolder' if is_syllabus else 'vectorStoreFolder')
            if not vector_store_folder:
                base = cls.get('vectorStoreFolder') or db_service.generate_vector_store_folder_name(cls.get('name', 'class'))
                vector_store_folder = (base + '_syllabus') if is_syllabus else base
                db_service.update_class_vector_store_folder(class_id, vector_store_folder, is_syllabus=is_syllabus)
            
            base_path = _store_dir(vector_store_folder)
            pdf_dir = base_path / "source_pdfs"
            file_path = pdf_dir / filename
            
            # Security check
            if not str(file_path).startswith(str(pdf_dir)):
                return jsonify({"error": "Invalid filename"}), 400
            
            # Delete the file's chunks first: if Qdrant fails, the file stays so the delete can be retried
            _remove_indexed_chunks(base_path, source_file=filename)
            
            # Delete file
            if file_path.exists():
                file_path.unlink()
            
            # Delete from database
            db_service.delete_corpus_file(class_id, filename, material_type)
            
            return jsonify({"success": True})
    except Exception as error:
        print(f"[CORPUS] FILES ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/chunks", methods=["DELETE"])
def clear_chunks():
    """Removes every indexed chunk for a class (Qdrant + metadata.json). Uploaded files are kept
    and marked as not indexed, so they can be indexed again."""
    try:
        class_id = request.args.get("classId")
        material_type = request.args.get("materialType", "class_material")
        if not class_id:
            return jsonify({"error": "Class ID is required"}), 400
        
        cls = db_service.get_class_by_id(class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        
        folder = cls.get('syllabusVectorStoreFolder' if material_type == "syllabus" else 'vectorStoreFolder')
        if folder:
            _remove_indexed_chunks(_store_dir(folder))
        db_service.reset_corpus_files_index(class_id, material_type)
        
        return jsonify({
            "success": True,
            "message": "All chunks cleared",
            "pdfCount": len(db_service.get_corpus_files_by_class(class_id, material_type)),
            "chunkCount": 0,
        })
    except Exception as error:
        print(f"[CORPUS] CLEAR CHUNKS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/merge-all", methods=["POST", "GET"])
def merge_all():
    """Merge all endpoint - migrated from app/api/corpus/merge-all/route.ts"""
    try:
        if request.method == "POST":
            data = request.get_json()
            if not data:
                return jsonify({"error": "Request body is required"}), 400
            
            class_ids = data.get("classIds", [])
            class_names = data.get("classNames", [])
            
            if not class_ids:
                return jsonify({"error": "Class IDs are required"}), 400
            
            # Use existing Python merge service
            merge_service_path = pathlib.Path('lib') / 'llamaindex-indexing-service.py'
            # This would need to be adapted - for now return success
            return jsonify({
                "success": True,
                "message": "Merge functionality to be implemented"
            })
        
        elif request.method == "GET":
            # Check merge status
            return jsonify({
                "status": "ready",
                "message": "Merge service available"
            })
    except Exception as error:
        print(f"[CORPUS] MERGE ALL ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/stats", methods=["GET"])
def stats():
    """Stats endpoint - supports classId (for student chat) or collectionName (legacy)."""
    try:
        class_id = request.args.get("classId")
        material_type = request.args.get("materialType", "class_material")
        student_id = request.args.get("studentId")

        # Class-based stats (for student portal "has PDFs" check)
        if class_id:
            cls = db_service.get_class_by_id(class_id)
            if not cls:
                return jsonify({"error": "Class not found"}), 404

            # Optional: check student enrollment
            is_enrolled = True
            if student_id:
                student_ids = cls.get("studentIds") or []
                is_enrolled = student_id in [str(s) for s in student_ids]

            files = db_service.get_corpus_files_by_class(class_id, material_type)
            indexed = [f for f in files if f.get("isIndexed")]
            pdf_count = len(indexed)
            chunk_count = sum(int(f.get("chunkCount") or 0) for f in indexed)
            has_indexed_files = pdf_count > 0
            can_chat = has_indexed_files and is_enrolled

            return jsonify({
                "pdfCount": pdf_count,
                "chunkCount": chunk_count,
                "isEnrolled": is_enrolled if student_id else None,
                "hasIndexedFiles": has_indexed_files,
                "canChat": can_chat,
            })

        # Legacy: collectionName (e.g. for corpus management)
        collection_name = request.args.get("collectionName")
        if not collection_name:
            return jsonify({"error": "classId or collectionName is required"}), 400
        return jsonify({
            "totalChunks": 0,
            "collectionName": collection_name,
        })
    except Exception as error:
        print(f"[CORPUS] STATS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500
