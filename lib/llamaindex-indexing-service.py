"""
LlamaIndex-based indexing service for LearnBot
Replaces custom Python scripts with LlamaIndex abstractions
"""
import sys
import os
import json
import pickle
from pathlib import Path
from typing import List, Optional

# LlamaIndex imports
from llama_index.core import VectorStoreIndex, StorageContext, Document, Settings
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.faiss import FaissVectorStore
from llama_index.readers.file import PDFReader
import faiss

# Use sentence-transformers directly (already installed)
from sentence_transformers import SentenceTransformer

# Configuration
EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2"


def index_pdfs(
    pdf_paths: List[str],
    output_path: str,
    is_syllabus: bool = False,
    class_id: Optional[str] = None,
    class_name: Optional[str] = None
) -> dict:
    """
    Index PDFs using LlamaIndex and save to FAISS
    
    Args:
        pdf_paths: List of PDF file paths to index
        output_path: Directory to save the FAISS index and metadata
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
        # Create a wrapper class that inherits from BaseEmbedding
        from llama_index.core.embeddings import BaseEmbedding
        from pydantic import PrivateAttr
        
        class SentenceTransformerEmbedding(BaseEmbedding):
            # Use PrivateAttr to store the model (not a Pydantic field)
            _model = PrivateAttr()
            
            def __init__(self, model_name: str = EMBEDDING_MODEL, **kwargs):
                super().__init__(**kwargs)
                # Set private attribute after super().__init__
                object.__setattr__(self, '_model', SentenceTransformer(model_name))
            
            def _get_query_embedding(self, query: str):
                """Get embedding for a query string."""
                return self._model.encode(query, convert_to_numpy=True).tolist()
            
            def _get_text_embedding(self, text: str):
                """Get embedding for a text string."""
                return self._model.encode(text, convert_to_numpy=True).tolist()
            
            def _get_text_embeddings(self, texts: List[str]):
                """Get embeddings for multiple text strings."""
                embeddings = self._model.encode(texts, convert_to_numpy=True)
                return [emb.tolist() for emb in embeddings]
            
            async def _aget_query_embedding(self, query: str):
                """Async get embedding for a query string."""
                return self._get_query_embedding(query)
            
            async def _aget_text_embedding(self, text: str):
                """Async get embedding for a text string."""
                return self._get_text_embedding(text)
        
        embed_model = SentenceTransformerEmbedding(EMBEDDING_MODEL)
        Settings.embed_model = embed_model
        
        # Configure chunking based on document type
        if is_syllabus:
            # Larger chunks for syllabus to preserve context
            chunk_size = 2000
            chunk_overlap = 400
        else:
            # Standard chunks for class materials
            chunk_size = 1000
            chunk_overlap = 200
        
        text_splitter = SentenceSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        Settings.node_parser = text_splitter
        
        # Check if index already exists (for incremental indexing)
        indexPath = os.path.join(output_path, "faiss_index.bin")
        metadataPath = os.path.join(output_path, "metadata.pkl")
        hasExistingIndex = os.path.exists(indexPath) and os.path.exists(metadataPath)
        
        # Load existing index if available
        existing_documents = []
        existing_metadata = []
        existing_index = None
        already_processed_files = set()
        
        if hasExistingIndex:
            try:
                print("[LlamaIndex] Loading existing index...", file=sys.stderr)
                # Load FAISS index
                existing_faiss_index = faiss.read_index(indexPath)
                
                # Load metadata
                with open(metadataPath, "rb") as f:
                    existing_metadata = pickle.load(f)
                
                # Get list of already processed files
                already_processed_files = set(
                    meta.get("source_file") for meta in existing_metadata
                )
                print(
                    f"[LlamaIndex] Found {len(existing_metadata)} existing chunks from "
                    f"{len(already_processed_files)} files",
                    file=sys.stderr
                )
                
                # Reconstruct documents from metadata for incremental indexing
                for meta in existing_metadata:
                    doc = Document(
                        text=meta.get("chunk_text", ""),
                        metadata={
                            "source_file": meta.get("source_file"),
                            "chunk_index": meta.get("chunk_index"),
                            "section_title": meta.get("section_title", "")
                        }
                    )
                    existing_documents.append(doc)
                
                existing_index = existing_faiss_index
                
            except Exception as e:
                print(f"[LlamaIndex] Warning: Could not load existing index: {e}", file=sys.stderr)
                existing_index = None
                existing_metadata = []
                already_processed_files = set()
        
        # Load and process PDFs
        all_documents = existing_documents.copy()
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
        if new_chunks_count == 0 and hasExistingIndex:
            print("[LlamaIndex] No new PDFs to index. Using existing index.", file=sys.stderr)
            return {
                "success": True,
                "chunks": len(existing_metadata),
                "pdfs": len(pdf_paths),
                "new_chunks": 0
            }
        
        print(
            f"[LlamaIndex] Total documents: {len(all_documents)} "
            f"(including {len(existing_documents)} existing)",
            file=sys.stderr
        )
        print(f"[LlamaIndex] New documents to index: {new_chunks_count}", file=sys.stderr)
        
        # Create or update FAISS vector store
        os.makedirs(output_path, exist_ok=True)
        
        if hasExistingIndex and existing_index is not None and new_chunks_count > 0:
            # Incremental: add new documents to existing index
            print(f"[LlamaIndex] Adding {new_chunks_count} new documents to existing index...", file=sys.stderr)
            
            # Keep reference to the original FAISS index
            # FaissVectorStore modifies it in-place, so we can use the same reference
            faiss_index = existing_index
            dimension = existing_index.d
            
            # Create vector store from existing FAISS index
            vector_store = FaissVectorStore(faiss_index=faiss_index)
            storage_context = StorageContext.from_defaults(vector_store=vector_store)
            
            # Load existing index first
            try:
                index = VectorStoreIndex.from_vector_store(
                    vector_store=vector_store,
                    embed_model=embed_model
                )
            except Exception:
                # If that fails, create new index with existing vector store
                index = VectorStoreIndex.from_documents(
                    [],  # Empty - we'll add documents manually
                    storage_context=storage_context,
                    embed_model=embed_model,
                    show_progress=False
                )
            
            # Add only new documents
            new_docs = all_documents[len(existing_documents):]
            print(f"[LlamaIndex] Inserting {len(new_docs)} new documents into index...", file=sys.stderr)
            for doc in new_docs:
                index.insert(doc)
            print(f"[LlamaIndex] Inserted {len(new_docs)} documents (they will be chunked into nodes)", file=sys.stderr)
            
            # The faiss_index reference is updated in-place by FaissVectorStore
            # No need to retrieve it - we already have the reference
            
        else:
            # Full rebuild
            print(f"[LlamaIndex] Creating new index with {len(all_documents)} documents...", file=sys.stderr)
            
            # Create new FAISS vector store
            dimension = 768  # all-mpnet-base-v2 dimension
            faiss_index = faiss.IndexFlatL2(dimension)
            vector_store = FaissVectorStore(faiss_index=faiss_index)
            storage_context = StorageContext.from_defaults(vector_store=vector_store)
            
            # Create index
            index = VectorStoreIndex.from_documents(
                all_documents,
                storage_context=storage_context,
                embed_model=embed_model,
                show_progress=True
            )
            
            # The faiss_index was created above and is modified in-place by FaissVectorStore
            # No need to retrieve it - we already have the reference
        
        # Save FAISS index
        indexPath = os.path.join(output_path, "faiss_index.bin")
        faiss.write_index(faiss_index, indexPath)
        print(f"[LlamaIndex] Saved FAISS index with {faiss_index.ntotal} vectors", file=sys.stderr)
        
        # Build metadata from index nodes (LlamaIndex chunks documents into nodes)
        # IMPORTANT: For incremental indexing, we need to merge existing metadata with new nodes
        all_metadata = []
        
        # If we're doing incremental indexing, start with existing metadata
        if hasExistingIndex and existing_metadata:
            all_metadata = existing_metadata.copy()
            print(f"[LlamaIndex] Starting with {len(existing_metadata)} existing metadata entries", file=sys.stderr)
        
        try:
            # For incremental indexing, the docstore only contains NEW nodes
            # We need to get ALL nodes from the index to build complete metadata
            docstore = index.storage_context.docstore
            new_nodes = []
            
            # Method 1: Try using the docs property (works for SimpleDocumentStore)
            if hasattr(docstore, 'docs'):
                try:
                    docs_dict = docstore.docs
                    all_docstore_nodes = list(docs_dict.values())
                    
                    # Filter out any non-node objects (documents vs nodes)
                    all_docstore_nodes = [n for n in all_docstore_nodes if hasattr(n, 'text') and hasattr(n, 'metadata')]
                    
                    if hasExistingIndex and existing_metadata:
                        # For incremental: docstore only has NEW nodes that were just added
                        # Use ALL nodes from docstore since they're all new
                        new_nodes = all_docstore_nodes
                        print(f"[LlamaIndex] Found {len(new_nodes)} new nodes in docstore (incremental mode - using all)", file=sys.stderr)
                    else:
                        # Full rebuild - use all nodes
                        new_nodes = all_docstore_nodes
                        print(f"[LlamaIndex] Retrieved {len(new_nodes)} total nodes via docs property", file=sys.stderr)
                except Exception as e:
                    print(f"[LlamaIndex] Could not use docs property: {e}", file=sys.stderr)
            
            # Method 2: Try get_all_node_hashes (for newer LlamaIndex versions)
            if not new_nodes and hasattr(docstore, 'get_all_node_hashes'):
                try:
                    node_hashes = docstore.get_all_node_hashes()
                    for node_hash in node_hashes:
                        try:
                            node = docstore.get_node(node_hash)
                            if node:
                                new_nodes.append(node)
                        except Exception:
                            continue
                    print(f"[LlamaIndex] Retrieved {len(new_nodes)} nodes via get_all_node_hashes", file=sys.stderr)
                except Exception as e:
                    print(f"[LlamaIndex] Could not use get_all_node_hashes: {e}", file=sys.stderr)
            
            # Method 3: Get nodes via ref_doc_ids from vector store
            if not new_nodes:
                try:
                    vector_store = index.storage_context.vector_store
                    if hasattr(vector_store, 'get_all_ref_doc_ids'):
                        ref_doc_ids = vector_store.get_all_ref_doc_ids()
                        for ref_doc_id in ref_doc_ids:
                            try:
                                # Get node refs for this document
                                node_refs = vector_store.get(ref_doc_id)
                                if node_refs:
                                    for node_ref in node_refs:
                                        try:
                                            node = docstore.get_node(node_ref.node_id)
                                            if node:
                                                new_nodes.append(node)
                                        except Exception:
                                            continue
                            except Exception:
                                continue
                        print(f"[LlamaIndex] Retrieved {len(new_nodes)} nodes via ref_doc_ids", file=sys.stderr)
                except Exception as e:
                    print(f"[LlamaIndex] Could not use ref_doc_ids: {e}", file=sys.stderr)
            
            # Add new nodes to metadata
            if new_nodes and len(new_nodes) > 0:
                # Sort nodes by their node_id to ensure consistent ordering
                new_nodes.sort(key=lambda n: n.node_id if hasattr(n, 'node_id') else str(n.id_))
                
                # Add new nodes to metadata
                start_index = len(all_metadata)
                for i, node in enumerate(new_nodes):
                    all_metadata.append({
                        "source_file": node.metadata.get("source_file", ""),
                        "chunk_index": start_index + i,
                        "chunk_text": node.text,
                        "section_title": node.metadata.get("section_title", "")
                    })
                print(f"[LlamaIndex] Added {len(new_nodes)} new nodes to metadata (total: {len(all_metadata)})", file=sys.stderr)
            elif not hasExistingIndex:
                # Only raise error if this is a full rebuild (no existing metadata)
                raise Exception("No nodes found using any method")
            else:
                # For incremental indexing, if we can't get nodes from docstore,
                # we need to reconstruct metadata from the documents we processed
                # But documents get chunked into multiple nodes, so we need to chunk them ourselves
                print(f"[LlamaIndex] No nodes extracted from docstore, reconstructing from processed documents", file=sys.stderr)
                start_index = len(all_metadata)
                new_docs = all_documents[len(existing_documents):] if len(all_documents) > len(existing_documents) else []
                
                # Get the actual chunk count from FAISS index
                total_vectors = faiss_index.ntotal
                expected_new_chunks = total_vectors - len(existing_metadata) if hasExistingIndex else total_vectors
                print(f"[LlamaIndex] FAISS index has {total_vectors} total vectors, {len(existing_metadata)} existing, {expected_new_chunks} new chunks expected", file=sys.stderr)
                
                # Chunk the new documents using the same chunking strategy
                # This will give us the actual nodes that were created
                chunked_nodes = []
                for doc in new_docs:
                    # Use the same text splitter that was configured
                    doc_nodes = text_splitter.get_nodes_from_documents([doc])
                    for node in doc_nodes:
                        node.metadata["source_file"] = doc.metadata.get("source_file", "")
                        node.metadata["section_title"] = doc.metadata.get("section_title", "")
                    chunked_nodes.extend(doc_nodes)
                
                # Add chunked nodes to metadata
                for i, node in enumerate(chunked_nodes):
                    all_metadata.append({
                        "source_file": node.metadata.get("source_file", ""),
                        "chunk_index": start_index + i,
                        "chunk_text": node.text,
                        "section_title": node.metadata.get("section_title", "")
                    })
                print(f"[LlamaIndex] Added {len(chunked_nodes)} chunked nodes to metadata (total: {len(all_metadata)})", file=sys.stderr)
                print(f"[LlamaIndex] Note: Expected {expected_new_chunks} chunks, created {len(chunked_nodes)} metadata entries", file=sys.stderr)
                
        except Exception as e:
            print(f"[LlamaIndex] Warning: Could not extract nodes from index: {e}", file=sys.stderr)
            print(f"[LlamaIndex] Falling back to document-based metadata", file=sys.stderr)
            # Fallback: build metadata from documents
            # If we have existing metadata, only add new documents
            if hasExistingIndex and existing_metadata:
                # all_metadata already has existing_metadata, just add new documents
                start_index = len(all_metadata)
                new_docs = all_documents[len(existing_documents):] if len(all_documents) > len(existing_documents) else []
                for i, doc in enumerate(new_docs):
                    all_metadata.append({
                        "source_file": doc.metadata.get("source_file", ""),
                        "chunk_index": start_index + i,
                        "chunk_text": doc.text,
                        "section_title": doc.metadata.get("section_title", "")
                    })
                print(f"[LlamaIndex] Added {len(new_docs)} new documents to metadata via fallback (total: {len(all_metadata)})", file=sys.stderr)
            else:
                # Full rebuild - use all documents
                for i, doc in enumerate(all_documents):
                    all_metadata.append({
                        "source_file": doc.metadata.get("source_file", ""),
                        "chunk_index": i,
                        "chunk_text": doc.text,
                        "section_title": doc.metadata.get("section_title", "")
                    })
        
        # Save metadata
        with open(os.path.join(output_path, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(all_metadata, f, ensure_ascii=False, indent=2)
        print(f"[LlamaIndex] Saved metadata.json", file=sys.stderr)
        
        with open(metadataPath, "wb") as f:
            pickle.dump(all_metadata, f)
        print(f"[LlamaIndex] Saved metadata.pkl", file=sys.stderr)
        
        # Save config
        config = {
            "class_id": class_id or "",
            "class_name": class_name or "",
            "embedding_model": EMBEDDING_MODEL,
            "dimension": int(faiss_index.d),
            "total_chunks": len(all_documents),
            "total_pdfs": len(pdf_paths),
            "chunk_size": chunk_size,
            "overlap": chunk_overlap,
            "created_at": None  # Will be set by caller if needed
        }
        
        configPath = os.path.join(output_path, "config.json")
        with open(configPath, "w") as f:
            json.dump(config, f, indent=2)
        print(f"[LlamaIndex] Saved config.json", file=sys.stderr)
        
        if hasExistingIndex and new_chunks_count > 0:
            print(
                f"[LlamaIndex] ✅ Incremental indexing completed! "
                f"Added {new_chunks_count} new chunks.",
                file=sys.stderr
            )
        else:
            print(f"[LlamaIndex] ✅ Indexing completed successfully!", file=sys.stderr)
        
        return {
            "success": True,
            "chunks": len(all_documents),
            "pdfs": len(pdf_paths),
            "new_chunks": new_chunks_count if hasExistingIndex else len(all_documents)
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

