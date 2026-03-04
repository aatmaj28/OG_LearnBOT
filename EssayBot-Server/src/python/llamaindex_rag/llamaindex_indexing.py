"""
File: llamaindex_indexing.py
Indexing Interface for Qdrant-based RAG Pipeline
"""

import os
import logging
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from .llamaindex_document_processor import DocumentProcessor
from .llamaindex_core import S3Manager, RAGConfig

logger = logging.getLogger(__name__)


@dataclass
class IndexingResult:
    """Result from indexing operation"""
    success: bool
    index_type: str = ""
    total_nodes: int = 0
    total_documents: int = 0
    processing_time: float = 0.0
    error_message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "success": self.success,
            "index_type": self.index_type,
            "total_nodes": self.total_nodes,
            "total_documents": self.total_documents,
            "processing_time": self.processing_time,
            "error_message": self.error_message
        }


class LlamaIndexIndexer:
    """Indexing interface for Qdrant-based RAG system"""

    def __init__(self):
        """Initialize the indexer"""
        try:
            # Initialize S3 manager for file downloads
            self.config = RAGConfig.from_env()
            self.s3_manager = S3Manager(self.config)

            # Initialize document processor with Qdrant
            self.document_processor = DocumentProcessor(self.s3_manager)

            logger.info("LlamaIndexIndexer initialized with Qdrant")

        except Exception as e:
            logger.error(f"Failed to initialize indexer: {str(e)}")
            raise

    def index_content_specifications(
        self,
        content_specifications: List[Dict[str, Any]],
        professor_username: str,
        course_id: str,
        assignment_title: str
    ) -> Dict[str, Any]:
        """
        Index documents based on content specifications

        Args:
            content_specifications: List of file specifications
            professor_username: Professor's username
            course_id: Course identifier
            assignment_title: Assignment identifier

        Returns:
            Dictionary with indexing results
        """
        start_time = time.time()

        try:
            logger.info(f"Indexing {len(content_specifications)} files")

            # Validate input
            if not content_specifications:
                raise ValueError("No content specifications provided")

            # Process using document processor
            result = self.document_processor.process_content_specifications(
                content_specifications=content_specifications,
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title
            )

            processing_time = time.time() - start_time

            # Determine indexing strategy based on what was created
            indexing_strategy = "none"
            if result.get("course_content_index") and result.get("supporting_docs_index"):
                indexing_strategy = "dual"
            elif result.get("course_content_index"):
                indexing_strategy = "course_content_only"
            elif result.get("supporting_docs_index"):
                indexing_strategy = "supporting_docs_only"

            # Format response
            return {
                "success": True,
                "processing_time": processing_time,
                "indexing_strategy": indexing_strategy,
                "course_content_index": result.get("course_content_index"),
                "supporting_docs_index": result.get("supporting_docs_index"),
                "processing_summary": result.get("processing_summary"),
                "storage_type": "qdrant"
            }

        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = f"Indexing failed: {str(e)}"
            logger.error(error_msg)

            return {
                "success": False,
                "processing_time": processing_time,
                "indexing_strategy": "error",
                "error_message": error_msg,
                "storage_type": "qdrant"
            }

    def index_single_document(
        self,
        s3_file_key: str,
        professor_username: str,
        course_id: str,
        assignment_title: str,
        index_type: str = "course_content"
    ) -> IndexingResult:
        """
        Index a single document

        Args:
            s3_file_key: S3 key for the file
            professor_username: Professor's username
            course_id: Course identifier
            assignment_title: Assignment identifier
            index_type: Type of index ("course_content" or "supporting_docs")

        Returns:
            IndexingResult with operation details
        """
        start_time = time.time()

        try:
            # Create content specification for single file
            content_spec = [{
                "fileKey": s3_file_key,
                "fileName": os.path.basename(s3_file_key),
                "fileType": index_type,
                "useEntireDocument": True
            }]

            # Use existing method
            result = self.index_content_specifications(
                content_specifications=content_spec,
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title
            )

            processing_time = time.time() - start_time

            if result["success"]:
                index_info = result.get(f"{index_type}_index", {})
                return IndexingResult(
                    success=True,
                    index_type=index_type,
                    total_nodes=index_info.get("total_nodes", 0),
                    total_documents=1,
                    processing_time=processing_time
                )
            else:
                return IndexingResult(
                    success=False,
                    processing_time=processing_time,
                    error_message=result.get("error_message", "Unknown error")
                )

        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = f"Failed to index document: {str(e)}"
            logger.error(error_msg)

            return IndexingResult(
                success=False,
                processing_time=processing_time,
                error_message=error_msg
            )

    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check of the indexing system

        Returns:
            Dictionary with health status
        """
        try:
            from .qdrant_store import QdrantVectorStore

            # Check Qdrant connection
            qdrant = QdrantVectorStore()
            collections = qdrant.client.get_collections()

            # Check S3 connection
            s3_status = self.s3_manager._validate_bucket()

            return {
                "status": "healthy",
                "timestamp": time.time(),
                "components": {
                    "qdrant": {
                        "status": "healthy",
                        "collections": len(collections.collections)
                    },
                    "s3": {
                        "status": "healthy" if s3_status else "unhealthy"
                    },
                    "document_processor": {
                        "status": "healthy"
                    }
                },
                "storage_type": "qdrant"
            }

        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return {
                "status": "unhealthy",
                "timestamp": time.time(),
                "error": str(e),
                "storage_type": "qdrant"
            }

    def index_content_specifications(
        self,
        content_specifications: List[Dict[str, Any]],
        professor_username: str,
        course_id: str,
        assignment_title: str
    ) -> Dict[str, Any]:
        """
        Index documents based on content specifications with dual indexing.

        Args:
            content_specifications: List of file specifications from frontend
            professor_username: Professor's username
            course_id: Course identifier
            assignment_title: Assignment identifier

        Returns:
            Dictionary with dual indexing results
        """
        start_time = time.time()

        try:
            logger.info(
                f"Starting content specifications indexing: {len(content_specifications)} files")

            # Validate input
            if not content_specifications or len(content_specifications) == 0:
                raise ValueError(
                    "content_specifications must be a non-empty list")

            # Process using DocumentProcessor
            result = self.document_processor.process_content_specifications(
                content_specifications=content_specifications,
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title
            )

            processing_time = time.time() - start_time

            # Format successful response
            success_result = {
                "success": True,
                "processing_time": processing_time,
                "course_content_index": result.get("course_content_index"),
                "supporting_docs_index": result.get("supporting_docs_index"),
                "processing_summary": result.get("processing_summary"),
                "indexing_strategy": "dual_index"
            }

            logger.info(
                f"Successfully processed content specifications in {processing_time:.2f}s")
            return success_result

        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = f"Failed to index content specifications: {str(e)}"
            logger.error(error_msg)

            return {
                "success": False,
                "processing_time": processing_time,
                "error_message": error_msg,
                "indexing_strategy": "dual_index"
            }


# Example usage
if __name__ == "__main__":
    indexer = LlamaIndexIndexer()

    # Test health check
    health = indexer.health_check()
    logger.info(f"Health Status: {health['status']}")
