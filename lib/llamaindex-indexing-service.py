"""
LlamaIndex-based indexing service for LearnBot
Uses Qdrant for vector storage (migrated from ChromaDB for better performance and filtering)
"""
import sys
import os
import json
import threading
from pathlib import Path
from typing import List, Optional
 
# LlamaIndex imports
from llama_index.core import VectorStoreIndex, StorageContext, Document, Settings
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.node_parser.text.semantic_splitter import SemanticSplitterNodeParser
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.readers.file import PDFReader
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from qdrant_client.http.exceptions import UnexpectedResponse

# Use sentence-transformers directly (already installed)
from sentence_transformers import SentenceTransformer
 
# Configuration
# Using nomic-embed-text-v1.5 for better academic PDF handling (longer context, better formula handling)
EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5"
QDRANT_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vector-stores", "qdrant")

# Qdrant Server Configuration
# Defaults to server mode (http://localhost:6333) for production
# Set QDRANT_URL environment variable to override (e.g., "http://localhost:6333" or cloud URL)
# Set QDRANT_URL="" to use local mode instead
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)  # Optional API key for cloud Qdrant

# Global cache for embedding model and Qdrant client (loaded once, reused for all indexing operations)
_global_embed_model = None
_global_qdrant_client = None
_initialization_lock = threading.Lock() if 'threading' in sys.modules else None
if _initialization_lock is None:
    import threading
    _initialization_lock = threading.Lock()


def _load_already_processed_files_from_metadata(output_path: str) -> set:
    """
    Fallback helper: load list of already-processed files from metadata.json
    in the given output_path. This is used when Qdrant scroll fails so that
    we can still avoid re-indexing PDFs that are already in the vector store.
    """
    already_processed_files = set()
    try:
        metadata_json_path = os.path.join(output_path, "metadata.json")
        if not os.path.exists(metadata_json_path):
            return already_processed_files

        with open(metadata_json_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        # metadata is expected to be a list of entries with "source_file"
        for entry in metadata:
            source_file = entry.get("source_file")
            if source_file:
                already_processed_files.add(source_file)

        print(
            f"[LlamaIndex] Fallback: loaded {len(already_processed_files)} already processed files from metadata.json",
            file=sys.stderr,
        )
    except Exception as e:
        print(
            f"[LlamaIndex] Warning: Failed to load already processed files from metadata.json: {e}",
            file=sys.stderr,
        )

    return already_processed_files


def _get_chunks_per_file_from_metadata(output_path: str) -> dict:
    """
    Helper: compute exact chunk counts per file from metadata.json.
    Returns a dict: {source_file: count}
    """
    chunks_per_file: dict = {}
    try:
        metadata_json_path = os.path.join(output_path, "metadata.json")
        if not os.path.exists(metadata_json_path):
            return chunks_per_file

        with open(metadata_json_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        for entry in metadata:
            source_file = entry.get("source_file")
            if not source_file:
                continue
            chunks_per_file[source_file] = chunks_per_file.get(source_file, 0) + 1

        print(
            f"[LlamaIndex] Loaded chunk counts per file from metadata.json: {chunks_per_file}",
            file=sys.stderr,
        )
    except Exception as e:
        print(
            f"[LlamaIndex] Warning: Failed to get chunks per file from metadata.json: {e}",
            file=sys.stderr,
        )

    return chunks_per_file


def get_collection_name(output_path: str) -> str:
    """
    Generate a collection name from the output path.
    Uses the folder name as the collection name.
    Qdrant collection names must be valid identifiers (alphanumeric + underscore).
    """
    # Get the folder name from the path
    folder_name = os.path.basename(os.path.normpath(output_path))
    # Sanitize for Qdrant (replace invalid chars, keep alphanumeric and underscore)
    collection_name = folder_name.replace("/", "_").replace("\\", "_").replace(" ", "_")
    # Remove any remaining invalid characters
    collection_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in collection_name)
    return collection_name


def _create_embed_model():
    """
    Create a new SentenceTransformerEmbedding instance.
    This is a helper function to avoid code duplication.
    """
    from llama_index.core.embeddings import BaseEmbedding
    from pydantic import PrivateAttr
    
    class SentenceTransformerEmbedding(BaseEmbedding):
        _model = PrivateAttr()
        
        def __init__(self, model_name: str = EMBEDDING_MODEL, **kwargs):
            super().__init__(**kwargs)
            # nomic models require trust_remote_code=True
            object.__setattr__(self, '_model', SentenceTransformer(model_name, trust_remote_code=True))
        
        def _get_query_embedding(self, query: str):
            return self._model.encode(query, convert_to_numpy=True).tolist()
        
        def _get_text_embedding(self, text: str):
            return self._model.encode(text, convert_to_numpy=True).tolist()
        
        def _get_text_embeddings(self, texts: List[str]):
            embeddings = self._model.encode(texts, convert_to_numpy=True)
            return [emb.tolist() for emb in embeddings]
        
        async def _aget_query_embedding(self, query: str):
            return self._get_query_embedding(query)
        
        async def _aget_text_embedding(self, text: str):
            return self._get_text_embedding(text)
    
    return SentenceTransformerEmbedding(EMBEDDING_MODEL)


def get_or_init_embed_model():
    """
    Get or initialize the global embedding model (loaded once, reused for all indexing operations).
    This significantly speeds up subsequent indexing operations.
    """
    global _global_embed_model
    
    if _global_embed_model is None:
        with _initialization_lock:
            # Double-check pattern (another thread might have initialized it)
            if _global_embed_model is None:
                print(f"[LlamaIndex] 🚀 Loading embedding model: {EMBEDDING_MODEL} (this happens once)", file=sys.stderr)
                _global_embed_model = _create_embed_model()
                print(f"[LlamaIndex] ✅ Embedding model loaded and cached (will be reused for all indexing)", file=sys.stderr)
    else:
        print(f"[LlamaIndex] ♻️  Reusing cached embedding model (fast!)", file=sys.stderr)
    
    return _global_embed_model


def get_or_init_qdrant_client():
    """
    Get or initialize the global Qdrant client (connected once, reused for all indexing operations).
    This keeps the connection alive and speeds up subsequent indexing operations.
    """
    global _global_qdrant_client
    
    if _global_qdrant_client is None:
        with _initialization_lock:
            # Double-check pattern (another thread might have initialized it)
            if _global_qdrant_client is None:
                # Initialize Qdrant client (server mode by default, local mode if QDRANT_URL is empty)
                if QDRANT_URL and QDRANT_URL.strip():
                    # Server mode: use host+port for REST so we hit the exact port (e.g. 6335)
                    from urllib.parse import urlparse
                    parsed = urlparse(QDRANT_URL.strip())
                    host = parsed.hostname or "localhost"
                    port = parsed.port or 6333
                    print(f"[LlamaIndex] 🔌 Connecting to Qdrant server at: {host}:{port} (REST only) (this happens once)", file=sys.stderr)
                    _global_qdrant_client = QdrantClient(
                        host=host,
                        port=port,
                        api_key=QDRANT_API_KEY,
                        timeout=60,
                        prefer_grpc=False
                    )
                    print(f"[LlamaIndex] ✅ Qdrant connection established and cached (will be reused)", file=sys.stderr)
                else:
                    # Local mode: Use local persistent storage
                    print(f"[LlamaIndex] 🔌 Connecting to Qdrant local storage at: {QDRANT_PERSIST_DIR} (this happens once)", file=sys.stderr)
                    os.makedirs(QDRANT_PERSIST_DIR, exist_ok=True)
                    _global_qdrant_client = QdrantClient(path=QDRANT_PERSIST_DIR)
                    print(f"[LlamaIndex] ✅ Qdrant local connection established and cached (will be reused)", file=sys.stderr)
    else:
        print(f"[LlamaIndex] ♻️  Reusing cached Qdrant connection (fast!)", file=sys.stderr)
    
    return _global_qdrant_client


def index_pdfs(
    pdf_paths: List[str],
    output_path: str,
    is_syllabus: bool = False,
    class_id: Optional[str] = None,
    class_name: Optional[str] = None
) -> dict:
    """
    Index PDFs using LlamaIndex and save to Qdrant
    
    Args:
        pdf_paths: List of PDF file paths to index
        output_path: Directory path (used to generate collection name)
        is_syllabus: Whether these are syllabus documents (affects chunking)
        class_id: Optional class ID for metadata (REQUIRED for filtering)
        class_name: Optional class name for metadata
   
    Returns:
        Dictionary with success status and statistics
    """
    try:
        print(f"[LlamaIndex] Processing {len(pdf_paths)} PDFs", file=sys.stderr)
        print(f"[LlamaIndex] Output path: {output_path}", file=sys.stderr)
        print(f"[LlamaIndex] Is syllabus: {is_syllabus}", file=sys.stderr)
        
        # Get or initialize cached embedding model (loaded once, reused for all indexing)
        embed_model = get_or_init_embed_model()
        Settings.embed_model = embed_model
        
        # Both RAG 1 (Class Materials) and RAG 2 (Syllabus) use SemanticSplitterNodeParser for consistency
        # This preserves complete concepts, formulas, and examples
        semantic_splitter = SemanticSplitterNodeParser(
            embed_model=embed_model,
            buffer_size=1,  # Group 1 sentence when evaluating similarity (safe for token limits)
            breakpoint_percentile_threshold=85,  # 85th percentile threshold for semantic breakpoints (more granular chunking)
        )
        Settings.node_parser = semantic_splitter
        if is_syllabus:
            print(f"[LlamaIndex] RAG 2 (Syllabus): Using nomic + SemanticSplitterNodeParser (semantic chunking)", file=sys.stderr)
        else:
            print(f"[LlamaIndex] RAG 1 (Class Materials): Using nomic + SemanticSplitterNodeParser (semantic chunking)", file=sys.stderr)
        
        # Get collection name from output path
        collection_name = get_collection_name(output_path)
        print(f"[LlamaIndex] Using Qdrant collection: {collection_name}", file=sys.stderr)
        
        # Get or initialize cached Qdrant client (connected once, reused for all indexing)
        qdrant_client = get_or_init_qdrant_client()
        
        # Get or create collection
        # Qdrant collections need vector size (768 for nomic-embed-text-v1.5)
        vector_size = 768
        try:
            collection_info = qdrant_client.get_collection(collection_name)
            existing_count = collection_info.points_count
            print(f"[LlamaIndex] Found existing Qdrant collection: {collection_name} ({existing_count} vectors)", file=sys.stderr)
        except UnexpectedResponse as e:
            # 404 = collection doesn't exist; create it
            if e.status_code == 404:
                print(f"[LlamaIndex] Collection {collection_name} not found (404), creating...", file=sys.stderr)
                try:
                    qdrant_client.create_collection(
                        collection_name=collection_name,
                        vectors_config=VectorParams(
                            size=vector_size,
                            distance=Distance.COSINE
                        )
                    )
                    existing_count = 0
                    print(f"[LlamaIndex] Created new Qdrant collection: {collection_name}", file=sys.stderr)
                except Exception as create_err:
                    print(f"[LlamaIndex] ERROR create_collection failed: {create_err}", file=sys.stderr)
                    raise
            else:
                raise
        except Exception as e:
            # Other errors (e.g. connection) - try creating anyway in case get_collection path was wrong
            print(f"[LlamaIndex] get_collection raised: {e}", file=sys.stderr)
            try:
                qdrant_client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(
                        size=vector_size,
                        distance=Distance.COSINE
                    )
                )
                existing_count = 0
                print(f"[LlamaIndex] Created new Qdrant collection: {collection_name}", file=sys.stderr)
            except Exception as create_err:
                print(f"[LlamaIndex] ERROR create_collection failed: {create_err}", file=sys.stderr)
                raise
        
        # Check which files are already indexed.
        # Prefer metadata.json (fast, avoids Qdrant scroll bugs); fall back to Qdrant if needed.
        already_processed_files = set()
        if existing_count > 0:
            metadata_files = _load_already_processed_files_from_metadata(output_path)
            if metadata_files:
                already_processed_files = metadata_files
            else:
                try:
                    # Qdrant scroll API to get all points with payload
                    scroll_result = qdrant_client.scroll(
                        collection_name=collection_name,
                        limit=10000,  # Adjust if you have more than 10k chunks
                        with_payload=True,
                        with_vectors=False
                    )
                    points = scroll_result[0]  # First element is the list of points
                    for point in points:
                        if point.payload and "source_file" in point.payload:
                            already_processed_files.add(point.payload["source_file"])
                    print(
                        f"[LlamaIndex] Found {len(already_processed_files)} already processed files",
                        file=sys.stderr
                    )
                except Exception as e:
                    print(f"[LlamaIndex] Warning: Could not check existing files via Qdrant scroll: {e}", file=sys.stderr)
                    # Final fallback: no already-processed info; proceed but may reindex
                    print(
                        "[LlamaIndex] Incremental skip-by-filename may be incomplete.",
                        file=sys.stderr,
                    )
       
        # Load and process PDFs
        all_documents = []
        new_chunks_count = 0
        chunks_per_file = {}  # Track exact chunk counts per file
        pdf_reader = PDFReader()
       
        for pdf_path in pdf_paths:
            try:
                # Resolve to absolute path so the file is found regardless of cwd
                pdf_path_abs = str(Path(pdf_path).resolve())
                pdf_filename = os.path.basename(pdf_path)
               
                # Skip if already processed (incremental mode)
                if pdf_filename in already_processed_files:
                    print(f"[LlamaIndex] Skipping (already indexed): {pdf_filename}", file=sys.stderr)
                    continue
               
                print(f"[LlamaIndex] Processing NEW file: {pdf_filename}", file=sys.stderr)
                if not Path(pdf_path_abs).exists():
                    print(f"[LlamaIndex] ERROR: File not found: {pdf_path_abs}", file=sys.stderr)
                    chunks_per_file[pdf_filename] = 0
                    continue

                # Load PDF using LlamaIndex reader
                documents = pdf_reader.load_data(file=Path(pdf_path_abs))
                if not documents:
                    print(f"[LlamaIndex] WARNING: No text extracted from {pdf_filename} (empty or image-only PDF?)", file=sys.stderr)
                    chunks_per_file[pdf_filename] = 0
                    continue
                
                # Add metadata to documents (class_id is REQUIRED for filtering)
                for doc in documents:
                    doc.metadata["source_file"] = pdf_filename
                    doc.metadata["section_title"] = f"Section from {pdf_filename}"
                    # Always include class_id for filtering (required)
                    doc.metadata["class_id"] = class_id or "unknown"
                    if class_name:
                        doc.metadata["class_name"] = class_name
                    if is_syllabus:
                        doc.metadata["is_syllabus"] = "true"
                    else:
                        doc.metadata["is_syllabus"] = "false"
                
                all_documents.extend(documents)
                file_chunk_count = len(documents)
                new_chunks_count += file_chunk_count
                chunks_per_file[pdf_filename] = file_chunk_count  # Store exact count per file
                print(f"[LlamaIndex] Extracted {file_chunk_count} NEW chunks from {pdf_filename}", file=sys.stderr)
                
            except Exception as e:
                print(f"[LlamaIndex] Error processing {pdf_path}: {e}", file=sys.stderr)
                continue
       
        if len(all_documents) == 0:
            # We processed files but got 0 documents (e.g. no text extracted) -> fail with clear message
            if chunks_per_file and any(c == 0 for c in chunks_per_file.values()):
                print(f"[LlamaIndex] ERROR: No text extracted from PDF(s). chunks_per_file={chunks_per_file}", file=sys.stderr)
                return {
                    "success": False,
                    "error": "No text could be extracted from the PDF(s). Check that files exist at the expected path and contain extractable text (not image-only).",
                    "chunks_per_file": chunks_per_file
                }
            # All files were already indexed - get exact counts from Qdrant
            if existing_count > 0:
                print(f"[LlamaIndex] All PDFs already indexed. Using existing collection with {existing_count} vectors.", file=sys.stderr)
                
                # Get exact chunk counts per file, preferring metadata.json to avoid scroll issues
                exact_chunks_per_file = _get_chunks_per_file_from_metadata(output_path)
                if not exact_chunks_per_file:
                    try:
                        scroll_result = qdrant_client.scroll(
                            collection_name=collection_name,
                            limit=10000,
                            with_payload=True,
                            with_vectors=False
                        )
                        points = scroll_result[0]
                        
                        for point in points:
                            payload = point.payload or {}
                            source_file = payload.get("source_file", "unknown")
                            if source_file not in exact_chunks_per_file:
                                exact_chunks_per_file[source_file] = 0
                            exact_chunks_per_file[source_file] += 1
                        
                        print(f"[LlamaIndex] Exact chunk counts per file (from Qdrant): {exact_chunks_per_file}", file=sys.stderr)
                    except Exception as e:
                        print(f"[LlamaIndex] Warning: Could not get exact counts per file from Qdrant: {e}", file=sys.stderr)
                        exact_chunks_per_file = {}
                
                # Update config.json with current counts
                config = {
                    "class_id": class_id or "",
                    "class_name": class_name or "",
                    "embedding_model": EMBEDDING_MODEL,
                    "dimension": 768,
                    "total_chunks": existing_count,
                    "total_pdfs": len(pdf_paths),
                    "chunking_strategy": "SemanticSplitterNodeParser",
                    "collection_name": collection_name,
                    "qdrant_url": QDRANT_URL or "local",
                    "created_at": None
                }
                configPath = os.path.join(output_path, "config.json")
                with open(configPath, "w") as f:
                    json.dump(config, f, indent=2)
                return {
                    "success": True,
                    "chunks": existing_count,
                    "pdfs": len(pdf_paths),
                    "new_chunks": 0,
                    "chunks_per_file": exact_chunks_per_file  # Exact counts per file from Qdrant
                }
            else:
                print("[LlamaIndex] ERROR: No documents extracted!", file=sys.stderr)
                return {"success": False, "error": "No documents extracted"}
        
        # Check if we need to do any indexing
        if new_chunks_count == 0 and existing_count > 0:
            print("[LlamaIndex] No new PDFs to index. Using existing collection.", file=sys.stderr)
            
            # Fetch exact chunk counts from Qdrant even if we skip indexing
            exact_chunks_per_file = {}
            try:
                scroll_result = qdrant_client.scroll(
                    collection_name=collection_name,
                    limit=10000,
                    with_payload=True,
                    with_vectors=False
                )
                points = scroll_result[0]
                for point in points:
                    payload = point.payload or {}
                    source_file = payload.get("source_file", "unknown")
                    if source_file not in exact_chunks_per_file:
                        exact_chunks_per_file[source_file] = 0
                    exact_chunks_per_file[source_file] += 1
            except Exception as e:
                print(f"[LlamaIndex] Warning: Could not get exact counts: {e}", file=sys.stderr)

            return {
                "success": True,
                "chunks": existing_count,
                "pdfs": len(pdf_paths),
                "new_chunks": 0,
                "chunks_per_file": exact_chunks_per_file
            }
       
        print(
            f"[LlamaIndex] Total documents to index: {len(all_documents)}",
            file=sys.stderr
        )
        print(f"[LlamaIndex] New documents to index: {new_chunks_count}", file=sys.stderr)
        
        # Create Qdrant vector store
        vector_store = QdrantVectorStore(
            client=qdrant_client,
            collection_name=collection_name
        )
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
       
        # Create or update index
        if existing_count > 0 and new_chunks_count > 0:
            # Incremental: add new documents to existing index
            print(f"[LlamaIndex] Adding {new_chunks_count} new documents to existing collection...", file=sys.stderr)
           
            # Load existing index
            try:
                index = VectorStoreIndex.from_vector_store(
                    vector_store=vector_store,
                    embed_model=embed_model
                )
            except Exception:
                # If that fails, create new index with existing vector store
                index = VectorStoreIndex.from_documents(
                    [],
                    storage_context=storage_context,
                    embed_model=embed_model,
                    show_progress=False
                )
           
            # Add new documents
            print(f"[LlamaIndex] Inserting {len(all_documents)} new documents into index...", file=sys.stderr)
            for doc in all_documents:
                index.insert(doc)
            print(f"[LlamaIndex] Inserted {len(all_documents)} documents (they will be chunked into nodes)", file=sys.stderr)
           
        else:
            # Full rebuild or new collection
            print(f"[LlamaIndex] Creating new index with {len(all_documents)} documents...", file=sys.stderr)
           
            # Create index
            index = VectorStoreIndex.from_documents(
                all_documents,
                storage_context=storage_context,
                embed_model=embed_model,
                show_progress=True
            )
           
        # Get final count from collection
        collection_info = qdrant_client.get_collection(collection_name)
        final_count = collection_info.points_count
        
        # Get exact chunk counts per file from Qdrant
        # Query all points and count by source_file
        exact_chunks_per_file = {}
        try:
            # Scroll through all points to count per file
            scroll_result = qdrant_client.scroll(
                collection_name=collection_name,
                limit=10000,  # Adjust if you have more than 10k chunks
                with_payload=True,
                with_vectors=False
            )
            points = scroll_result[0]
            
            # Count chunks per file
            for point in points:
                payload = point.payload or {}
                source_file = payload.get("source_file", "unknown")
                if source_file not in exact_chunks_per_file:
                    exact_chunks_per_file[source_file] = 0
                exact_chunks_per_file[source_file] += 1
            
            print(f"[LlamaIndex] Exact chunk counts per file: {exact_chunks_per_file}", file=sys.stderr)
        except Exception as e:
            print(f"[LlamaIndex] Warning: Could not get exact counts per file: {e}", file=sys.stderr)
            # Fallback to approximate counts from processing
            exact_chunks_per_file = chunks_per_file
        print(f"[LlamaIndex] Qdrant collection now has {final_count} vectors", file=sys.stderr)
        
        # Build metadata for backward compatibility
        # Get ALL metadata from Qdrant collection (not just new nodes from docstore)
        all_metadata = []
        try:
            # Query Qdrant collection directly to get all points with payload
            # This ensures we get the complete picture, especially for incremental indexing
            scroll_result = qdrant_client.scroll(
                collection_name=collection_name,
                limit=10000,  # Adjust if you have more than 10k chunks
                with_payload=True,
                with_vectors=False
            )
            points = scroll_result[0]  # First element is the list of points
            
            if points:
                # Build metadata array from Qdrant results
                for i, point in enumerate(points):
                    payload = point.payload or {}
                    all_metadata.append({
                        "source_file": payload.get("source_file", ""),
                        "chunk_index": i,
                        "chunk_text": payload.get("text", ""),  # Qdrant stores text in payload
                        "section_title": payload.get("section_title", "")
                    })
                print(f"[LlamaIndex] Retrieved {len(all_metadata)} metadata entries from Qdrant collection", file=sys.stderr)
            else:
                # Fallback: try docstore if Qdrant query fails
                print(f"[LlamaIndex] No documents in Qdrant collection, trying docstore...", file=sys.stderr)
                docstore = index.storage_context.docstore
                if hasattr(docstore, 'docs'):
                    try:
                        docs_dict = docstore.docs
                        all_docstore_nodes = list(docs_dict.values())
                        all_docstore_nodes = [n for n in all_docstore_nodes if hasattr(n, 'text') and hasattr(n, 'metadata')]
                        all_docstore_nodes.sort(key=lambda n: n.node_id if hasattr(n, 'node_id') else str(n.id_))
                        for i, node in enumerate(all_docstore_nodes):
                            all_metadata.append({
                                "source_file": node.metadata.get("source_file", ""),
                                "chunk_index": i,
                                "chunk_text": node.text,
                                "section_title": node.metadata.get("section_title", "")
                            })
                        print(f"[LlamaIndex] Retrieved {len(all_metadata)} nodes from docstore", file=sys.stderr)
                    except Exception as e:
                        print(f"[LlamaIndex] Could not use docstore: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[LlamaIndex] Warning: Could not extract metadata from Qdrant: {e}", file=sys.stderr)
            # Final fallback: build from documents (only new ones, so incomplete)
            print(f"[LlamaIndex] Using fallback: building metadata from documents (may be incomplete)", file=sys.stderr)
            for i, doc in enumerate(all_documents):
                all_metadata.append({
                    "source_file": doc.metadata.get("source_file", ""),
                    "chunk_index": i,
                    "chunk_text": doc.text,
                    "section_title": doc.metadata.get("section_title", "")
                })
        
        # Save metadata.json for backward compatibility
        os.makedirs(output_path, exist_ok=True)
        metadata_json_path = os.path.join(output_path, "metadata.json")
        with open(metadata_json_path, "w", encoding="utf-8") as f:
            json.dump(all_metadata, f, ensure_ascii=False, indent=2)
        print(f"[LlamaIndex] Saved metadata.json for backward compatibility", file=sys.stderr)
       
        # Save config
        config = {
            "class_id": class_id or "",
            "class_name": class_name or "",
            "embedding_model": EMBEDDING_MODEL,
            "dimension": 768,  # nomic-embed-text-v1.5 dimension
            "total_chunks": final_count,
            "total_pdfs": len(pdf_paths),
            "chunking_strategy": "SemanticSplitterNodeParser",
            "collection_name": collection_name,
            "qdrant_url": QDRANT_URL or "local",
            "created_at": None  # Will be set by caller if needed
        }
       
        configPath = os.path.join(output_path, "config.json")
        with open(configPath, "w") as f:
            json.dump(config, f, indent=2)
        print(f"[LlamaIndex] Saved config.json", file=sys.stderr)
       
        if existing_count > 0 and new_chunks_count > 0:
            print(
                f"[LlamaIndex] ✅ Incremental indexing completed! "
                f"Added {new_chunks_count} new chunks. Total: {final_count}",
                file=sys.stderr
            )
        else:
            print(f"[LlamaIndex] ✅ Indexing completed successfully! Total chunks: {final_count}", file=sys.stderr)
       
        return {
            "success": True,
            "chunks": final_count,
            "pdfs": len(pdf_paths),
            "new_chunks": new_chunks_count if existing_count > 0 else final_count,
            "chunks_per_file": exact_chunks_per_file  # Exact counts per file from Qdrant
        }
       
    except Exception as e:
        print(f"[LlamaIndex] ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"success": False, "error": str(e)}


def initialize_indexing_resources():
    """
    Initialize embedding model and Qdrant connection at startup.
    This is called when the script is imported/executed to ensure resources are ready immediately.
    """
    global _global_embed_model, _global_qdrant_client
    
    try:
        print(f"[LlamaIndex] 🚀 Initializing indexing resources at startup...", file=sys.stderr)
        
        # Initialize embedding model
        if _global_embed_model is None:
            print(f"[LlamaIndex] Loading embedding model: {EMBEDDING_MODEL}", file=sys.stderr)
            _global_embed_model = _create_embed_model()
            print(f"[LlamaIndex] ✅ Embedding model loaded", file=sys.stderr)
        
        # Initialize Qdrant client
        if _global_qdrant_client is None:
            if QDRANT_URL and QDRANT_URL.strip():
                from urllib.parse import urlparse
                parsed = urlparse(QDRANT_URL.strip())
                host = parsed.hostname or "localhost"
                port = parsed.port or 6333
                print(f"[LlamaIndex] Connecting to Qdrant server at: {host}:{port} (REST only)", file=sys.stderr)
                _global_qdrant_client = QdrantClient(
                    host=host,
                    port=port,
                    api_key=QDRANT_API_KEY,
                    timeout=60,
                    prefer_grpc=False
                )
                print(f"[LlamaIndex] ✅ Connected to Qdrant server", file=sys.stderr)
            else:
                print(f"[LlamaIndex] Connecting to Qdrant local storage at: {QDRANT_PERSIST_DIR}", file=sys.stderr)
                os.makedirs(QDRANT_PERSIST_DIR, exist_ok=True)
                _global_qdrant_client = QdrantClient(path=QDRANT_PERSIST_DIR)
                print(f"[LlamaIndex] ✅ Connected to Qdrant local storage", file=sys.stderr)
        
        print(f"[LlamaIndex] ✅ Indexing resources initialized and ready!", file=sys.stderr)
        sys.stderr.flush()
        
    except Exception as e:
        print(f"[LlamaIndex] ⚠️  Warning: Failed to initialize resources at startup: {e}", file=sys.stderr)
        print(f"[LlamaIndex] Resources will be initialized on first use instead", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        # Don't exit - allow lazy initialization on first use


# Initialize resources immediately when the script is imported/executed
# This ensures the model and Qdrant connection are ready before processing any indexing requests
initialize_indexing_resources()


if __name__ == "__main__":
    # Command-line interface
    if len(sys.argv) < 6:
        print("Usage: python llamaindex-indexing-service.py <output_path> <is_syllabus> <class_id> <class_name> <pdf1> [pdf2] ...", file=sys.stderr)
        sys.exit(1)
   
    output_path = sys.argv[1]
    is_syllabus = sys.argv[2].lower() == "true"
    class_id = sys.argv[3] if sys.argv[3] else None
    class_name = sys.argv[4] if sys.argv[4] else None
    pdf_paths = sys.argv[5:]
   
    result = index_pdfs(pdf_paths, output_path, is_syllabus, class_id, class_name)
    print(json.dumps(result))
