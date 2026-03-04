"""
File: llamaindex_core.py
LlamaIndex RAG Pipeline - Module 1: Core Setup and Configuration
================================================================

This module provides the foundational setup for the LlamaIndex-based RAG pipeline,
including configuration management, service context setup, and base utilities.

Usage:
    from llamaindex_core import RAGPipelineCore, RAGConfig
    
    # Initialize with environment variables
    pipeline = RAGPipelineCore()
    
    # Or with custom config
    config = RAGConfig(chunk_size=1500, similarity_top_k=15)
    pipeline = RAGPipelineCore(config)
"""

import os
import logging
import json
import torch  # Add this import
import gc  # Add this import for garbage collection
import torch  # Add this import
import gc  # Add this import for garbage collection
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from pathlib import Path
import tempfile
from contextlib import contextmanager
from datetime import datetime
from utils.critical_monitor import alert_rag_pipeline_failure, alert_embedding_model_failure

from utils.critical_monitor import alert_rag_pipeline_failure, alert_embedding_model_failure


# LlamaIndex imports
from llama_index.core import Settings
from llama_index.core.service_context import ServiceContext
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.node_parser import SimpleNodeParser, SentenceSplitter
from llama_index.core.callbacks import CallbackManager, LlamaDebugHandler

# AWS/S3 imports (for document downloads)
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

# Environment and logging setup
from dotenv import load_dotenv

# Load environment variables conditionally based on NODE_ENV
load_dotenv()  # Always load .env first
if os.environ.get('NODE_ENV') == 'development':
    # Override with .env.local in development
    load_dotenv('.env.local', override=True)
# Load environment variables conditionally based on NODE_ENV
load_dotenv()  # Always load .env first
if os.environ.get('NODE_ENV') == 'development':
    # Override with .env.local in development
    load_dotenv('.env.local', override=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("llamaindex_rag.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)


# Add GPU utility functions
def get_gpu_device(device_id: Optional[int] = None, device_uuid: Optional[str] = None) -> torch.device:
    """
    Get the appropriate GPU device based on configuration.

    Args:
        device_id: Specific GPU device ID (0, 1, 2, etc.)
        device_uuid: GPU UUID for precise identification

    Returns:
        torch.device: The configured device
    """
    if not torch.cuda.is_available():
        logger.warning("CUDA not available, falling back to CPU")
        return torch.device("cpu")

    if device_uuid:
        # Find device by UUID
        for i in range(torch.cuda.device_count()):
            if torch.cuda.get_device_properties(i).uuid == device_uuid:
                logger.info(f"Using GPU device {i} with UUID: {device_uuid}")
                return torch.device(f"cuda:{i}")
        logger.warning(
            f"GPU with UUID {device_uuid} not found, using device_id instead")

    if device_id is not None:
        if device_id < torch.cuda.device_count():
            device = torch.device(f"cuda:{device_id}")
            logger.info(f"Using GPU device: {device_id}")
            return device
        else:
            logger.warning(
                f"GPU device {device_id} not available, using cuda:0")
            return torch.device("cuda:0")

    # Default to first available GPU
    return torch.device("cuda:0")


def cleanup_gpu_memory():
    """Clean up GPU memory and cache."""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        gc.collect()
        logger.info("GPU memory cleaned up")


def log_gpu_memory_usage(device: torch.device):
    """Log current GPU memory usage."""
    if device.type == "cuda":
        allocated = torch.cuda.memory_allocated(device) / 1024**3  # GB
        reserved = torch.cuda.memory_reserved(device) / 1024**3   # GB
        logger.info(
            f"GPU {device.index} Memory - Allocated: {allocated:.2f}GB, Reserved: {reserved:.2f}GB")


@dataclass
class RAGConfig:
    """Configuration class for RAG pipeline settings."""

    # Text processing - Optimized for academic papers
    chunk_size: int = 800  # Smaller chunks for better retrieval
    chunk_overlap: int = 200  # Proportional overlap
    min_chunk_size: int = 100  # Higher minimum for meaningful content
    max_token_length: int = 512

    # Embedding settings
    embedding_model_name: str = "BAAI/bge-large-en"
    embedding_batch_size: int = 32

    # GPU settings - NEW
    use_gpu: bool = True
    # Use GPU device 1, or None for auto-selection
    gpu_device_id: Optional[int] = 1
    gpu_device_uuid: Optional[str] = None  # Alternative: specify GPU by UUID
    enable_gpu_cleanup: bool = True  # Enable automatic GPU memory cleanup

    # Retrieval settings
    similarity_top_k: int = 10
    distance_threshold: float = 0.5
    max_total_length: int = 4000

    # S3/MinIO settings (for document downloads)
    s3_endpoint: str = "http://127.0.0.1:9000"
    s3_bucket: str = "essaybot"
    s3_region: str = "us-east-1"

    @classmethod
    def from_env(cls) -> 'RAGConfig':
        """Create configuration from environment variables."""
        # Add GPU configuration from environment
        use_gpu = os.getenv("USE_GPU", "true").lower() == "true"
        gpu_device_id = os.getenv("GPU_DEVICE_ID")
        gpu_device_uuid = os.getenv("GPU_DEVICE_UUID")
        enable_gpu_cleanup = os.getenv(
            "ENABLE_GPU_CLEANUP", "true").lower() == "true"

        return cls(
            chunk_size=int(os.getenv("RAG_CHUNK_SIZE", 800)),
            chunk_overlap=int(os.getenv("RAG_CHUNK_OVERLAP", 200)),
            min_chunk_size=int(os.getenv("MIN_CHUNK_SIZE", 100)),
            max_token_length=int(os.getenv("MAX_TOKEN_LENGTH", 512)),
            embedding_model_name=os.getenv(
                "EMBEDDING_MODEL", "BAAI/bge-large-en"),
            embedding_batch_size=int(os.getenv("EMBEDDING_BATCH_SIZE", 32)),
            similarity_top_k=int(os.getenv("SIMILARITY_TOP_K", 10)),
            distance_threshold=float(os.getenv("DISTANCE_THRESHOLD", 0.5)),
            max_total_length=int(os.getenv("MAX_TOTAL_LENGTH", 4000)),
            s3_endpoint=os.getenv("MINIO_ENDPOINT", "http://127.0.0.1:9000"),
            s3_bucket=os.getenv("MINIO_BUCKET", "essaybot"),
            s3_region=os.getenv("S3_REGION", "us-east-1"),
            use_gpu=use_gpu,
            gpu_device_id=int(gpu_device_id) if gpu_device_id else 1,
            gpu_device_uuid=gpu_device_uuid,
            enable_gpu_cleanup=enable_gpu_cleanup,
        )

    def validate(self) -> None:
        """Validate configuration parameters."""
        if self.chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be less than chunk_size")
        if self.similarity_top_k <= 0:
            raise ValueError("similarity_top_k must be positive")
        if not (0.0 <= self.distance_threshold <= 2.0):
            raise ValueError("distance_threshold must be between 0.0 and 2.0")


class S3Manager:
    """Manages S3/MinIO operations for document downloads."""

    def __init__(self, config: RAGConfig):
        self.config = config
        self.client = self._create_client()
        self._validate_bucket()

    def _create_client(self) -> boto3.client:
        """Create S3 client with proper configuration."""
        try:
            return boto3.client(
                "s3",
                endpoint_url=self.config.s3_endpoint,
                aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
                aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
                region_name=self.config.s3_region,
                config=boto3.session.Config(signature_version='s3v4')
            )
        except NoCredentialsError:
            logger.error("S3 credentials not found in environment variables")
            raise
        except Exception as e:
            logger.error(f"Failed to create S3 client: {str(e)}")
            raise

    def _validate_bucket(self) -> None:
        """Validate that the S3 bucket exists and is accessible."""
        try:
            self.client.head_bucket(Bucket=self.config.s3_bucket)
            logger.info(
                f"Successfully connected to S3 bucket: {self.config.s3_bucket}")
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                logger.error(
                    f"S3 bucket '{self.config.s3_bucket}' does not exist")
            elif error_code == '403':
                logger.error(
                    f"Access denied to S3 bucket '{self.config.s3_bucket}'")
            else:
                logger.error(f"Error accessing S3 bucket: {str(e)}")
            raise

    def download_file(self, s3_key: str, local_path: str) -> str:
        """Download file from S3 to local path."""
        try:
            self.client.download_file(
                Bucket=self.config.s3_bucket,
                Key=s3_key,
                Filename=local_path
            )
            logger.info(f"Downloaded {s3_key} to {local_path}")
            return local_path
        except ClientError as e:
            logger.error(f"Failed to download {s3_key}: {str(e)}")
            raise


class LlamaIndexServiceManager:
    """Manages LlamaIndex service context and global settings."""

    def __init__(self, config: RAGConfig):
        self.config = config
        self.embedding_model = None
        self.node_parser = None
        self.callback_manager = None
        self.device = None
        self.device = None
        self._setup_service_context()

    def _setup_service_context(self) -> None:
        """Setup LlamaIndex service context with optimized settings."""
        try:
            # Determine device configuration
            if self.config.use_gpu and torch.cuda.is_available():
                self.device = get_gpu_device(
                    device_id=self.config.gpu_device_id,
                    device_uuid=self.config.gpu_device_uuid
                )
                device_str = str(self.device)
                logger.info(
                    f"Initializing embedding model on GPU: {device_str}")
            else:
                self.device = torch.device("cpu")
                device_str = "cpu"
                logger.info("Initializing embedding model on CPU")

            # Clean up GPU memory before initialization if enabled
            if self.config.enable_gpu_cleanup and self.device.type == "cuda":
                cleanup_gpu_memory()

            # Setup embedding model with specified device
            self.embedding_model = HuggingFaceEmbedding(
                model_name=self.config.embedding_model_name,
                max_length=self.config.max_token_length,
                device=device_str,  # Specify the device
            )

            # Log GPU memory usage after model initialization
            if self.device.type == "cuda":
                log_gpu_memory_usage(self.device)

            logger.info(
                f"Initialized embedding model: {self.config.embedding_model_name} on {device_str}")

            # Setup semantic splitter for academic papers - groups semantically related content
            from llama_index.core.node_parser.text.semantic_splitter import SemanticSplitterNodeParser
            self.node_parser = SemanticSplitterNodeParser.from_defaults(
                embed_model=self.embedding_model,
                buffer_size=2,  # Group 2 sentences for balanced context vs granularity
                breakpoint_percentile_threshold=80,  # Even lower for academic section detection
                include_metadata=True,
                include_prev_next_rel=True,
                # Keep default sentence splitter for academic content
            )
            logger.info(
                f"✅ Initialized SemanticSplitterNodeParser - buffer_size: 2, threshold: 80% (academic paper optimized)")

            # Setup callback manager for debugging
            llama_debug = LlamaDebugHandler(print_trace_on_end=True)
            self.callback_manager = CallbackManager([llama_debug])

            # Configure global settings
            Settings.embed_model = self.embedding_model
            Settings.node_parser = self.node_parser
            Settings.callback_manager = self.callback_manager
            # Note: SemanticSplitterNodeParser doesn't use chunk_size/chunk_overlap
            # It uses buffer_size and breakpoint_percentile_threshold instead

            logger.info("LlamaIndex service context configured successfully")

        except Exception as e:
            logger.error(
                f"Failed to setup LlamaIndex service context: {str(e)}")
            # Clean up on error
            if self.config.enable_gpu_cleanup and self.device and self.device.type == "cuda":
                cleanup_gpu_memory()
            raise

    def get_service_context(self) -> ServiceContext:
        """Get configured service context."""
        return ServiceContext.from_defaults(
            embed_model=self.embedding_model,
            node_parser=self.node_parser,
            callback_manager=self.callback_manager
        )

    def cleanup(self):
        """Clean up resources and GPU memory."""
        if self.config.enable_gpu_cleanup and self.device and self.device.type == "cuda":
            cleanup_gpu_memory()
            logger.info("ServiceManager cleanup completed")

    def __del__(self):
        """Destructor to ensure cleanup on object deletion."""
        if hasattr(self, 'config') and self.config.enable_gpu_cleanup:
            try:
                self.cleanup()
            except Exception as e:
                logger.warning(f"Error during ServiceManager cleanup: {e}")


class RAGPipelineCore:
    """Core RAG pipeline manager that orchestrates all components."""

    def __init__(self, config: Optional[RAGConfig] = None):
        self.config = config or RAGConfig.from_env()
        self.config.validate()

        # Initialize managers
        self.service_manager = LlamaIndexServiceManager(self.config)

        logger.info("RAG Pipeline Core initialized successfully")

    def health_check(self) -> Dict[str, Any]:
        """Perform health check on all components."""
        health_status = {
            "timestamp": str(datetime.now()),
            "config_valid": True,
            "embedding_model_loaded": False,
            "qdrant_accessible": False
        }

        try:
            # Check embedding model
            test_embedding = self.service_manager.embedding_model.get_text_embedding(
                "test")
            health_status["embedding_model_loaded"] = len(test_embedding) > 0
        except Exception as e:
            error_message = str(e)
            logger.error(
                f"Embedding model health check failed: {error_message}")

            # Send critical alert for embedding model failure
            try:
                alert_embedding_model_failure(error_message)
            except Exception as alert_error:
                logger.error(f"Failed to send critical alert: {alert_error}")

        try:
            # Check Qdrant connectivity
            from .qdrant_store import QdrantVectorStore
            qdrant = QdrantVectorStore()
            collections = qdrant.client.get_collections()
            health_status["qdrant_accessible"] = True
        except Exception as e:
            logger.error(f"Qdrant health check failed: {str(e)}")

        return health_status


# Example usage and testing
if __name__ == "__main__":
    # Initialize RAG pipeline core
    try:
        config = RAGConfig.from_env()
        pipeline_core = RAGPipelineCore(config)

        # Perform health check
        health = pipeline_core.health_check()
        logger.info("Health Check Results:")
        for key, value in health.items():
            logger.info(f"  {key}: {value}")

        logger.info("RAG Pipeline Core setup completed successfully")

    except Exception as e:
        error_message = str(e)
        logger.error(
            f"Failed to initialize RAG Pipeline Core: {error_message}")

        # Send critical alert for RAG pipeline initialization failure
        try:
            alert_rag_pipeline_failure(error_message)
        except Exception as alert_error:
            logger.error(f"Failed to send critical alert: {alert_error}")

        raise
