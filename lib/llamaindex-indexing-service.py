"""
LlamaIndex-based indexing service for LearnBot
Uses ChromaDB for vector storage (replaces FAISS)
"""
import sys
import os
import json
from pathlib import Path
from typing import List, Optional
 
# LlamaIndex imports
from llama_index.core import VectorStoreIndex, StorageContext, Document, Settings
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.readers.file import PDFReader
import chromadb
from chromadb.config import Settings as ChromaSettings
 
# Use sentence-transformers directly (already installed)
from sentence_transformers import SentenceTransformer
 
# Configuration
EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2"
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vector-stores", "chroma")
 
# ChromaDB Server Mode Configuration
# Set CHROMA_SERVER_URL environment variable to use server mode (e.g., "http://localhost:8000")
# If not set, falls back to embedded mode
CHROMA_SERVER_URL = os.getenv("CHROMA_SERVER_URL", None)
CHROMA_SERVER_AUTH_TOKEN = os.getenv("CHROMA_SERVER_AUTH_TOKEN", "test-token")  # Default token for local dev
 
 
def get_collection_name(output_path: str) -> str:
    """
    Generate a collection name from the output path.
    Uses the folder name as the collection name.
    """
    # Get the folder name from the path
    folder_name = os.path.basename(os.path.normpath(output_path))
    # Sanitize for ChromaDB (replace invalid chars)
    collection_name = folder_name.replace("/", "_").replace("\\", "_").replace(" ", "_")
    return collection_name
 
 
def index_pdfs(
    pdf_paths: List[str],
    output_path: str,
    is_syllabus: bool = False,
    class_id: Optional[str] = None,
    class_name: Optional[str] = None
) -> dict:
    """
    Index PDFs using LlamaIndex and save to ChromaDB
   
    Args:
        pdf_paths: List of PDF file paths to index
        output_path: Directory path (used to generate collection name)
        is_syllabus: Whether these are syllabus documents (affects chunking)
        class_id: Optional class ID for metadata
        class_name: Optional class name for metadata
   
    Returns:
        Dictionary with success status and statistics
    """
    try:
        print(f"[LlamaIndex] Processing {len(pdf_paths)} PDFs", file=sys.stderr)
        print(f"[LlamaIndex] Output path: {output_path}", file=sys.stderr)
        print(f"[LlamaIndex] Is syllabus: {is_syllabus}", file=sys.stderr)
       
        # Configure embedding model - use sentence-transformers directly
        from llama_index.core.embeddings import BaseEmbedding
        from pydantic import PrivateAttr
       
        class SentenceTransformerEmbedding(BaseEmbedding):
            _model = PrivateAttr()
           
            def __init__(self, model_name: str = EMBEDDING_MODEL, **kwargs):
                super().__init__(**kwargs)
                object.__setattr__(self, '_model', SentenceTransformer(model_name))
           
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
       
        embed_model = SentenceTransformerEmbedding(EMBEDDING_MODEL)
        Settings.embed_model = embed_model
       
        # Configure chunking based on document type
        if is_syllabus:
            chunk_size = 2000
            chunk_overlap = 400
        else:
            chunk_size = 1000
            chunk_overlap = 200
       
        text_splitter = SentenceSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        Settings.node_parser = text_splitter
       
        # Get collection name from output path
        collection_name = get_collection_name(output_path)
        print(f"[LlamaIndex] Using ChromaDB collection: {collection_name}", file=sys.stderr)
       
        # Initialize ChromaDB client (server mode or embedded mode)
        if CHROMA_SERVER_URL:
            # Server mode: Connect via HTTP
            print(f"[LlamaIndex] Connecting to ChromaDB server at: {CHROMA_SERVER_URL}", file=sys.stderr)
            # Parse URL to extract host and port
            url_clean = CHROMA_SERVER_URL.replace("http://", "").replace("https://", "")
            if ":" in url_clean:
                host, port_str = url_clean.split(":", 1)
                port = int(port_str.split("/")[0])  # Handle trailing slashes
            else:
                host = url_clean.split("/")[0]
                port = 8000
           
            # Create settings with token authentication
            if CHROMA_SERVER_AUTH_TOKEN and CHROMA_SERVER_AUTH_TOKEN != "test-token":
                auth_token = CHROMA_SERVER_AUTH_TOKEN
            else:
                auth_token = "test-token"
           
            print(f"[LlamaIndex] 🔐 Attempting token authentication with token: {'***' + auth_token[-4:] if len(auth_token) > 4 else '***'}", file=sys.stderr)
           
            # Try multiple authentication methods
            chroma_client = None
            auth_method_used = None
           
            # Method 1: Try using Settings with token auth provider
            try:
                settings = ChromaSettings(
                    anonymized_telemetry=False,
                    chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                    chroma_client_auth_credentials=auth_token
                )
                chroma_client = chromadb.HttpClient(host=host, port=port, settings=settings)
                auth_method_used = "TokenAuthClientProvider (Settings)"
                print(f"[LlamaIndex] ✅ Connected using {auth_method_used}", file=sys.stderr)
            except Exception as e1:
                print(f"[LlamaIndex] ⚠️  Method 1 failed: {str(e1)[:100]}", file=sys.stderr)
               
                # Method 2: Try with headers parameter (if supported)
                try:
                    settings = ChromaSettings(anonymized_telemetry=False)
                    chroma_client = chromadb.HttpClient(
                        host=host,
                        port=port,
                        settings=settings,
                        headers={"Authorization": f"Bearer {auth_token}"}
                    )
                    auth_method_used = "Bearer token (headers)"
                    print(f"[LlamaIndex] ✅ Connected using {auth_method_used}", file=sys.stderr)
                except (TypeError, Exception) as e2:
                    print(f"[LlamaIndex] ⚠️  Method 2 failed: {str(e2)[:100]}", file=sys.stderr)
                   
                    # Method 3: Try without auth (fallback)
                    try:
                        settings = ChromaSettings(anonymized_telemetry=False)
                        chroma_client = chromadb.HttpClient(host=host, port=port, settings=settings)
                        auth_method_used = "No authentication (fallback)"
                        print(f"[LlamaIndex] ⚠️  Connected without authentication (server may reject requests)", file=sys.stderr)
                    except Exception as e3:
                        raise Exception(f"All connection methods failed. Last error: {str(e3)}")
       
            if chroma_client is None:
                raise Exception("Failed to create ChromaDB client")
           
            print(f"[LlamaIndex] 🔐 Authentication method used: {auth_method_used}", file=sys.stderr)
        else:
            # Embedded mode: Use local persistent storage
            print(f"[LlamaIndex] Using ChromaDB embedded mode at: {CHROMA_PERSIST_DIR}", file=sys.stderr)
            os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
            chroma_client = chromadb.PersistentClient(
                path=CHROMA_PERSIST_DIR,
                settings=ChromaSettings(anonymized_telemetry=False)
            )
               
        # Get or create collection
        try:
            collection = chroma_client.get_collection(name=collection_name)
            print(f"[LlamaIndex] Found existing ChromaDB collection: {collection_name}", file=sys.stderr)
            existing_count = collection.count()
            print(f"[LlamaIndex] Existing collection has {existing_count} vectors", file=sys.stderr)
        except Exception:
            collection = chroma_client.create_collection(name=collection_name)
            print(f"[LlamaIndex] Created new ChromaDB collection: {collection_name}", file=sys.stderr)
            existing_count = 0
       
        # Check which files are already indexed (by checking metadata in collection)
        already_processed_files = set()
        if existing_count > 0:
            try:
                # Get all existing documents to check source files
                existing_results = collection.get(include=["metadatas"])
                if existing_results and existing_results.get("metadatas"):
                    for metadata in existing_results["metadatas"]:
                        if metadata and "source_file" in metadata:
                            already_processed_files.add(metadata["source_file"])
                print(
                    f"[LlamaIndex] Found {len(already_processed_files)} already processed files",
                    file=sys.stderr
                )
               
                # If we have chunks but no PDFs to process, clear all chunks
                # This handles the case where PDFs were deleted but chunks remain
                if len(pdf_paths) == 0 and existing_count > 0:
                    print(f"[LlamaIndex] No PDFs to index but {existing_count} chunks exist. Clearing all chunks...", file=sys.stderr)
                    # Get all IDs and delete everything (IDs are always returned)
                    all_ids = existing_results.get("ids", [])
                    if all_ids:
                        collection.delete(ids=all_ids)
                        print(f"[LlamaIndex] Cleared all {len(all_ids)} chunks", file=sys.stderr)
                    else:
                        # If no IDs in results, get them separately
                        all_results = collection.get()
                        all_ids = all_results.get("ids", [])
                        if all_ids:
                            collection.delete(ids=all_ids)
                            print(f"[LlamaIndex] Cleared all {len(all_ids)} chunks", file=sys.stderr)
                    # Update config
                    config = {
                        "class_id": class_id or "",
                        "class_name": class_name or "",
                        "embedding_model": EMBEDDING_MODEL,
                        "dimension": 768,
                        "total_chunks": 0,
                        "total_pdfs": 0,
                        "chunk_size": chunk_size,
                        "overlap": chunk_overlap,
                        "collection_name": collection_name,
                        "chroma_persist_dir": CHROMA_PERSIST_DIR,
                        "created_at": None
                    }
                    configPath = os.path.join(output_path, "config.json")
                    with open(configPath, "w") as f:
                        json.dump(config, f, indent=2)
                    # Clear metadata.json
                    metadata_json_path = os.path.join(output_path, "metadata.json")
                    with open(metadata_json_path, "w", encoding="utf-8") as f:
                        json.dump([], f, ensure_ascii=False, indent=2)
                    return {
                        "success": True,
                        "chunks": 0,
                        "pdfs": 0,
                        "new_chunks": 0
                    }
            except Exception as e:
                print(f"[LlamaIndex] Warning: Could not check existing files: {e}", file=sys.stderr)
       
        # Load and process PDFs
        all_documents = []
        new_chunks_count = 0
        pdf_reader = PDFReader()
       
        for pdf_path in pdf_paths:
            try:
                pdf_filename = os.path.basename(pdf_path)
               
                # Skip if already processed (incremental mode)
                if pdf_filename in already_processed_files:
                    print(f"[LlamaIndex] Skipping (already indexed): {pdf_filename}", file=sys.stderr)
                    continue
               
                print(f"[LlamaIndex] Processing NEW file: {pdf_filename}", file=sys.stderr)
               
                # Load PDF using LlamaIndex reader
                documents = pdf_reader.load_data(file=Path(pdf_path))
               
                # Add metadata to documents
                for doc in documents:
                    doc.metadata["source_file"] = pdf_filename
                    doc.metadata["section_title"] = f"Section from {pdf_filename}"
                    if class_id:
                        doc.metadata["class_id"] = class_id
                    if class_name:
                        doc.metadata["class_name"] = class_name
                    if is_syllabus:
                        doc.metadata["is_syllabus"] = "true"
               
                all_documents.extend(documents)
                new_chunks_count += len(documents)
                print(f"[LlamaIndex] Extracted {len(documents)} NEW chunks from {pdf_filename}", file=sys.stderr)
               
            except Exception as e:
                print(f"[LlamaIndex] Error processing {pdf_path}: {e}", file=sys.stderr)
                continue
       
        if len(all_documents) == 0:
            print("[LlamaIndex] ERROR: No documents extracted!", file=sys.stderr)
            return {"success": False, "error": "No documents extracted"}
       
        # Check if we need to do any indexing
        if new_chunks_count == 0 and existing_count > 0:
            print("[LlamaIndex] No new PDFs to index. Using existing collection.", file=sys.stderr)
            return {
                "success": True,
                "chunks": existing_count,
                "pdfs": len(pdf_paths),
                "new_chunks": 0
            }
       
        print(
            f"[LlamaIndex] Total documents to index: {len(all_documents)}",
            file=sys.stderr
        )
        print(f"[LlamaIndex] New documents to index: {new_chunks_count}", file=sys.stderr)
       
        # Create ChromaDB vector store
        vector_store = ChromaVectorStore(chroma_collection=collection)
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
        final_count = collection.count()
        print(f"[LlamaIndex] ChromaDB collection now has {final_count} vectors", file=sys.stderr)
       
        # Build metadata for backward compatibility
        # Get ALL metadata from ChromaDB collection (not just new nodes from docstore)
        all_metadata = []
        try:
            # Query ChromaDB collection directly to get all documents with metadata
            # This ensures we get the complete picture, especially for incremental indexing
            results = collection.get(include=["metadatas", "documents"])
            if results and results.get("documents"):
                documents_list = results["documents"] or []
                metadatas_list = results["metadatas"] or []
               
                # Build metadata array from ChromaDB results
                for i, (doc_text, meta) in enumerate(zip(documents_list, metadatas_list)):
                    all_metadata.append({
                        "source_file": meta.get("source_file", "") if meta else "",
                        "chunk_index": i,
                        "chunk_text": doc_text or "",
                        "section_title": meta.get("section_title", "") if meta else ""
                    })
                print(f"[LlamaIndex] Retrieved {len(all_metadata)} metadata entries from ChromaDB collection", file=sys.stderr)
            else:
                # Fallback: try docstore if ChromaDB query fails
                print(f"[LlamaIndex] No documents in ChromaDB collection, trying docstore...", file=sys.stderr)
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
            print(f"[LlamaIndex] Warning: Could not extract metadata from ChromaDB: {e}", file=sys.stderr)
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
            "dimension": 768,  # all-mpnet-base-v2 dimension
            "total_chunks": final_count,
            "total_pdfs": len(pdf_paths),
            "chunk_size": chunk_size,
            "overlap": chunk_overlap,
            "collection_name": collection_name,
            "chroma_persist_dir": CHROMA_PERSIST_DIR,
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
            "new_chunks": new_chunks_count if existing_count > 0 else final_count
        }
       
    except Exception as e:
        print(f"[LlamaIndex] ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"success": False, "error": str(e)}
 
 
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
 
 