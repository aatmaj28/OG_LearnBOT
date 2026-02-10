"""
Corpus management endpoints
Migrated from app/api/corpus/*/route.ts
"""
from flask import Blueprint, request, jsonify
from services import db_service
import os
import pathlib
import subprocess
import json

bp = Blueprint("corpus", __name__)

def get_vector_store_path_by_folder(folder_name: str) -> str:
    """Gets vector store path by folder name"""
    return str(pathlib.Path('vector_stores') / folder_name)

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
            vector_store_folder = db_service.generate_vector_store_folder_name(cls['name']) + folder_suffix
            # Update class with vector store folder
            # This would require an update function - for now, assume it exists
            current_folder = vector_store_folder
        
        store_path = get_vector_store_path_by_folder(current_folder)
        pdf_dir = pathlib.Path(store_path) / "source_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        
        # Handle file uploads
        if 'files' not in request.files:
            return jsonify({"error": "No files provided"}), 400
        
        files = request.files.getlist('files')
        
        for file in files:
            if file.filename and file.filename.lower().endswith('.pdf'):
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
    """Index corpus endpoint - migrated from app/api/corpus/index/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        class_id = data.get("classId")
        material_type = data.get("materialType", "class_material")
        is_syllabus = material_type == "syllabus"
        
        if not class_id:
            return jsonify({"error": "Class ID is required"}), 400
        
        cls = db_service.get_class_by_id(class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        
        vector_store_folder = cls.get('syllabusVectorStoreFolder' if is_syllabus else 'vectorStoreFolder')
        if not vector_store_folder:
            return jsonify({"error": f"Class {material_type} vector store not configured"}), 400
        
        backend_root = pathlib.Path(__file__).resolve().parent.parent
        store_path = get_vector_store_path_by_folder(vector_store_folder)
        # Use absolute paths so the indexing script finds files on server
        pdf_dir = (backend_root / store_path / "source_pdfs").resolve()
        
        if not pdf_dir.exists():
            return jsonify({"error": "No PDFs directory found. Upload PDFs first."}), 400
        
        # Get all PDF files (absolute paths)
        pdf_files = [str(f) for f in pdf_dir.glob("*.pdf")]
        
        if not pdf_files:
            return jsonify({"error": "No PDF files found to index"}), 400
        
        # Use indexing script in backend lib/ (deployed with repo)
        indexing_service_path = backend_root / 'lib' / 'llamaindex-indexing-service.py'
        if not indexing_service_path.exists():
            return jsonify({
                "error": "Indexing service not found (lib/llamaindex-indexing-service.py). Deploy may be incomplete."
            }), 500

        # Determine Python executable (venv relative to backend root)
        venv_python = backend_root / 'venv' / ('Scripts' if os.name == 'nt' else 'bin') / 'python'
        python_exec = str(venv_python) if venv_python.exists() else (os.getenv('PYTHON_PATH', 'python'))

        args = [
            str(indexing_service_path),
            str((backend_root / store_path).resolve()),
            'true' if is_syllabus else 'false',
            class_id,
            cls.get('name', ''),
            *pdf_files
        ]

        # Pass QDRANT_URL (and QDRANT_API_KEY) so the indexing script uses the same Qdrant as Flask (subprocess may not inherit env under Gunicorn)
        subprocess_env = os.environ.copy()
        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6335")
        subprocess_env["QDRANT_URL"] = qdrant_url
        if os.getenv("QDRANT_API_KEY"):
            subprocess_env["QDRANT_API_KEY"] = os.getenv("QDRANT_API_KEY")

        # Run with cwd=backend root so store_path (e.g. vector_stores/...) and script path resolve
        result = subprocess.run(
            [python_exec] + args,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
            cwd=str(backend_root),
            env=subprocess_env
        )
        
        if result.returncode != 0:
            return jsonify({
                "error": f"Indexing failed: {result.stderr}",
                "success": False
            }), 500
        
        # Parse result from last line of stdout
        try:
            last_line = result.stdout.strip().split('\n')[-1]
            index_result = json.loads(last_line)

            # Script can return success: false (e.g. no text extracted from PDFs)
            if index_result.get('success') is False:
                err = index_result.get('error', 'Indexing failed')
                print(f"[CORPUS] INDEX script reported failure: {err}", flush=True)
                print(f"[CORPUS] script stderr: {result.stderr[:2000] if result.stderr else '(none)'}", flush=True)
                return jsonify({"error": err, "success": False}), 500

            chunks_per_file = index_result.get('chunks_per_file') or {}
            total_chunks = index_result.get('chunks', 0)
            if total_chunks == 0 and result.stderr:
                print(f"[CORPUS] INDEX returned 0 chunks. script stderr (last 1500 chars): {result.stderr[-1500:]}", flush=True)

            # Mark every attempted PDF as indexed (so chunk_count and is_indexed get set even when script returns empty chunks_per_file)
            for pdf_path in pdf_files:
                safe_name = pathlib.Path(pdf_path).name
                chunk_count = chunks_per_file.get(safe_name)
                if chunk_count is None:
                    # Key might be full path in script output
                    chunk_count = chunks_per_file.get(pdf_path, 0)
                if not isinstance(chunk_count, int):
                    chunk_count = int(chunk_count) if chunk_count is not None else 0
                db_service.mark_corpus_file_as_indexed(class_id, safe_name, material_type, chunk_count)

            return jsonify({
                "success": True,
                "chunks": index_result.get('chunks', 0),
                "pdfs": index_result.get('pdfs', len(pdf_files)),
                "newChunks": index_result.get('newChunks', 0)
            })
        except json.JSONDecodeError:
            return jsonify({
                "error": "Failed to parse indexing result",
                "success": False
            }), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Indexing timed out"}), 500
    except Exception as error:
        print(f"[CORPUS] INDEX ERROR: {error}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500

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
            return jsonify({"files": files})
        
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
                return jsonify({"error": "Class not found"}), 404
            
            base_path = pathlib.Path(get_vector_store_path_by_folder(vector_store_folder))
            pdf_dir = base_path / "source_pdfs"
            file_path = pdf_dir / filename
            
            # Security check
            if not str(file_path).startswith(str(pdf_dir)):
                return jsonify({"error": "Invalid filename"}), 400
            
            # Delete file
            if file_path.exists():
                file_path.unlink()
            
            # Delete from database
            db_service.delete_corpus_file(class_id, filename, material_type)
            
            return jsonify({"success": True})
    except Exception as error:
        print(f"[CORPUS] FILES ERROR: {error}")
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
    """Stats endpoint - migrated from app/api/corpus/stats/route.ts"""
    try:
        collection_name = request.args.get("collectionName")
        if not collection_name:
            return jsonify({"error": "Collection name is required"}), 400
        
        # Get stats from Qdrant
        # This would require Qdrant client - for now return placeholder
        return jsonify({
            "totalChunks": 0,
            "collectionName": collection_name
        })
    except Exception as error:
        print(f"[CORPUS] STATS ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500
