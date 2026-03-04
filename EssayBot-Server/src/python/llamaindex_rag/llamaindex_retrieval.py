"""
File: llamaindex_retrieval.py
Simplified Retrieval Engine with Qdrant
"""

import logging
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
import numpy as np

from .qdrant_store import QdrantVectorStore
from .smart_query_processor import DynamicQueryProcessor
from .llamaindex_core import RAGConfig, LlamaIndexServiceManager

logger = logging.getLogger(__name__)


class RetrievalMode(Enum):
    """Retrieval strategies"""
    STANDARD = "standard"
    WITH_RERANKING = "with_reranking"


@dataclass
class RetrievalConfig:
    """Retrieval configuration"""
    top_k: int = 10
    score_threshold: float = 0.3
    max_context_length: int = 4000
    enable_reranking: bool = False


class RetrievalEngine:
    """Clean retrieval engine with Qdrant"""

    def __init__(self, config: Optional[RetrievalConfig] = None):
        self.config = config or RetrievalConfig()

        # Initialize embedding model
        rag_config = RAGConfig.from_env()
        service_manager = LlamaIndexServiceManager(rag_config)
        self.embedding_model = service_manager.embedding_model

        # Initialize Qdrant with embedding model name for drift detection
        self.qdrant = QdrantVectorStore(
            embedding_model_name=rag_config.embedding_model_name
        )
        self.query_processor = DynamicQueryProcessor()

        # Cache for learned vocabularies
        self._learned_assignments = {}

        logger.info(
            f"Qdrant Retrieval Engine initialized "
            f"(model: {rag_config.embedding_model_name})"
        )

    def retrieve(self,
                 query: str,
                 professor_username: str,
                 course_id: str,
                 assignment_title: str,
                 index_type: Optional[str] = None,
                 top_k: Optional[int] = None,
                 check_compatibility: bool = True) -> Dict[str, Any]:
        """
        Retrieve relevant content from Qdrant

        Args:
            query: Search query
            professor_username: Professor identifier
            course_id: Course identifier
            assignment_title: Assignment identifier
            index_type: Optional - "course_content" or "supporting_docs"
            top_k: Optional - Number of results to return
            check_compatibility: Whether to check model compatibility (default: True)

        Returns:
            Dictionary with retrieval results
        """
        start_time = time.time()

        try:
            # Check model compatibility if enabled
            if check_compatibility:
                compat = self.qdrant.check_model_compatibility(
                    professor_username=professor_username,
                    course_id=course_id,
                    assignment_title=assignment_title
                )

                # Log warning if incompatible
                if compat.get("compatible") == False:
                    logger.warning(
                        f"⚠️ MODEL DRIFT DETECTED: {compat.get('message')} "
                        f"- Indexed: {compat.get('indexed_model')} v{compat.get('indexed_version')}, "
                        f"Current: {compat.get('current_model')} v{compat.get('current_version')}"
                    )
                    if compat.get("severity") == "critical":
                        logger.error(
                            f"❌ CRITICAL: Re-indexing required for assignment {assignment_title}"
                        )

            # Learn from documents (cached)
            self._learn_vocabulary(
                professor_username, course_id, assignment_title)

            # Process query
            enhanced_query, similarity_boost = self.query_processor.process_query_for_retrieval(
                query)

            # Generate embedding
            query_embedding = np.array(
                self.embedding_model.get_text_embedding(enhanced_query)
            )

            # Search in Qdrant
            results = self.qdrant.search(
                query_vector=query_embedding,
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title,
                index_type=index_type,
                top_k=top_k or self.config.top_k,
                score_threshold=self.config.score_threshold
            )

            # Process results
            processed_results = self._process_results(
                results, similarity_boost)

            return {
                "query": query,
                "enhanced_query": enhanced_query,
                "total_results": len(processed_results),
                "results": processed_results,
                "retrieval_time": time.time() - start_time,
                "similarity_boost": similarity_boost,
                "metadata": {
                    "professor_username": professor_username,
                    "course_id": course_id,
                    "assignment_title": assignment_title,
                    "index_type": index_type
                }
            }

        except Exception as e:
            logger.error(f"Retrieval failed: {str(e)}")
            return {
                "query": query,
                "total_results": 0,
                "results": [],
                "error": str(e),
                "retrieval_time": time.time() - start_time
            }

    def retrieve_dual_context(self,
                              query: str,
                              professor_username: str,
                              course_id: str,
                              assignment_title: str,
                              top_k: Optional[int] = None) -> Dict[str, Any]:
        """Retrieve from both course content and supporting docs"""

        start_time = time.time()

        # Retrieve from both indices
        course_results = self.retrieve(
            query=query,
            professor_username=professor_username,
            course_id=course_id,
            assignment_title=assignment_title,
            index_type="course_content",
            top_k=top_k
        )

        supporting_results = self.retrieve(
            query=query,
            professor_username=professor_username,
            course_id=course_id,
            assignment_title=assignment_title,
            index_type="supporting_docs",
            top_k=top_k
        )

        return {
            "query": query,
            "course_content": course_results,
            "supporting_docs": supporting_results,
            "total_retrieval_time": time.time() - start_time,
            "has_course_content": course_results["total_results"] > 0,
            "has_supporting_docs": supporting_results["total_results"] > 0
        }

    def _learn_vocabulary(self, professor_username: str, course_id: str, assignment_title: str):
        """Learn vocabulary from assignment documents (cached)"""
        cache_key = f"{professor_username}_{course_id}_{assignment_title}"

        if cache_key not in self._learned_assignments:
            # Get sample texts
            sample_results = self.qdrant.search(
                query_vector=np.random.randn(1024),
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title,
                top_k=20
            )

            if sample_results:
                texts = [r["text"] for r in sample_results]
                self.query_processor.learn_from_documents(texts)
                self._learned_assignments[cache_key] = True

    def _process_results(self, results: List[Dict], similarity_boost: float) -> List[Dict]:
        """Process and filter results"""
        processed = []
        total_length = 0

        for result in results:
            # Apply similarity boost
            result["score"] = result["score"] * similarity_boost

            # Check length limit
            text_length = len(result["text"])
            if total_length + text_length > self.config.max_context_length:
                if self.config.max_context_length - total_length > 100:
                    # Truncate if meaningful text remains
                    remaining = self.config.max_context_length - total_length
                    result["text"] = result["text"][:remaining] + "..."
                    text_length = remaining
                else:
                    break

            processed.append({
                "text": result["text"],
                "score": result["score"],
                "metadata": result.get("metadata", {}),
                "node_id": result.get("node_id", ""),
                "index_type": result.get("index_type", "")
            })

            total_length += text_length

        return processed


# Global singleton
_retrieval_engine = None


def get_retrieval_engine() -> RetrievalEngine:
    """Get or create global retrieval engine singleton"""
    global _retrieval_engine
    if _retrieval_engine is None:
        _retrieval_engine = RetrievalEngine()
        logger.info("Created global RetrievalEngine singleton")
    return _retrieval_engine
