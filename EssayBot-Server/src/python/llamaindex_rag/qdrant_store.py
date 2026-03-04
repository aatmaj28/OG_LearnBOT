"""
File: qdrant_store.py
Qdrant vector store integration for RAG pipeline
"""

import logging
import uuid
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
    SearchRequest, SearchParams,
    OptimizersConfigDiff, HnswConfigDiff
)

logger = logging.getLogger(__name__)


@dataclass
class QdrantConfig:
    """Qdrant configuration"""
    host: str = "localhost"
    port: int = 6333
    collection_name: str = "essay_bot_materials"
    embedding_dim: int = 1024  # BGE-large-en
    use_grpc: bool = False
    api_key: Optional[str] = None

    @classmethod
    def from_env(cls):
        import os
        return cls(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333)),
            collection_name=os.getenv(
                "QDRANT_COLLECTION", "essay_bot_materials"),
            api_key=os.getenv("QDRANT_API_KEY"),
            use_grpc=os.getenv("QDRANT_USE_GRPC", "false").lower() == "true"
        )


class QdrantVectorStore:
    """Qdrant vector store with optimizations for academic content"""

    def __init__(self, config: Optional[QdrantConfig] = None, embedding_model_name: Optional[str] = None):
        self.config = config or QdrantConfig.from_env()
        self.embedding_model_name = embedding_model_name or "BAAI/bge-large-en"

        # Initialize client
        self.client = QdrantClient(
            host=self.config.host,
            port=self.config.port,
            api_key=self.config.api_key,
            grpc_port=6334 if self.config.use_grpc else None,
        )

        self._setup_collection()

    def _extract_model_version(self, model_name: str) -> str:
        """
        Extract version from model name.

        Examples:
            "BAAI/bge-large-en-v1.5" -> "1.5"
            "BAAI/bge-large-en" -> "1.0"
            "sentence-transformers/all-MiniLM-L6-v2" -> "2"
        """
        # Try to extract version pattern (v1.5, v2, etc.)
        version_match = re.search(r'v(\d+(?:\.\d+)?)', model_name)
        if version_match:
            return version_match.group(1)

        # Default version if not found
        return "1.0"

    def _setup_collection(self):
        """Create collection if it doesn't exist"""
        collections = self.client.get_collections().collections
        exists = any(
            c.name == self.config.collection_name for c in collections)

        if not exists:
            logger.info(
                f"Creating Qdrant collection: {self.config.collection_name}")
            self.client.create_collection(
                collection_name=self.config.collection_name,
                vectors_config=VectorParams(
                    size=self.config.embedding_dim,
                    distance=Distance.COSINE,
                ),
                optimizers_config=OptimizersConfigDiff(
                    indexing_threshold=10000,  # Optimized for your ~12 nodes per doc
                    memmap_threshold=50000,
                ),
                hnsw_config=HnswConfigDiff(
                    m=16,
                    ef_construct=100,  # Lower for small documents
                    full_scan_threshold=1000,  # Use full scan for small result sets
                )
            )
            logger.info("Collection created successfully")

    def index_nodes(self,
                    nodes: List[Dict[str, Any]],
                    embeddings: List[np.ndarray],
                    professor_username: str,
                    course_id: str,
                    assignment_title: str,
                    index_type: str = "course_content") -> Dict[str, Any]:
        """
        Index nodes with embeddings.

        Automatically adds drift detection metadata:
        - embedding_model: Model used for embeddings
        - embedding_version: Extracted version (e.g., "1.5")
        - indexed_at: ISO timestamp
        """

        # Extract version for drift detection
        model_version = self._extract_model_version(self.embedding_model_name)
        current_timestamp = datetime.utcnow().isoformat()

        points = []
        for i, (node, embedding) in enumerate(zip(nodes, embeddings)):
            point_id = str(uuid.uuid4())

            # Build comprehensive payload with drift detection metadata
            payload = {
                "text": node["text"],
                "professor_username": professor_username,
                "course_id": course_id,
                "assignment_title": assignment_title,
                "index_type": index_type,
                "node_id": node.get("node_id", f"node_{i}"),
                "metadata": node.get("metadata", {}),

                # Add text statistics for smart retrieval
                "text_length": len(node["text"]),
                "word_count": len(node["text"].split()),

                # ✅ DRIFT DETECTION METADATA
                "embedding_model": self.embedding_model_name,
                "embedding_version": model_version,
                "indexed_at": current_timestamp,
            }

            # Add node relationships if they exist
            if "start_char_idx" in node:
                payload["start_char_idx"] = node["start_char_idx"]
            if "end_char_idx" in node:
                payload["end_char_idx"] = node["end_char_idx"]

            points.append(PointStruct(
                id=point_id,
                vector=embedding.tolist(),
                payload=payload
            ))

        # Batch upload with progress tracking
        batch_size = 100
        total_uploaded = 0

        for i in range(0, len(points), batch_size):
            batch = points[i:i+batch_size]
            self.client.upsert(
                collection_name=self.config.collection_name,
                points=batch,
                wait=True  # Ensure consistency
            )
            total_uploaded += len(batch)
            logger.info(f"Uploaded {total_uploaded}/{len(points)} points")

        return {
            "status": "success",
            "total_points": len(points),
            "collection": self.config.collection_name,
            "index_type": index_type,
            "embedding_model": self.embedding_model_name,
            "embedding_version": model_version,
            "indexed_at": current_timestamp
        }

    def search(self,
               query_vector: np.ndarray,
               professor_username: str,
               course_id: str,
               assignment_title: str,
               index_type: Optional[str] = None,
               top_k: int = 10,
               score_threshold: float = 0.0) -> List[Dict[str, Any]]:
        """Search with metadata filtering"""

        # Build filter
        must_conditions = [
            FieldCondition(key="professor_username",
                           match=MatchValue(value=professor_username)),
            FieldCondition(key="course_id", match=MatchValue(value=course_id)),
            FieldCondition(key="assignment_title",
                           match=MatchValue(value=assignment_title))
        ]

        if index_type:
            must_conditions.append(
                FieldCondition(key="index_type",
                               match=MatchValue(value=index_type))
            )

        # Search
        results = self.client.search(
            collection_name=self.config.collection_name,
            query_vector=query_vector.tolist(),
            query_filter=Filter(must=must_conditions),
            limit=top_k,
            score_threshold=score_threshold,
            with_payload=True,
            search_params=SearchParams(
                hnsw_ef=128,  # Higher for better recall
                exact=False   # Use HNSW index
            )
        )

        # Format results
        formatted_results = []
        for hit in results:
            formatted_results.append({
                "id": hit.id,
                "score": hit.score,
                "text": hit.payload.get("text", ""),
                "metadata": hit.payload.get("metadata", {}),
                "node_id": hit.payload.get("node_id", ""),
                "index_type": hit.payload.get("index_type", "")
            })

        return formatted_results

    def delete_assignment_data(self,
                               professor_username: str,
                               course_id: str,
                               assignment_title: str,
                               index_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Delete vectors for an assignment, optionally filtered by index_type.

        Args:
            professor_username: Professor's username
            course_id: Course identifier
            assignment_title: Assignment identifier
            index_type: Optional - only delete vectors of this type 
                       ("course_content" or "supporting_docs")
                       If None, deletes all vectors for the assignment

        Returns:
            Dictionary with deletion statistics
        """
        # Build filter conditions
        must_conditions = [
            FieldCondition(key="professor_username",
                           match=MatchValue(value=professor_username)),
            FieldCondition(key="course_id",
                           match=MatchValue(value=course_id)),
            FieldCondition(key="assignment_title",
                           match=MatchValue(value=assignment_title))
        ]

        # Add index_type filter if specified
        if index_type:
            must_conditions.append(
                FieldCondition(key="index_type",
                               match=MatchValue(value=index_type))
            )

        try:
            # Perform deletion
            delete_filter = Filter(must=must_conditions)
            self.client.delete(
                collection_name=self.config.collection_name,
                points_selector=delete_filter
            )

            scope = f"{index_type} vectors" if index_type else "all vectors"
            logger.info(
                f"Successfully deleted {scope} for assignment {assignment_title}"
            )

            return {
                "success": True,
                "professor_username": professor_username,
                "course_id": course_id,
                "assignment_title": assignment_title,
                "index_type_deleted": index_type or "all",
                "message": f"Deleted {scope}"
            }

        except Exception as e:
            logger.error(f"Failed to delete vectors: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "professor_username": professor_username,
                "course_id": course_id,
                "assignment_title": assignment_title,
                "index_type_deleted": index_type or "all"
            }

    def check_model_compatibility(self,
                                  professor_username: str,
                                  course_id: str,
                                  assignment_title: str) -> Dict[str, Any]:
        """
        Check if indexed vectors are compatible with current embedding model.

        Returns information about:
        - Current model vs indexed model
        - Version compatibility
        - Whether re-indexing is needed

        Args:
            professor_username: Professor's username
            course_id: Course identifier
            assignment_title: Assignment identifier

        Returns:
            Dictionary with compatibility information
        """
        try:
            # Get sample vectors to check model metadata
            results = self.client.scroll(
                collection_name=self.config.collection_name,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(key="professor_username",
                                       match=MatchValue(value=professor_username)),
                        FieldCondition(key="course_id",
                                       match=MatchValue(value=course_id)),
                        FieldCondition(key="assignment_title",
                                       match=MatchValue(value=assignment_title))
                    ]
                ),
                limit=1,
                with_payload=True
            )

            if not results[0]:
                return {
                    "compatible": None,
                    "message": "No vectors found for this assignment",
                    "action_needed": "index"
                }

            # Extract model info from first vector
            first_vector = results[0][0]
            indexed_model = first_vector.payload.get(
                "embedding_model", "unknown")
            indexed_version = first_vector.payload.get(
                "embedding_version", "unknown")
            indexed_at = first_vector.payload.get("indexed_at", "unknown")

            # Compare with current model
            current_model = self.embedding_model_name
            current_version = self._extract_model_version(current_model)

            # Check compatibility
            models_match = indexed_model == current_model
            versions_match = indexed_version == current_version
            compatible = models_match and versions_match

            result = {
                "compatible": compatible,
                "current_model": current_model,
                "current_version": current_version,
                "indexed_model": indexed_model,
                "indexed_version": indexed_version,
                "indexed_at": indexed_at,
                "models_match": models_match,
                "versions_match": versions_match
            }

            # Add recommendation
            if not compatible:
                if not models_match:
                    result["message"] = f"⚠️ Model mismatch: indexed with {indexed_model}, but using {current_model}"
                    result["action_needed"] = "re-index"
                    result["severity"] = "critical"
                elif not versions_match:
                    result["message"] = f"⚠️ Version mismatch: indexed with v{indexed_version}, but using v{current_version}"
                    result["action_needed"] = "re-index recommended"
                    result["severity"] = "warning"
            else:
                result["message"] = "✅ Models compatible"
                result["action_needed"] = "none"
                result["severity"] = "info"

            return result

        except Exception as e:
            logger.error(f"Failed to check model compatibility: {str(e)}")
            return {
                "compatible": None,
                "error": str(e),
                "message": "Failed to check compatibility",
                "action_needed": "unknown"
            }
