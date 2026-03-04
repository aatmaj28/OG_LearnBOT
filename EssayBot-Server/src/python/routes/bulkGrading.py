from config.model_config import get_model_name, get_model_parameters, DEFAULT_MODEL
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from flask import Flask, request, jsonify, Blueprint
import logging
import pandas as pd
from io import BytesIO
import os
from datetime import datetime
import sys
import boto3
import json
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import gc  # Add garbage collection
from urllib.parse import urlparse, unquote
import uuid  # Add UUID for anonymization
from dotenv import load_dotenv
import re  # Add regex for cleaning LLM responses
import time  # Used for inter-batch sleep in run_batched_grading
import uuid  # Add UUID for anonymization
from dotenv import load_dotenv
import re  # Add regex for cleaning LLM responses
import time  # Used for inter-batch sleep in run_batched_grading

# Assuming these are defined elsewhere
from .rag_pipeline import retrieve_relevant_text
from agents import get_prompt

parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

# Import central model configuration

# Load environment variables conditionally based on NODE_ENV
load_dotenv()  # Always load .env first
if os.environ.get('NODE_ENV') == 'development':
    # Override with .env.local in development
    load_dotenv('.env.local', override=True)

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Configuration constants
# MAX_CONCURRENT_REQUESTS = 4
MAX_CONCURRENT_REQUESTS = 3  # Process batches in parallel for multiple users
RAG_K = 10
RAG_DISTANCE_THRESHOLD = 0.5
RAG_MAX_TOTAL_LENGTH = 6000
# Batching configuration
DEFAULT_BATCH_SIZE = 5  # Process essays in batches of 5 to improve throughput
MAX_BATCH_SIZE = 5      # Maximum batch size for safety
MIN_BATCH_SIZE = 1      # Minimum batch size


def clean_llm_response(response_text):
    """
    Clean the LLM response by removing markdown code blocks and extracting JSON.

    Args:
        response_text (str): Raw response from LLM

    Returns:
        str: Cleaned JSON string
    """
    # Remove markdown code blocks
    response_text = re.sub(r'```json\s*', '', response_text)
    response_text = re.sub(r'```\s*$', '', response_text)

    # Remove any leading/trailing whitespace
    response_text = response_text.strip()

    return response_text


def sanitize_llm_json_response(response_text: str) -> str:
    """Remove markdown code fences and trim whitespace to aid JSON parsing."""
    import re as _re
    response_text = _re.sub(r"```json\s*", "", response_text)
    response_text = _re.sub(r"```\s*$", "", response_text)
    return response_text.strip()


def try_parse_json_object(text: str) -> Optional[Dict[str, Any]]:
    """
    Attempt to parse a JSON object from text with light repair attempts.
    Returns the parsed dict or None if parsing fails.
    """
    # First attempt: direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Second attempt: sanitize typical offenders and retry
    sanitized = sanitize_llm_json_response(text)
    try:
        return json.loads(sanitized)
    except Exception:
        pass

    # Third attempt: extract the first balanced {...} JSON object
    def _extract_first_balanced_json(s: str) -> Optional[str]:
        start = s.find("{")
        if start == -1:
            return None
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(s)):
            ch = s[i]
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue
            else:
                if ch == '"':
                    in_string = True
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        return s[start:i+1]
        return None

    candidate = _extract_first_balanced_json(sanitized)
    if candidate:
        try:
            return json.loads(candidate)
        except Exception:
            pass

    return None


@dataclass
class GradingProgress:
    total_essays: int
    completed_essays: int = 0
    failed_essays: int = 0
    current_essay_index: int = 0


class StudentAnonymizer:
    """
    Handles anonymization and de-anonymization of student IDs to remove bias from LLM grading.
    """

    def __init__(self):
        self.original_to_anonymous = {}
        self.anonymous_to_original = {}

    def anonymize_student_ids(self, student_ids: List[str]) -> List[str]:
        anonymized_ids = []

        for original_id in student_ids:
            if original_id not in self.original_to_anonymous:
                # Generate a simple random number for this student ID
                import random
                anonymous_id = str(random.randint(
                    1000, 9999))  # 4-digit number
                self.original_to_anonymous[original_id] = anonymous_id
                self.anonymous_to_original[anonymous_id] = original_id

            anonymized_ids.append(self.original_to_anonymous[original_id])

        logger.info(
            f"ANONYMIZED {len(student_ids)} student IDs for bias-free grading")
        return anonymized_ids

    def de_anonymize_student_ids(self, anonymized_ids: List[str]) -> List[str]:
        original_ids = []

        for anonymous_id in anonymized_ids:
            if anonymous_id in self.anonymous_to_original:
                original_ids.append(self.anonymous_to_original[anonymous_id])
            else:
                # Fallback: if we can't find the mapping, return the anonymous ID
                logger.warning(f"Could not de-anonymize ID: {anonymous_id}")
                original_ids.append(anonymous_id)

        logger.info(f"🔓 DE-ANONYMIZED {len(original_ids)} student IDs")
        return original_ids

    def get_mapping_info(self) -> Dict[str, int]:
        """
        Get statistics about the anonymization mapping.

        Returns:
            Dictionary with mapping statistics
        """
        return {
            "total_mappings": len(self.original_to_anonymous),
            "original_ids": list(self.original_to_anonymous.keys()),
            "anonymous_ids": list(self.original_to_anonymous.values())
        }


class StudentAnonymizer:
    """
    Handles anonymization and de-anonymization of student IDs to remove bias from LLM grading.
    """

    def __init__(self):
        self.original_to_anonymous = {}
        self.anonymous_to_original = {}

    def anonymize_student_ids(self, student_ids: List[str]) -> List[str]:
        anonymized_ids = []

        for original_id in student_ids:
            if original_id not in self.original_to_anonymous:
                # Generate a simple random number for this student ID
                import random
                anonymous_id = str(random.randint(
                    1000, 9999))  # 4-digit number
                self.original_to_anonymous[original_id] = anonymous_id
                self.anonymous_to_original[anonymous_id] = original_id

            anonymized_ids.append(self.original_to_anonymous[original_id])

        logger.info(
            f"ANONYMIZED {len(student_ids)} student IDs for bias-free grading")
        return anonymized_ids

    def de_anonymize_student_ids(self, anonymized_ids: List[str]) -> List[str]:
        original_ids = []

        for anonymous_id in anonymized_ids:
            if anonymous_id in self.anonymous_to_original:
                original_ids.append(self.anonymous_to_original[anonymous_id])
            else:
                # Fallback: if we can't find the mapping, return the anonymous ID
                logger.warning(f"Could not de-anonymize ID: {anonymous_id}")
                original_ids.append(anonymous_id)

        logger.info(f"🔓 DE-ANONYMIZED {len(original_ids)} student IDs")
        return original_ids

    def get_mapping_info(self) -> Dict[str, int]:
        """
        Get statistics about the anonymization mapping.

        Returns:
            Dictionary with mapping statistics
        """
        return {
            "total_mappings": len(self.original_to_anonymous),
            "original_ids": list(self.original_to_anonymous.keys()),
            "anonymous_ids": list(self.original_to_anonymous.values())
        }


bulkGrading_bp = Blueprint("bulkGrading", __name__)

# LLM API settings
# LLM_API_URL = os.getenv("OLLAMA_URL", "http://localhost:5001/api/generate")
LLM_API_URL = os.getenv(
    "OLLAMA_URL", "http://129.10.156.97:8000/v1/completions")
logger.info(f"🔍 LLM_API_URL configured as: {LLM_API_URL}")
s3_client = boto3.client(
    "s3",
    endpoint_url=os.getenv("MINIO_ENDPOINT", "https://minio.dashlab.studio"),
    aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
    region_name="us-east-1",
    config=boto3.session.Config(signature_version='s3v4')
)
S3_BUCKET = os.getenv("MINIO_BUCKET", "essaybot")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "https://minio.dashlab.studio")


def send_post_request_sync(
    prompt: str,
    temperature: float = 0.2,
    top_p: float = 0.9,
    max_tokens: int = 2048,
    model: str = None
) -> Optional[Dict[str, Any]]:
    """Send a request to the remote LLM API."""
    # Get model from central config
    mapped_model = get_model_name(model)

    payload = {
        "model": mapped_model,
        "prompt": prompt,
        # "stream": False,
        "max_tokens": max_tokens,
        "temperature": temperature,
        # "top_p": top_p,
    }
    # Some models (e.g., gemma3:*) error 500 with format=json; omit for those
    # try:
    #     if not str(model).startswith("gemma3:"):
    #         payload["format"] = "json"
    # except Exception:
    #     payload["format"] = "json"
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(LLM_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        logger.info(f"🔍 LLM Response for model {mapped_model}: {result}")
        return result
        result = response.json()
        logger.info(f"🔍 LLM Response for model {mapped_model}: {result}")
        return result
    except Exception as e:
        logger.error(f"LLM API error: {e}")
        return None


def grade_essay_sync(
    essay: str,
    question: str,
    config_prompt: Dict[str, Any],
    professor_username: str,
    course_id: str,
    assignment_title: str,
    model: str,
    progress: GradingProgress,
    tone: str = "moderate",
    grading_brackets: List[Dict[str, str]] = None,
    criteria_data: List[Dict[str, Any]] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Grades a single essay using the stored config_prompt from the Assignment.
    Returns feedback and scores for each agent (criterion).
    """
    try:
        # Parse config_prompt if it contains JSON strings
        if isinstance(config_prompt, dict):
            parsed_config_prompt = []
            for criterion_name, prompt_data in config_prompt.items():
                if isinstance(prompt_data, str):
                    try:
                        parsed_prompt = json.loads(prompt_data)
                        parsed_config_prompt.append({
                            "criterionName": criterion_name,
                            "prompt": parsed_prompt
                        })
                    except json.JSONDecodeError as e:
                        logger.error(
                            f"Failed to parse prompt for criterion {criterion_name}: {e}")
                        # Use a default prompt structure
                        parsed_config_prompt.append({
                            "criterionName": criterion_name,
                            "prompt": {
                                "header": f"**{criterion_name}**",
                                "introduction": "Check if the essay meets these requirements:",
                                "instructions": ["Evaluate the essay based on this criterion"]
                            }
                        })
                else:
                    # Already parsed object
                    parsed_config_prompt.append({
                        "criterionName": criterion_name,
                        "prompt": prompt_data
                    })
            config_prompt = parsed_config_prompt
        # Step 1 & 2: Use Qdrant-based retrieval engine
        retrieval_engine = None
        try:
            from llamaindex_rag.llamaindex_retrieval import get_retrieval_engine

            # ⚡ Use global singleton retrieval engine
            retrieval_engine = get_retrieval_engine()

            # Learn vocabulary (cached internally by retrieval engine)
            retrieval_engine._learn_vocabulary(
                professor_username, course_id, assignment_title
            )

            # Analyze student's essay for quality/relevance
            essay_analysis = retrieval_engine.query_processor.analyze_query(
                essay)
            specificity_score = essay_analysis.specificity_score
            quality_multiplier = essay_analysis.similarity_boost

            logger.info(f"🎯 BULK ESSAY ANALYSIS - Text: '{essay[:50]}...'")
            logger.info(
                f"🎯 BULK ESSAY ANALYSIS - Specificity: {specificity_score:.3f}, Multiplier: {quality_multiplier:.2f}")

            # Conditional RAG retrieval using SAME retrieval engine (no duplicate initialization!)
            if specificity_score < 0.1:  # Skip RAG for gibberish responses
                course_context = "No context provided due to irrelevant response."
                supporting_context = ""
                has_supporting_docs = False
                course_context = "No context provided due to irrelevant response."
                supporting_context = ""
                has_supporting_docs = False
                logger.info(
                    f"⚠️ SKIPPING RAG RETRIEVAL - Essay {progress.current_essay_index + 1} too irrelevant (specificity: {specificity_score:.3f})")
            else:
                # Use the ALREADY INITIALIZED retrieval engine for dual RAG
                dual_results = retrieval_engine.retrieve_dual_context(
                    query=question,
                    professor_username=professor_username,
                    course_id=course_id,
                    assignment_title=assignment_title,
                    top_k=8  # Smaller for bulk processing
                )

                # Process course content results
                if dual_results['course_content']['total_results'] > 0:
                    course_chunks = []
                    total_length = 0
                    for result in dual_results['course_content']['results']:
                        chunk_text = result['text']
                        if total_length + len(chunk_text) > 3000:  # Smaller for bulk
                            break
                        course_chunks.append(chunk_text)
                        total_length += len(chunk_text)
                    course_context = "\n".join(course_chunks)
                else:
                    course_context = "No relevant course content available."

                # Process supporting docs results
                supporting_context = ""
                has_supporting_docs = dual_results['supporting_docs']['has_content']
                if has_supporting_docs and dual_results['supporting_docs']['total_results'] > 0:
                    supporting_chunks = []
                    total_length = 0
                    for result in dual_results['supporting_docs']['results']:
                        chunk_text = result['text']
                        # Smaller limit for supporting docs
                        if total_length + len(chunk_text) > 1500:
                            break
                        supporting_chunks.append(chunk_text)
                        total_length += len(chunk_text)
                    supporting_context = "\n".join(supporting_chunks)
                    course_context = "No relevant course content available."

                # Process supporting docs results
                supporting_context = ""
                has_supporting_docs = dual_results['supporting_docs']['has_content']
                if has_supporting_docs and dual_results['supporting_docs']['total_results'] > 0:
                    supporting_chunks = []
                    total_length = 0
                    for result in dual_results['supporting_docs']['results']:
                        chunk_text = result['text']
                        # Smaller limit for supporting docs
                        if total_length + len(chunk_text) > 1500:
                            break
                        supporting_chunks.append(chunk_text)
                        total_length += len(chunk_text)
                    supporting_context = "\n".join(supporting_chunks)

                logger.info(
                    f"📖 Course content: {len(course_context)} chars, Supporting docs: {len(supporting_context)} chars for essay {progress.current_essay_index + 1}/{progress.total_essays}")

        except Exception as e:
            logger.warning(
                f"Smart analysis/RAG failed, using default scoring: {e}")
            specificity_score = 0.5
            quality_multiplier = 1.0
            course_context = "No context available due to analysis error."
            supporting_context = ""
            has_supporting_docs = False
            course_context = "No context available due to analysis error."
            supporting_context = ""
            has_supporting_docs = False

        # Step 3: Assemble the prompts using get_prompt from agents.py (with quality awareness)
        assembled_prompts = get_prompt(
            config_prompt,
            tone=tone,
            quality_multiplier=quality_multiplier,
            specificity_score=specificity_score,
            has_supporting_docs=has_supporting_docs,
            grading_brackets=grading_brackets,
            criteria_data=criteria_data
        )
        if not assembled_prompts or "criteria_prompts" not in assembled_prompts:
            raise ValueError("Failed to assemble prompts")

        # Step 4: 🤖 USE LANGGRAPH AGENTS FOR PARALLEL GRADING
        logger.info(
            f"🤖 Using LangGraph agents for essay {progress.current_essay_index + 1}")

        from .gradingAgents import grade_with_agents_sync

        # Build rubric structure
        rubric = {
            "criteria": criteria_data or [],
            "gradingBrackets": grading_brackets or []
        }

        # Grade with agents (all criteria in parallel!)
        agent_result = grade_with_agents_sync(
            essay=essay,
            rubric=rubric,
            question=question,
            professor_username=professor_username,
            course_id=course_id,
            assignment_title=assignment_title,
            tone=tone,
            model=model  # Pass model to grading agents
        )

        # Extract AI detection information
        ai_confidence = agent_result.get("ai_confidence", 0.0)
        detected_issues = agent_result.get("detected_issues", [])

        # Determine AI risk level
        def get_ai_risk_level(confidence):
            if confidence >= 0.8:
                return "critical"
            elif confidence >= 0.6:
                return "high"
            elif confidence >= 0.3:
                return "medium"
            else:
                return "low"

        ai_risk_level = get_ai_risk_level(ai_confidence)
        ai_detected = ai_confidence >= 0.5

        # Check for length warnings
        length_warning = None
        for issue in detected_issues:
            if "warning_length_short" in issue:
                length_warning = "below_minimum"
            elif "warning_insufficient_words" in issue:
                length_warning = "insufficient_words"

        # Convert agent results to expected format
        grading_results = {}
        grading_results["_meta"] = {  # Add metadata for AI detection (won't be in Excel columns)
            "ai_detected": ai_detected,
            "ai_confidence": round(ai_confidence, 2),
            "ai_risk_level": ai_risk_level,
            "length_warning": length_warning
        }

        # Check if we have criterion scores (even if flagged, we still grade)
        has_scores = agent_result.get("criterion_scores") and len(agent_result.get("criterion_scores", {})) > 0
        has_detected_issues = agent_result.get("detected_issues") and len(agent_result.get("detected_issues", [])) > 0
        
        if has_scores:
            # We have scores - use them regardless of flagged status
            is_valid = not has_detected_issues  # Only mark as invalid if there are detected issues
            for criterion_name, score in agent_result["criterion_scores"].items():
                grading_results[criterion_name] = {
                    "score": round(score, 1),
                    "feedback": agent_result["feedbacks"].get(criterion_name, ""),
                    "original_score": score,
                    "quality_multiplier": agent_result.get("quality_multiplier", 1.0),
                    "specificity_score": agent_result.get("specificity_score", 0.5),
                    "agent_system": "langgraph",
                    "is_valid": is_valid,  # False if flagged, True otherwise
                    "detected_issues": agent_result.get("detected_issues", [])
                }
        else:
            # No scores available - this is an actual error
            if agent_result.get("detected_issues"):
                logger.warning(
                    f"⚠️ Issues detected but no scores in essay {progress.current_essay_index + 1}: {agent_result.get('detected_issues')}")
                # Still try to grade with 0 scores as fallback, but mark as flagged
                for criterion in (criteria_data or []):
                    grading_results[criterion['name']] = {
                        "score": 0,
                        "feedback": f"Flagged: {agent_result.get('final_feedback', 'Issues detected - grading failed')}",
                        "original_score": 0,
                        "quality_multiplier": agent_result.get("quality_multiplier", 1.0),
                        "specificity_score": agent_result.get("specificity_score", 0.5),
                        "agent_system": "langgraph",
                        "is_valid": False,
                        "detected_issues": agent_result.get("detected_issues", [])
                    }
            else:
                # Actual error
                logger.error(
                    f"❌ Agent grading failed for essay {progress.current_essay_index + 1}")
                for criterion in (criteria_data or []):
                    grading_results[criterion['name']] = {
                        "score": 0,
                        "feedback": "Agent grading failed",
                        "original_score": 0,
                        "quality_multiplier": quality_multiplier,
                        "specificity_score": specificity_score,
                        "is_valid": False,
                        "detected_issues": ["system_error"]
                    }

        # Update progress
        progress.completed_essays += 1
        progress.current_essay_index += 1
        logger.info(
            f"Completed essay {progress.current_essay_index}/{progress.total_essays} | AI Risk: {ai_risk_level}")
        return grading_results

    except Exception as e:
        logger.error(f"Error grading essay: {e}")
        progress.failed_essays += 1
        progress.current_essay_index += 1

        # Get criteria names from config_prompt to ensure we return a result for all criteria
        criteria = []
        if isinstance(config_prompt, dict) and "criteria_prompts" in config_prompt:
            criteria = list(config_prompt["criteria_prompts"].keys())
        elif criteria_data:
            criteria = [c['name'] for c in criteria_data]

        # Return error result with is_valid=False and empty _meta
        result = {
            "_meta": {
                "ai_detected": False,
                "ai_confidence": 0.0,
                "ai_risk_level": "low",
                "length_warning": None,
                "is_valid": False
            }
        }
        for criterion in criteria:
            result[criterion] = {
                "score": 0,
                "feedback": f"Error grading: {str(e)[:200]}",
                "is_valid": False,
                "detected_issues": ["system_error"]
            }
        return result


def run_batched_grading(
    essays: List[str],
    question: str,
    config_prompt: Dict[str, Any],
    professor_username: str,
    course_id: str,
    assignment_title: str,
    model: str,
    tone: str = "moderate",
    grading_brackets: List[Dict[str, str]] = None,
    criteria_data: List[Dict[str, Any]] = None,
    batch_size: int = None,
    progress_callback: Optional[callable] = None
) -> List[Dict[str, Dict[str, Any]]]:
    """
    Runs grading on multiple essays in batches to prevent context overflow.
    Processes essays in small batches (default: 3) to manage memory and context.
    """
    # Determine batch size with safety checks
    if batch_size is None:
        batch_size = DEFAULT_BATCH_SIZE
    else:
        batch_size = max(MIN_BATCH_SIZE, min(MAX_BATCH_SIZE, batch_size))

    logger.info(
        f"Starting batched grading of {len(essays)} essays in batches of {batch_size}...")

    # Pre-allocate results list to maintain order
    grading_results = [None] * len(essays)
    total_batches = (len(essays) + batch_size - 1) // batch_size

    # Process batches in parallel using ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS) as executor:
        # Submit all batch tasks
        future_to_batch = {}
        for batch_idx in range(total_batches):
            start_idx = batch_idx * batch_size
            end_idx = min(start_idx + batch_size, len(essays))
            batch_essays = essays[start_idx:end_idx]

            logger.info(
                f"🔄 Submitting batch {batch_idx + 1}/{total_batches} (essays {start_idx + 1}-{end_idx})")

            future = executor.submit(
                run_threaded_grading,
                batch_essays, question, config_prompt,
                professor_username, course_id, assignment_title, model, tone, grading_brackets, criteria_data
            )
            future_to_batch[future] = (batch_idx, start_idx, batch_essays)

        # Process completed batches as they finish
        for future in as_completed(future_to_batch):
            batch_idx, start_idx, batch_essays = future_to_batch[future]
            try:
                batch_results = future.result()

                # Store results in correct positions
                for i, result in enumerate(batch_results):
                    grading_results[start_idx + i] = result

                logger.info(
                    f"✅ Completed batch {batch_idx + 1}/{total_batches}")

                # Update progress callback AFTER batch completion
                if progress_callback:
                    progress_callback({
                        'batch': batch_idx + 1,
                        'total_batches': total_batches,
                        'batch_start': start_idx + 1,
                        'batch_end': start_idx + len(batch_essays),
                        'message': f'Completed batch {batch_idx + 1}/{total_batches}'
                    })

            except Exception as e:
                logger.error(
                    f"❌ Failed to process batch {batch_idx + 1}/{total_batches}: {e}")

                # Mark all essays in this batch as failed
                for i in range(len(batch_essays)):
                    grading_results[start_idx + i] = {
                        criterion: {
                            "score": 0, "feedback": f"Batch processing failed: {str(e)}"}
                        for criterion in (config_prompt.get("criteria_prompts", {}).keys() if isinstance(config_prompt, dict) else [])
                    }

        # Memory cleanup between batches
        gc.collect()

        # Small delay between batches to prevent resource exhaustion
        if batch_idx < total_batches - 1:  # Don't delay after last batch
            time.sleep(1)

    completed_count = len([r for r in grading_results if r is not None])
    failed_count = len([r for r in grading_results if r is None])

    logger.info(
        f"✅ Completed batched grading: {completed_count} essays processed, {failed_count} failed")

    # Send final completion progress callback
    if progress_callback:
        progress_callback({
            'batch': total_batches,
            'total_batches': total_batches,
            'batch_start': len(essays),
            'batch_end': len(essays),
            'message': f'Completed all {total_batches} batches: {completed_count} essays processed, {failed_count} failed'
        })

    return grading_results


def run_threaded_grading(
    essays: List[str],
    question: str,
    config_prompt: Dict[str, Any],
    professor_username: str,
    course_id: str,
    assignment_title: str,
    model: str,
    tone: str = "moderate",
    grading_brackets: List[Dict[str, str]] = None,
    criteria_data: List[Dict[str, Any]] = None
) -> List[Dict[str, Dict[str, Any]]]:
    """
    Runs grading on a small batch of essays in parallel using threading.
    This is now used internally by run_batched_grading for processing individual batches.
    """
    logger.info(
        f"Starting threaded grading of {len(essays)} essays in batch...")
    # Pre-allocate results list to maintain order
    grading_results = [None] * len(essays)
    progress = GradingProgress(total_essays=len(essays))

    # Use context manager to ensure proper cleanup
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS) as executor:
        try:
            # Submit all tasks and map them to their original indices
            future_to_index = {
                executor.submit(
                    grade_essay_sync,
                    essay, question, config_prompt,
                    professor_username, course_id, assignment_title, model, progress, tone, grading_brackets, criteria_data
                ): i
                for i, essay in enumerate(essays)
            }

            for future in as_completed(future_to_index):
                idx = future_to_index[future]
                try:
                    result = future.result()
                    grading_results[idx] = result
                except Exception as e:
                    logger.error(f"Grading failed for essay index {idx}: {e}")

                    # Get criteria names to ensure we return a result for all criteria
                    criteria = []
                    if isinstance(config_prompt, dict) and "criteria_prompts" in config_prompt:
                        criteria = list(
                            config_prompt["criteria_prompts"].keys())

                    grading_results[idx] = {
                        criterion: {"score": 0, "feedback": f"Error: {str(e)}"}
                        for criterion in criteria
                    }
        finally:
            # Explicitly shutdown the executor and clear futures
            executor.shutdown(wait=True)
            future_to_index.clear()
            # Force garbage collection to ensure resources are released
            gc.collect()

    logger.info(
        f"Completed threaded grading: {progress.completed_essays} essays. Failed: {progress.failed_essays}")
    return grading_results


def download_file_from_s3(s3_key: str, bucket: str = None) -> BytesIO:
    """Download a file from S3 bucket."""
    bucket_to_use = bucket if bucket else S3_BUCKET
    logger.info(f"Downloading file from S3: bucket={bucket_to_use}, key={s3_key}")
    try:
        response = s3_client.get_object(Bucket=bucket_to_use, Key=s3_key)
        return BytesIO(response["Body"].read())
    except Exception as e:
        logger.error(f"Failed to download from S3: {str(e)}")
        raise


def upload_file_to_s3(file_obj: BytesIO, s3_key: str) -> str:
    """Upload a file to S3 bucket and return the URL."""
    try:
        s3_client.upload_fileobj(file_obj, S3_BUCKET, s3_key)
        # ✅ this works with MinIO
        url = f"{MINIO_ENDPOINT}/{S3_BUCKET}/{s3_key}"
        logger.info(f"Uploaded to S3: {url}")
        return url
    except Exception as e:
        logger.error(f"S3 upload failed: {str(e)}")
        raise


@bulkGrading_bp.route('/grade_bulk_essays', methods=['POST'])
def grade_bulk_essays() -> Tuple[Dict[str, Any], int]:
    """
    Grades multiple essays from an Excel file.
    Expects a POST request with courseId, assignmentTitle, config_prompt, question, username, s3_excel_link, and optional tone.
    Returns a link to a graded Excel file with feedback and scores for each criterion.
    """
    try:
        # Expect JSON data
        data = request.get_json()
        required_fields = ["courseId", "assignmentTitle",
                           "config_prompt", "question", "username", "s3_excel_link"]
        task_id = data.get("taskId")  # Optional taskId for progress updates
        task_id = data.get("taskId")  # Optional taskId for progress updates
        if not data or not all(field in data for field in required_fields):
            missing = [] if not data else [f for f in required_fields if f not in data]
            logger.warning(
                f"400 Missing required fields: expected={required_fields}, missing={missing}, got_keys={list(data.keys()) if data else None}")
            return jsonify({"error": f"Missing required fields: {', '.join(required_fields)}"}), 400

        course_id = data["courseId"]
        assignment_title = str(data["assignmentTitle"])
        assignment_title = str(data["assignmentTitle"])
        config_prompt = data["config_prompt"]
        question = data["question"]
        professor_username = data["username"]
        s3_excel_link = data["s3_excel_link"]
        model = data.get("model", DEFAULT_MODEL)
        tone = data.get("tone", "moderate")  # Get tone or use default

        # Disable progress callback to prevent race conditions with worker updates
        # The worker handles all progress updates to avoid conflicts
        progress_callback = None

        # Disable progress callback to prevent race conditions with worker updates
        # The worker handles all progress updates to avoid conflicts
        progress_callback = None

        # Parse S3 path from link
        parsed_url = urlparse(s3_excel_link)
        s3_key = unquote(parsed_url.path.lstrip("/"))  # Removes leading '/'

        # Detect bucket from S3 key if it's included (e.g., "essaybot-uat/path/to/file")
        # Check if key starts with known bucket names
        detected_bucket = None
        if s3_key.startswith("essaybot-uat/"):
            detected_bucket = "essaybot-uat"
            s3_key = s3_key[len("essaybot-uat/"):]  # Strip bucket prefix
        elif s3_key.startswith("essaybot/"):
            detected_bucket = "essaybot"
            s3_key = s3_key[len("essaybot/"):]  # Strip bucket prefix
        elif s3_key.startswith(f"{S3_BUCKET}/"):
            # Fallback to environment variable bucket
            detected_bucket = S3_BUCKET
            s3_key = s3_key[len(S3_BUCKET) + 1:]

        # Use detected bucket if found, otherwise use environment variable
        bucket_to_use = detected_bucket if detected_bucket else S3_BUCKET
        logger.info(f"Parsed S3 key: {s3_key}")
        logger.info(f"Using S3 bucket: {bucket_to_use} (detected: {detected_bucket}, env: {S3_BUCKET})")
        folder = "/".join(s3_key.split("/")[:-1])
        logger.info(f"Parsed folder: {folder}")

        # Download and read the file using the correct bucket
        file_obj = download_file_from_s3(s3_key, bucket=bucket_to_use)
        logger.info(f"Downloaded file from S3: {s3_key}")
        logger.info(f"Downloaded file from S3: {s3_key}")

        # Check file extension and read accordingly
        if s3_key.lower().endswith('.csv'):
            logger.info("Attempting to read CSV file")
            df = None

            # Try different CSV parsing strategies
            parsing_strategies = [
                # Strategy 1: Default pandas CSV reading
                lambda f: pd.read_csv(f),
                # Strategy 2: With explicit delimiter detection
                lambda f: pd.read_csv(f, sep=None, engine='python'),
                # Strategy 3: With tab delimiter
                lambda f: pd.read_csv(f, sep='\t'),
                # Strategy 4: With semicolon delimiter
                lambda f: pd.read_csv(f, sep=';'),
                # Strategy 5: With pipe delimiter
                lambda f: pd.read_csv(f, sep='|'),
                # Strategy 6: With quoting to handle commas in fields
                lambda f: pd.read_csv(f, quoting=1),  # QUOTE_ALL
                # Strategy 7: With error handling for bad lines
                lambda f: pd.read_csv(f, on_bad_lines='warn'),
                # Strategy 8: With on_bad_lines='skip'
                lambda f: pd.read_csv(f, on_bad_lines='skip'),
                # Strategy 9: With more robust parsing
                lambda f: pd.read_csv(
                    f, quoting=3, escapechar='\\'),  # QUOTE_NONE
                # Strategy 10: With custom quote character
                lambda f: pd.read_csv(f, quotechar='"', escapechar='\\'),
                # Strategy 11: With doublequote handling
                lambda f: pd.read_csv(f, doublequote=True),
            ]

            encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1', 'utf-16']

            for encoding in encodings:
                if df is not None:
                    break

                for i, strategy in enumerate(parsing_strategies):
                    try:
                        file_obj.seek(0)  # Reset file pointer
                        df = strategy(file_obj)
                        logger.info(
                            f"Successfully read CSV with encoding: {encoding}, strategy: {i+1}")
                        break
                    except (UnicodeDecodeError, UnicodeError) as e:
                        logger.warning(
                            f"Encoding error with encoding: {encoding}, strategy: {i+1}: {str(e)}")
                        break  # Try next encoding
                    except Exception as e:
                        logger.warning(
                            f"Strategy {i+1} failed with encoding {encoding}: {str(e)}")
                        continue  # Try next strategy

            if df is None:
                logger.error(
                    "Failed to read CSV with any supported encoding or parsing strategy")
                # Try to read the first few lines of the file to help debug
                try:
                    file_obj.seek(0)
                    content = file_obj.read(1000).decode(
                        'utf-8', errors='ignore')
                    logger.error(
                        f"First 1000 characters of file content: {repr(content)}")
                except Exception as debug_e:
                    logger.error(
                        f"Could not read file content for debugging: {debug_e}")

                # Final fallback: Try manual CSV parsing
                try:
                    logger.info("Attempting manual CSV parsing as last resort")
                    file_obj.seek(0)
                    content = file_obj.read().decode('utf-8', errors='ignore')
                    lines = content.split('\n')

                    # Find the header line
                    header_line = None
                    for i, line in enumerate(lines):
                        if 'id' in line.lower() and ('response' in line.lower() or 'essay' in line.lower() or 'answer' in line.lower()):
                            header_line = i
                            break

                    if header_line is not None:
                        # Parse manually
                        import csv
                        from io import StringIO

                        # Reconstruct CSV content starting from header
                        csv_content = '\n'.join(lines[header_line:])
                        csv_io = StringIO(csv_content)

                        # Try to parse with csv module
                        reader = csv.DictReader(csv_io)
                        data = list(reader)

                        if data:
                            df = pd.DataFrame(data)
                            logger.info(
                                "Successfully parsed CSV using manual fallback method")
                        else:
                            raise ValueError(
                                "No data found after manual parsing")
                    else:
                        raise ValueError(
                            "Could not find header line with ID and Response columns")

                except Exception as fallback_e:
                    logger.error(
                        f"Manual CSV parsing also failed: {fallback_e}")
                    return jsonify({
                        "error": "Could not read CSV file. Please ensure the file is properly formatted with 'ID' and 'Response' columns.",
                        "suggestions": [
                            "Check that your CSV file uses commas as delimiters",
                            "Ensure text fields containing commas are properly quoted",
                            "Verify the file encoding is UTF-8",
                            "Make sure the first row contains column headers",
                            "Try converting your file to Excel format (.xlsx) instead"
                        ]
                    }), 400
            logger.info("Attempting to read CSV file")
            df = None

            # Try different CSV parsing strategies
            parsing_strategies = [
                # Strategy 1: Default pandas CSV reading
                lambda f: pd.read_csv(f),
                # Strategy 2: With explicit delimiter detection
                lambda f: pd.read_csv(f, sep=None, engine='python'),
                # Strategy 3: With tab delimiter
                lambda f: pd.read_csv(f, sep='\t'),
                # Strategy 4: With semicolon delimiter
                lambda f: pd.read_csv(f, sep=';'),
                # Strategy 5: With pipe delimiter
                lambda f: pd.read_csv(f, sep='|'),
                # Strategy 6: With quoting to handle commas in fields
                lambda f: pd.read_csv(f, quoting=1),  # QUOTE_ALL
                # Strategy 7: With error handling for bad lines
                lambda f: pd.read_csv(f, on_bad_lines='warn'),
                # Strategy 8: With on_bad_lines='skip'
                lambda f: pd.read_csv(f, on_bad_lines='skip'),
                # Strategy 9: With more robust parsing
                lambda f: pd.read_csv(
                    f, quoting=3, escapechar='\\'),  # QUOTE_NONE
                # Strategy 10: With custom quote character
                lambda f: pd.read_csv(f, quotechar='"', escapechar='\\'),
                # Strategy 11: With doublequote handling
                lambda f: pd.read_csv(f, doublequote=True),
            ]

            encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1', 'utf-16']

            for encoding in encodings:
                if df is not None:
                    break

                for i, strategy in enumerate(parsing_strategies):
                    try:
                        file_obj.seek(0)  # Reset file pointer
                        df = strategy(file_obj)
                        logger.info(
                            f"Successfully read CSV with encoding: {encoding}, strategy: {i+1}")
                        break
                    except (UnicodeDecodeError, UnicodeError) as e:
                        logger.warning(
                            f"Encoding error with encoding: {encoding}, strategy: {i+1}: {str(e)}")
                        break  # Try next encoding
                    except Exception as e:
                        logger.warning(
                            f"Strategy {i+1} failed with encoding {encoding}: {str(e)}")
                        continue  # Try next strategy

            if df is None:
                logger.error(
                    "Failed to read CSV with any supported encoding or parsing strategy")
                # Try to read the first few lines of the file to help debug
                try:
                    file_obj.seek(0)
                    content = file_obj.read(1000).decode(
                        'utf-8', errors='ignore')
                    logger.error(
                        f"First 1000 characters of file content: {repr(content)}")
                except Exception as debug_e:
                    logger.error(
                        f"Could not read file content for debugging: {debug_e}")

                # Final fallback: Try manual CSV parsing
                try:
                    logger.info("Attempting manual CSV parsing as last resort")
                    file_obj.seek(0)
                    content = file_obj.read().decode('utf-8', errors='ignore')
                    lines = content.split('\n')

                    # Find the header line
                    header_line = None
                    for i, line in enumerate(lines):
                        if 'id' in line.lower() and ('response' in line.lower() or 'essay' in line.lower() or 'answer' in line.lower()):
                            header_line = i
                            break

                    if header_line is not None:
                        # Parse manually
                        import csv
                        from io import StringIO

                        # Reconstruct CSV content starting from header
                        csv_content = '\n'.join(lines[header_line:])
                        csv_io = StringIO(csv_content)

                        # Try to parse with csv module
                        reader = csv.DictReader(csv_io)
                        data = list(reader)

                        if data:
                            df = pd.DataFrame(data)
                            logger.info(
                                "Successfully parsed CSV using manual fallback method")
                        else:
                            raise ValueError(
                                "No data found after manual parsing")
                    else:
                        raise ValueError(
                            "Could not find header line with ID and Response columns")

                except Exception as fallback_e:
                    logger.error(
                        f"Manual CSV parsing also failed: {fallback_e}")
                    return jsonify({
                        "error": "Could not read CSV file. Please ensure the file is properly formatted with 'ID' and 'Response' columns.",
                        "suggestions": [
                            "Check that your CSV file uses commas as delimiters",
                            "Ensure text fields containing commas are properly quoted",
                            "Verify the file encoding is UTF-8",
                            "Make sure the first row contains column headers",
                            "Try converting your file to Excel format (.xlsx) instead"
                        ]
                    }), 400
        else:
            logger.info("Attempting to read Excel file")
            try:
                df = pd.read_excel(file_obj, engine='openpyxl')
                logger.info("Successfully read Excel file")
            except Exception as e:
                logger.error(f"Error reading Excel file: {str(e)}")
                return jsonify({"error": f"Error reading Excel file: {str(e)}"}), 400

        # Validate DataFrame structure
        logger.info(f"DataFrame columns: {list(df.columns)}")
        logger.info(f"DataFrame shape: {df.shape}")

        # Check for required columns (case-insensitive)
        df_columns_lower = [col.lower() for col in df.columns]
        id_col = None
        response_col = None

        for col in df.columns:
            col_lower = col.lower().replace(' ', '_')
            if col_lower in ['id', 'student_id', 'studentid', 'user_id', 'userid']:
                id_col = col
            elif col_lower in ['response', 'essay', 'answer', 'text', 'content']:
                response_col = col

        if id_col is None or response_col is None:
            logger.warning(
                f"400 ID/Response check failed: id_col={id_col}, response_col={response_col}, columns={list(df.columns)}")
            return jsonify({
                "error": f"File must contain 'ID' and 'Response' columns. Found columns: {list(df.columns)}",
                "suggestions": "Please ensure your file has columns named 'ID' (or similar) and 'Response' (or similar)"
            }), 400

        # Rename columns to standard format
        df = df.rename(columns={id_col: 'ID', response_col: 'Response'})
        logger.info(
            f"Renamed columns: {id_col} -> ID, {response_col} -> Response")

        # Check if DataFrame is empty
        if df.empty:
            logger.warning("400 DataFrame empty after load.")
            return jsonify({"error": "The uploaded file is empty or contains no data"}), 400

        # Check if required columns have data
        if df["ID"].isna().all() or df["Response"].isna().all():
            logger.warning(
                f"400 Required column has no data: ID_all_na={df['ID'].isna().all()}, Response_all_na={df['Response'].isna().all()}")
            return jsonify({"error": "The 'ID' and 'Response' columns must contain data"}), 400

        # Clean the data - remove rows with completely empty responses
        initial_count = len(df)
        df = df.dropna(subset=['Response'])
        df = df[df['Response'].astype(str).str.strip() != '']
        final_count = len(df)

        if final_count == 0:
            logger.warning(
                "400 No valid responses found after cleaning 'Response' column.")
            return jsonify({"error": "No valid responses found in the file after cleaning"}), 400

        if final_count < initial_count:
            logger.warning(
                f"Removed {initial_count - final_count} rows with empty responses")

        logger.info(f"Final DataFrame shape after cleaning: {df.shape}")

        # Question column validation (optional but enforced if present)
        question_cols = [c for c in df.columns if c.lower(
        ) in ["question", "prompt", "assignment_question"]]
        if question_cols:
            q_col = question_cols[0]
            logger.info(f"🔍 Found question column: '{q_col}'")
            logger.info(
                f"🔍 Raw question values in CSV: {df[q_col].dropna().tolist()[:3]}")

            # Normalize values: strip, collapse spaces, lowercase
            def _normalize_q(s: Any) -> str:
                try:
                    return " ".join(str(s).strip().split()).lower()
                except Exception:
                    return ""

            csv_questions = df[q_col].dropna().map(
                _normalize_q).unique().tolist()
            expected_q = _normalize_q(question)
            logger.info(f"🔍 Normalized expected question: {expected_q!r}")
            logger.info(f"🔍 Normalized CSV questions: {csv_questions}")

            # Remove empties
            csv_questions = [q for q in csv_questions if q]

            if len(csv_questions) == 0:
                logger.warning(
                    f"400 Question validation: no non-empty values in '{q_col}'. expected(normalized)={expected_q!r}")
                return jsonify({
                    "error": f"CSV contains a '{q_col}' column but no non-empty values found."
                }), 400

            if len(csv_questions) > 1:
                logger.warning(
                    f"400 Question validation: multiple distinct values in '{q_col}': {csv_questions[:5]}")
                return jsonify({
                    "error": f"CSV has multiple distinct question values in '{q_col}'.",
                    "csv_questions_detected": csv_questions[:5]
                }), 400

            if csv_questions[0] != expected_q:
                first_raw = df[q_col].dropna().iloc[0]
                logger.warning(
                    f"Question validation mismatch - proceeding anyway. expected(normalized)={expected_q!r}, csv(normalized)={csv_questions[0]!r}, first_raw={first_raw!r}")
                # Temporarily disable strict validation to allow grading to proceed
                # return jsonify({
                #     "error": "CSV question does not match the assignment question.",
                #     "expected_question": question,
                #     "csv_question": first_raw
                # }), 400

        # 🔒 ANONYMIZATION: Replace student IDs with random UUIDs
        anonymizer = StudentAnonymizer()
        original_student_ids = df["ID"].tolist()
        anonymized_student_ids = anonymizer.anonymize_student_ids(
            original_student_ids)

        # Create anonymized DataFrame for LLM processing
        anonymized_df = df.copy()
        anonymized_df["ID"] = anonymized_student_ids

        logger.info(
            f"BIAS REMOVAL: Anonymized {len(original_student_ids)} student IDs")
        # Log first 3 for debugging
        logger.info(f"Original IDs: {original_student_ids[:3]}...")
        # Log first 3 for debugging
        logger.info(f"Anonymous IDs: {anonymized_student_ids[:3]}...")

        # Also print to console for visibility
        print(f"\nAnonymized: {len(original_student_ids)} student IDs")
        print(f"Original IDs: {original_student_ids[:3]}...")
        print(f"Anonymous IDs: {anonymized_student_ids[:3]}...")
        print(f"Full anonymization mapping:")
        for i, (original, anonymous) in enumerate(zip(original_student_ids, anonymized_student_ids)):
            print(f"   {i+1:2d}. {str(original):20s} → {anonymous}")
        print()

        # Extract grading brackets and criteria from the request
        grading_brackets = data.get('gradingBrackets', [])
        criteria_data = data.get('criteria', [])
        logger.info(
            f"📊 Bulk grading - Grading brackets received: {len(grading_brackets)} brackets")
        logger.info(
            f"📊 Bulk grading - Criteria data received: {len(criteria_data)} criteria")
        if grading_brackets:
            logger.info(
                f"📊 Bulk grading - First bracket sample: {grading_brackets[0] if len(grading_brackets) > 0 else 'None'}")

        # Grade all essays using anonymized data with batching strategy
        grading_results = run_batched_grading(
            anonymized_df["Response"].tolist(),
            question, config_prompt, professor_username, course_id, assignment_title, model, tone, grading_brackets, criteria_data,
            progress_callback=progress_callback
        )

        # Additional cleanup to prevent resource leaks
        gc.collect()

        # Prepare output data
        # Get criteria names from the config_prompt
        if isinstance(config_prompt, dict) and "criteria_prompts" in config_prompt:
            criteria = list(config_prompt["criteria_prompts"].keys())
        else:
            # If we can't determine criteria from config_prompt, try to get them from the first result
            if grading_results and grading_results[0]:
                criteria = list(grading_results[0].keys())
            else:
                return jsonify({"error": "Failed to determine grading criteria"}), 500

        de_anonymized_ids = anonymizer.de_anonymize_student_ids(
            anonymized_student_ids)

        # Create output DataFrame with original student IDs
        output_data = {"ID": de_anonymized_ids, "Response": df["Response"]}

        logger.info(f"De-anonymized {len(de_anonymized_ids)} student IDs")
        # Log first 3 for verification
        logger.info(f"Final IDs: {de_anonymized_ids[:3]}...")

        # Also print to console for visibility
        print(f"REMOVAL: De-anonymized {len(de_anonymized_ids)} student IDs")
        print(f"Final IDs: {de_anonymized_ids[:3]}...")
        print(f"De-anonymization complete!")
        print()
        de_anonymized_ids = anonymizer.de_anonymize_student_ids(
            anonymized_student_ids)

        # Create output DataFrame with original student IDs
        output_data = {"ID": de_anonymized_ids, "Response": df["Response"]}

        logger.info(f"De-anonymized {len(de_anonymized_ids)} student IDs")
        # Log first 3 for verification
        logger.info(f"Final IDs: {de_anonymized_ids[:3]}...")

        # Also print to console for visibility
        print(f"REMOVAL: De-anonymized {len(de_anonymized_ids)} student IDs")
        print(f"Final IDs: {de_anonymized_ids[:3]}...")
        print(f"De-anonymization complete!")
        print()

        # Add feedback and scores for each criterion
        for criterion in criteria:
            output_data[f"{criterion}_feedback"] = [
                result.get(criterion, {}).get("feedback", "No feedback")
                for result in grading_results
            ]
            output_data[f"{criterion}_score"] = [
                result.get(criterion, {}).get("score", 0)
                for result in grading_results
            ]

        # Calculate total score
        output_data["Total_Score"] = [
            sum(result.get(c, {}).get("score", 0) for c in criteria)
            for result in grading_results
        ]
        
        # Add AI detection and validation fields to Excel file
        # is_valid: False if ANY criterion has is_valid=False, otherwise True
        output_data["is_valid"] = [
            (
                # Check if any criterion has is_valid=False
                not any(
                    result.get(criterion, {}).get("is_valid", True) == False
                    for criterion in criteria
                )
            )
            for result in grading_results
        ]
        output_data["ai_detected"] = [
            result.get("_meta", {}).get("ai_detected", False)
            for result in grading_results
        ]
        output_data["ai_risk_level"] = [
            result.get("_meta", {}).get("ai_risk_level", "low")
            for result in grading_results
        ]
        output_data["ai_confidence"] = [
            round(result.get("_meta", {}).get("ai_confidence", 0.0) * 100, 1)
            for result in grading_results
        ]
        output_data["detected_issues"] = [
            ", ".join(result.get("_meta", {}).get("detected_issues", []))
            if result.get("_meta", {}).get("detected_issues")
            else (
                ", ".join(result.get(criteria[0] if criteria else "", {}).get("detected_issues", []))
                if criteria and result.get(criteria[0], {}).get("detected_issues")
                else ""
            )
            for result in grading_results
        ]

        # Create output Excel file
        output_df = pd.DataFrame(output_data)
        # Use a Minio-compatible timestamp format (YYYY-MM-DD-HH-mm-ss)
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        output_key = f"{folder}/gradedFiles/graded_response_{timestamp}.xlsx"
        output_buffer = BytesIO()
        output_df.to_excel(output_buffer, index=False)
        output_buffer.seek(0)

        # Upload to S3
        s3_url = upload_file_to_s3(output_buffer, output_key)

        return jsonify({
            "message": "Bulk essays graded successfully",
            "s3_graded_link": s3_url,
            "total_essays": len(df),
            "completed_essays": len([r for r in grading_results if r is not None]),
            "failed_essays": len([r for r in grading_results if r is None])
        }), 200

    except Exception as e:
        logger.error(f"Error grading bulk essays: {str(e)}")
        return jsonify({"error": str(e)}), 500
