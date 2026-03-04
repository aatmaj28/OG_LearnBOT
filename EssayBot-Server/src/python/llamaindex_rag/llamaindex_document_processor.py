"""
File: llamaindex_document_processor.py
Document Processing for Qdrant-based RAG Pipeline
"""

import os
import logging
import time
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# LlamaIndex imports
from llama_index.core import Document
from llama_index.readers.file import PDFReader
from llama_index.core.schema import MetadataMode

# PDF processing
import pdfplumber
from PyPDF2 import PdfReader
import fitz  # PyMuPDF as fallback

# Numpy for embeddings
import numpy as np

# Local imports
from .qdrant_store import QdrantVectorStore
from .llamaindex_core import RAGConfig, LlamaIndexServiceManager

logger = logging.getLogger(__name__)


class PDFExtractor:
    """Enhanced PDF text extraction with fallback methods."""

    def __init__(self):
        self.extraction_methods = [
            self._extract_with_pdfplumber,
            self._extract_with_llamaindex,
            self._extract_with_pymupdf,
            self._extract_with_pypdf2
        ]

    def extract_text_from_file(self, file_path: str, file_name: str) -> Tuple[str, Dict[str, Any]]:
        """Extract text from file based on its type."""
        file_extension = file_name.lower().split('.')[-1]

        if file_extension == 'txt':
            return self._extract_from_txt(file_path)
        else:
            return self.extract_text(file_path)

    def _extract_from_txt(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Extract text from TXT file."""
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']

        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    text = f.read()

                metadata = {
                    "extraction_method": f"txt_read_{encoding}",
                    "total_pages": 1,
                    "success": True,
                    "character_count": len(text),
                    "word_count": len(text.split())
                }

                logger.info(
                    f"Extracted {len(text)} characters from TXT using {encoding}")
                return text, metadata

            except UnicodeDecodeError:
                continue

        raise ValueError(
            "Could not decode TXT file with any supported encoding")

    def extract_text(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Extract text from PDF with multiple fallback methods."""
        metadata = {
            "extraction_method": None,
            "page_count": 0,
            "file_size": os.path.getsize(file_path),
            "extraction_time": 0,
            "extraction_success": False
        }

        start_time = time.time()

        for i, method in enumerate(self.extraction_methods):
            try:
                logger.info(
                    f"Trying extraction method {i+1}: {method.__name__}")
                text, method_metadata = method(file_path)

                if text and len(text.strip()) > 100:
                    metadata.update(method_metadata)
                    metadata["extraction_method"] = method.__name__
                    metadata["extraction_time"] = time.time() - start_time
                    metadata["extraction_success"] = True

                    logger.info(
                        f"Extracted {len(text)} characters using {method.__name__}")
                    return text, metadata

            except Exception as e:
                logger.warning(f"Method {method.__name__} failed: {str(e)}")
                continue

        metadata["extraction_time"] = time.time() - start_time
        raise ValueError("All PDF extraction methods failed")

    def extract_specific_pages(self, file_path: str, page_ranges: str) -> Tuple[str, Dict[str, Any]]:
        """Extract text from specific pages of a PDF."""
        start_time = time.time()
        page_numbers = self._parse_page_ranges(page_ranges)
        logger.info(f"Extracting pages: {page_numbers}")

        text_parts = []
        metadata = {
            "page_count": 0,
            "extracted_pages": page_numbers,
            "tables_found": 0
        }

        with pdfplumber.open(file_path) as pdf:
            total_pages = len(pdf.pages)
            metadata["total_pages_in_document"] = total_pages

            valid_pages = [p for p in page_numbers if 1 <= p <= total_pages]
            invalid_pages = [
                p for p in page_numbers if p < 1 or p > total_pages]

            if invalid_pages:
                logger.warning(f"Invalid page numbers: {invalid_pages}")

            metadata["valid_pages"] = valid_pages
            metadata["invalid_pages"] = invalid_pages

            for page_num in valid_pages:
                try:
                    page = pdf.pages[page_num - 1]
                    page_text = page.extract_text()

                    if page_text:
                        page_text = self._clean_page_text(page_text, page_num)
                        text_parts.append(f"[Page {page_num}]\n{page_text}")
                        metadata["page_count"] += 1

                    tables = page.extract_tables()
                    if tables:
                        metadata["tables_found"] += len(tables)

                except Exception as e:
                    logger.warning(
                        f"Failed to extract page {page_num}: {str(e)}")
                    continue

        extracted_text = "\n\n".join(text_parts)
        metadata["extraction_time"] = time.time() - start_time
        metadata["extraction_success"] = bool(extracted_text)
        metadata["extraction_method"] = "pdfplumber_specific_pages"

        if not extracted_text:
            raise ValueError(f"No text extracted from pages: {page_ranges}")

        logger.info(
            f"Extracted {len(extracted_text)} chars from {metadata['page_count']} pages")
        return extracted_text, metadata

    def _parse_page_ranges(self, page_ranges: str) -> List[int]:
        """Parse page range string into list of page numbers."""
        page_numbers = []
        parts = [part.strip() for part in page_ranges.split(',')]

        for part in parts:
            if '-' in part:
                try:
                    start, end = part.split('-')
                    start = int(start.strip())
                    end = int(end.strip())
                    page_numbers.extend(range(start, end + 1))
                except ValueError:
                    logger.warning(f"Invalid page range: {part}")
            else:
                try:
                    page_numbers.append(int(part.strip()))
                except ValueError:
                    logger.warning(f"Invalid page number: {part}")

        return sorted(list(set(page_numbers)))

    def _extract_with_pdfplumber(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Extract using pdfplumber."""
        text_parts = []
        metadata = {"page_count": 0, "tables_found": 0}

        with pdfplumber.open(file_path) as pdf:
            metadata["page_count"] = len(pdf.pages)

            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    page_text = self._clean_page_text(page_text, page_num + 1)
                    text_parts.append(page_text)

                tables = page.extract_tables()
                if tables:
                    metadata["tables_found"] += len(tables)

        return "\n\n".join(text_parts), metadata

    def _extract_with_llamaindex(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Extract using LlamaIndex PDFReader."""
        pdf_reader = PDFReader()
        documents = pdf_reader.load_data(file=Path(file_path))

        text_parts = [doc.text for doc in documents if doc.text]
        metadata = {
            "page_count": len(documents),
            "documents_created": len(documents)
        }

        return "\n\n".join(text_parts), metadata

    def _extract_with_pymupdf(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Extract using PyMuPDF."""
        doc = fitz.open(file_path)
        text_parts = []
        metadata = {"page_count": doc.page_count}

        for page_num in range(doc.page_count):
            page = doc[page_num]
            page_text = page.get_text()
            if page_text:
                page_text = self._clean_page_text(page_text, page_num + 1)
                text_parts.append(page_text)

        doc.close()
        return "\n\n".join(text_parts), metadata

    def _extract_with_pypdf2(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Extract using PyPDF2."""
        reader = PdfReader(file_path)
        text_parts = []
        metadata = {"page_count": len(reader.pages)}

        for page_num, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                page_text = self._clean_page_text(page_text, page_num + 1)
                text_parts.append(page_text)

        return "\n\n".join(text_parts), metadata

    def _clean_page_text(self, text: str, page_num: int) -> str:
        """Clean extracted page text."""
        import re

        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'^Page \d+\s*', '', text)
        text = re.sub(r'\s*Page \d+$', '', text)
        text = f"[Page {page_num}] {text.strip()}"

        return text


class DocumentProcessor:
    """Document processor for Qdrant-based RAG pipeline."""

    def __init__(self, s3_manager):
        self.s3_manager = s3_manager  # Keep S3 manager for file downloads
        self.config = RAGConfig.from_env()
        self.service_manager = LlamaIndexServiceManager(self.config)
        self.pdf_extractor = PDFExtractor()

        # Initialize Qdrant with embedding model name for drift detection
        self.qdrant_store = QdrantVectorStore(
            embedding_model_name=self.config.embedding_model_name
        )

        logger.info(
            f"DocumentProcessor initialized with Qdrant "
            f"(model: {self.config.embedding_model_name})"
        )

    def process_content_specifications(
        self,
        content_specifications: List[Dict[str, Any]],
        professor_username: str,
        course_id: str,
        assignment_title: str
    ) -> Dict[str, Any]:
        """Process documents based on content specifications."""
        logger.info(f"Processing {len(content_specifications)} specifications")

        # Separate by type
        course_content_specs = [
            spec for spec in content_specifications
            if spec.get("fileType") == "course_content"
        ]
        supporting_docs_specs = [
            spec for spec in content_specifications
            if spec.get("fileType") == "supporting_docs"
        ]

        results = {
            "course_content_index": None,
            "supporting_docs_index": None,
            "processing_summary": {
                "total_files": len(content_specifications),
                "course_content_files": len(course_content_specs),
                "supporting_docs_files": len(supporting_docs_specs),
                "errors": []
            }
        }

        # Process course content
        if course_content_specs:
            try:
                course_result = self._process_file_specifications(
                    course_content_specs,
                    "course_content",
                    professor_username,
                    course_id,
                    assignment_title
                )
                results["course_content_index"] = course_result
                logger.info("✅ Course content indexed")
            except Exception as e:
                error_msg = f"Course content indexing failed: {str(e)}"
                logger.error(error_msg)
                results["processing_summary"]["errors"].append(error_msg)

        # Process supporting docs
        if supporting_docs_specs:
            try:
                supporting_result = self._process_file_specifications(
                    supporting_docs_specs,
                    "supporting_docs",
                    professor_username,
                    course_id,
                    assignment_title
                )
                results["supporting_docs_index"] = supporting_result
                logger.info("✅ Supporting docs indexed")
            except Exception as e:
                error_msg = f"Supporting docs indexing failed: {str(e)}"
                logger.error(error_msg)
                results["processing_summary"]["errors"].append(error_msg)

        if not results["course_content_index"] and not results["supporting_docs_index"]:
            raise ValueError("Failed to create any indices")

        return results

    def _process_file_specifications(
        self,
        file_specs: List[Dict[str, Any]],
        index_type: str,
        professor_username: str,
        course_id: str,
        assignment_title: str
    ) -> Dict[str, Any]:
        """Process files and create Qdrant index."""
        documents = []
        extraction_results = []

        for spec in file_specs:
            try:
                file_key = spec.get("fileKey")
                file_name = spec.get("fileName")
                use_entire_document = spec.get("useEntireDocument", True)
                relevant_pages = spec.get("relevantPages")

                # Download file
                import tempfile
                with tempfile.NamedTemporaryFile(suffix=f".{file_name.split('.')[-1]}") as tmp:
                    self.s3_manager.download_file(file_key, tmp.name)

                    # Extract text
                    if relevant_pages and not use_entire_document:
                        text, metadata = self.pdf_extractor.extract_specific_pages(
                            tmp.name, relevant_pages
                        )
                    else:
                        text, metadata = self.pdf_extractor.extract_text_from_file(
                            tmp.name, file_name
                        )

                    # Create document
                    document = Document(
                        text=text,
                        metadata={
                            "source_file": file_key,
                            "file_name": file_name,
                            "professor_username": professor_username,
                            "course_id": course_id,
                            "assignment_title": assignment_title,
                            "document_type": index_type,
                            **metadata
                        }
                    )

                    documents.append(document)
                    extraction_results.append({
                        "file_name": file_name,
                        "success": True,
                        "chars": len(text)
                    })

            except Exception as e:
                logger.error(f"Failed to process {spec.get('fileName')}: {e}")
                extraction_results.append({
                    "file_name": spec.get("fileName"),
                    "success": False,
                    "error": str(e)
                })

        if not documents:
            raise ValueError(f"No documents processed for {index_type}")

        # Create index with Qdrant
        return self._create_qdrant_index(
            documents,
            professor_username,
            course_id,
            assignment_title,
            index_type,
            extraction_results
        )

    def _create_qdrant_index(
        self,
        documents: List[Document],
        professor_username: str,
        course_id: str,
        assignment_title: str,
        index_type: str,
        extraction_results: List[Dict]
    ) -> Dict[str, Any]:
        """
        Create Qdrant index from documents.

        This method implements a full-replacement strategy:
        - Deletes existing vectors for this assignment + index_type
        - Indexes the new set of documents

        This ensures no duplicate vectors or stale data.
        """
        logger.info(
            f"Creating {index_type} index from {len(documents)} documents")

        # Step 1: Clear existing vectors for this index_type to prevent duplicates
        logger.info(
            f"Clearing existing {index_type} vectors for assignment {assignment_title}"
        )

        try:
            deletion_result = self.qdrant_store.delete_assignment_data(
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title,
                index_type=index_type  # Only delete vectors of this type
            )

            if deletion_result.get("success"):
                logger.info(
                    f"✅ Cleared old {index_type} vectors: {deletion_result.get('message', 'success')}"
                )
            else:
                logger.warning(
                    f"⚠️ Deletion returned non-success (may be first index): {deletion_result.get('error', 'unknown')}"
                )

        except Exception as e:
            # Log but don't fail - this is expected on first index
            logger.info(
                f"No existing {index_type} vectors to clear (likely first index): {str(e)}"
            )

        # Step 2: Parse into nodes
        logger.info(f"Parsing {len(documents)} documents into nodes")
        node_parser = self.service_manager.node_parser
        nodes = node_parser.get_nodes_from_documents(documents)

        # Filter valid nodes
        valid_nodes = [
            node for node in nodes
            if len(node.get_content(metadata_mode=MetadataMode.NONE)) >= self.config.min_chunk_size
        ]

        logger.info(f"Created {len(valid_nodes)} valid nodes")

        # Validate that we have nodes to index
        if not valid_nodes:
            error_msg = f"No valid nodes created from {len(documents)} documents"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # Generate embeddings in batches
        logger.info(f"Generating embeddings for {len(valid_nodes)} nodes")
        texts = [node.get_content(metadata_mode=MetadataMode.NONE)
                 for node in valid_nodes]
        embeddings = []

        batch_size = 32
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            batch_embeddings = self.service_manager.embedding_model.get_text_embedding_batch(
                batch)
            embeddings.extend([np.array(e) for e in batch_embeddings])

        logger.info(f"Generated {len(embeddings)} embeddings")

        # Prepare nodes data
        nodes_data = [
            {
                "text": node.get_content(metadata_mode=MetadataMode.NONE),
                "metadata": node.metadata,
                "node_id": node.node_id,
                "start_char_idx": getattr(node, 'start_char_idx', None),
                "end_char_idx": getattr(node, 'end_char_idx', None),
            }
            for node in valid_nodes
        ]

        # Step 3: Index in Qdrant
        logger.info(f"Indexing {len(nodes_data)} nodes in Qdrant")
        result = self.qdrant_store.index_nodes(
            nodes=nodes_data,
            embeddings=embeddings,
            professor_username=professor_username,
            course_id=course_id,
            assignment_title=assignment_title,
            index_type=index_type
        )

        result.update({
            "total_nodes": len(valid_nodes),
            "total_documents": len(documents),
            "extraction_results": extraction_results
        })

        logger.info(
            f"✅ Successfully indexed {len(valid_nodes)} nodes from {len(documents)} documents"
        )

        return result
