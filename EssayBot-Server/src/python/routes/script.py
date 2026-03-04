from agents import get_prompt  # Import get_prompt from agents.py
import json
import uuid  # Add UUID for anonymization
import uuid  # Add UUID for anonymization
from flask import Flask, request, jsonify, Blueprint
import logging
import requests
from .rag_pipeline import retrieve_relevant_text
import sys
import os
import re
from dotenv import load_dotenv
import re
from dotenv import load_dotenv
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

# Import central model configuration
from config.model_config import get_model_name, get_model_parameters

# Load environment variables conditionally based on NODE_ENV
load_dotenv()  # Always load .env first
if os.environ.get('NODE_ENV') == 'development':
    # Override with .env.local in development
    load_dotenv('.env.local', override=True)

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

singleGrading_bp = Blueprint("singleGrading", __name__)

# LLM API settings
# LLM_API_URL = os.getenv("OLLAMA_URL", "http://localhost:5001/api/generate")
LLM_API_URL = os.getenv("OLLAMA_URL", "http://129.10.156.97:8000/v1/completions")

# Model name mapper - now uses central config
def map_model_id(model: str) -> str:
    """Map frontend/alias model names to vLLM served ids."""
    return get_model_name(model)


class StudentAnonymizer:
    """
    Handles anonymization and de-anonymization of student IDs to remove bias from LLM grading.
    """

    def __init__(self):
        self.original_to_anonymous = {}
        self.anonymous_to_original = {}

    def anonymize_student_id(self, student_id: str) -> str:
        """
        Replace a single student ID with a random UUID to remove bias.

        Args:
            student_id: Original student ID

        Returns:
            Anonymized UUID
        """
        if student_id not in self.original_to_anonymous:
            # Generate a new UUID for this student ID
            anonymous_id = f"{str(uuid.uuid4())[:8].upper()}"
            self.original_to_anonymous[student_id] = anonymous_id
            self.anonymous_to_original[anonymous_id] = student_id

        logger.info(
            f"🔒 ANONYMIZED student ID: {student_id} -> {self.original_to_anonymous[student_id]}")
        return self.original_to_anonymous[student_id]

    def de_anonymize_student_id(self, anonymous_id: str) -> str:
        """
        Convert an anonymized UUID back to original student ID.

        Args:
            anonymous_id: Anonymized UUID

        Returns:
            Original student ID
        """
        if anonymous_id in self.anonymous_to_original:
            original_id = self.anonymous_to_original[anonymous_id]
            logger.info(
                f"🔓 DE-ANONYMIZED student ID: {anonymous_id} -> {original_id}")
            return original_id
        else:
            # Fallback: if we can't find the mapping, return the anonymous ID
            logger.warning(f"⚠️ Could not de-anonymize ID: {anonymous_id}")
            return anonymous_id


def send_post_request(prompt, temperature=0.2, top_p=0.1, max_tokens=2048, model=None):
    """Send a request to the remote LLM API."""
    model = map_model_id(model)
    payload = {
        "model": model,
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
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to get response from LLM server: {e}")
        return None


def clean_llm_response(response_text: str) -> str:
    """Remove markdown code fences and trim whitespace to aid JSON parsing."""
    response_text = re.sub(r"```json\s*", "", response_text)
    response_text = re.sub(r"```\s*$", "", response_text)
    return response_text.strip()


def sanitize_llm_json_response(text: str) -> str:
    """Normalize quotes, strip backticks and control chars for safer JSON parsing."""
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("‘", "'").replace("’", "'")
    text = text.replace("`", "")
    return re.sub(r"[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]", " ", text)


def try_parse_json_object(text: str):
    """Attempt to parse a JSON object with light repairs and bracket extraction."""
    try:
        return json.loads(text)
    except Exception:
        pass
    sanitized = sanitize_llm_json_response(text)
    try:
        return json.loads(sanitized)
    except Exception:
        pass
    # Balanced-brace extraction of first JSON object

    def _extract_first_balanced_json(s: str):
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


@singleGrading_bp.route('/grade_single_essay', methods=['POST'])
def grade_single_essay():
    """
    Grades a single essay using the stored config_prompt from the Assignment.
    Expects a POST request with courseId, assignmentId, essay, config_prompt, question, and username.
    Returns feedback and scores for each agent (criterion).
    """
    grading_results = {}
    try:
        # Expect JSON from Node.js: {courseId, assignmentId, essay, config_prompt, question, username}
        data = request.get_json()
        required_fields = ["courseId", "assignmentId",
                           "essay", "config_prompt", "question", "username"]
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": f"Missing required fields: {', '.join(required_fields)}"}), 400

        course_id = data["courseId"]
        assignment_title = str(data["assignmentId"])
        essay = data["essay"]
        config_prompt = data["config_prompt"]
        question = data["question"]
        professor_username = data["username"]

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

        # Step 1 & 2: Optimized single initialization for both essay analysis and RAG
        retrieval_engine = None
        try:
            from llamaindex_rag.llamaindex_retrieval import get_retrieval_engine

            # Debug: Log what we're actually analyzing
            logger.info(
                f"🔍 DEBUG: About to analyze student essay: '{essay[:100]}...'")
            logger.info(f"🔍 DEBUG: Assignment question: '{question[:100]}...'")

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

            logger.info(f"🎯 ESSAY ANALYSIS - Text: '{essay[:50]}...'")
            logger.info(
                f"🎯 ESSAY ANALYSIS - Specificity: {specificity_score:.3f}, Multiplier: {quality_multiplier:.2f}")

            # Conditional RAG retrieval using SAME retrieval engine (no duplicate initialization!)
            if specificity_score < 0.1:  # Skip RAG for gibberish responses
                course_context = "No context provided due to irrelevant response."
                supporting_context = ""
                has_supporting_docs = False
                logger.info(
                    f"⚠️ SKIPPING RAG RETRIEVAL - Essay too irrelevant (specificity: {specificity_score:.3f})")
            else:
                # Use the ALREADY INITIALIZED retrieval engine for dual RAG
                dual_results = retrieval_engine.retrieve_dual_context(
                    query=question,
                    professor_username=professor_username,
                    course_id=course_id,
                    assignment_title=assignment_title,
                    top_k=10
                )

                # Process course content results
                if dual_results['course_content']['total_results'] > 0:
                    course_chunks = []
                    total_length = 0
                    for result in dual_results['course_content']['results']:
                        chunk_text = result['text']
                        if total_length + len(chunk_text) > 4000:
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
                        if total_length + len(chunk_text) > 2000:
                            break
                        supporting_chunks.append(chunk_text)
                        total_length += len(chunk_text)
                    supporting_context = "\n".join(supporting_chunks)

                logger.info(
                    f"📖 Course content: {len(course_context)} chars, Supporting docs: {len(supporting_context)} chars")

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
        # Instead of assembling all prompts at once, do it per-criterion with per-domain tone
        # Instead of assembling all prompts at once, do it per-criterion with per-domain tone
        grading_results = {}
        # Try to get the rubric criteria with tone info from the request if available
        rubric_criteria = data.get('currentRubric', {}).get(
            'mainCriteria') or data.get('criteria') or []

        # Normalize scoringLevels for each criterion to the LIST format [full, partial, minimal]
        def _normalize_scoring_levels(crit: dict) -> dict:
            try:
                sl = crit.get('scoringLevels')
                # If already a list, ensure it has 3 non-empty entries
                if isinstance(sl, list):
                    defaults = [
                        'Excellent performance in this criterion.',
                        'Satisfactory performance in this criterion.',
                        'Minimal performance in this criterion.'
                    ]
                    out = list(sl)[:3]
                    while len(out) < 3:
                        out.append(defaults[len(out)])
                    crit['scoringLevels'] = out
                    return crit
                # If a dict, convert to list [full, partial, minimal]
                if isinstance(sl, dict):
                    crit['scoringLevels'] = [
                        sl.get(
                            'full') or 'Excellent performance in this criterion.',
                        sl.get(
                            'partial') or 'Satisfactory performance in this criterion.',
                        sl.get(
                            'minimal') or 'Minimal performance in this criterion.'
                    ]
                    return crit
                # If missing/invalid, set list defaults
                crit['scoringLevels'] = [
                    'Excellent performance in this criterion.',
                    'Satisfactory performance in this criterion.',
                    'Minimal performance in this criterion.'
                ]
                return crit
            except Exception:
                crit['scoringLevels'] = [
                    'Excellent performance in this criterion.',
                    'Satisfactory performance in this criterion.',
                    'Minimal performance in this criterion.'
                ]
                return crit

        rubric_criteria = [
            _normalize_scoring_levels(
                dict(crit)) if isinstance(crit, dict) else crit
            for crit in rubric_criteria
        ]

        # Build a mapping from criterion name to tone
        criterion_tone_map = {}
        for crit in rubric_criteria:
            name = crit.get('name')
            tone = crit.get('tone', 'moderate')
            if name:
                criterion_tone_map[name] = tone

        # Extract grading brackets from the request
        grading_brackets = data.get('gradingBrackets', [])

        # Normalize the criteria array as well (used for weights/validation)
        try:
            if isinstance(data.get('criteria'), list):
                data['criteria'] = [
                    _normalize_scoring_levels(
                        dict(c)) if isinstance(c, dict) else c
                    for c in data['criteria']
                ]
        except Exception:
            pass
        logger.info(
            f"📊 Grading brackets received: {len(grading_brackets)} brackets")
        if grading_brackets:
            logger.info(
                f"📊 First bracket sample: {grading_brackets[0] if len(grading_brackets) > 0 else 'None'}")
            # Validate bracket structure
            for i, bracket in enumerate(grading_brackets):
                if not isinstance(bracket, dict):
                    logger.error(f"📊 Bracket {i} is not a dict: {bracket}")
                elif 'label' not in bracket or 'range' not in bracket:
                    logger.error(
                        f"📊 Bracket {i} missing required fields (label, range): {bracket}")

        # 🤖 USE LANGGRAPH AGENTS FOR PARALLEL GRADING
        logger.info("🤖 Using LangGraph multi-agent grading system")

        from .gradingAgents import grade_with_agents_sync

        # Build rubric structure from criteria
        rubric = {
            "criteria": data.get('criteria', []),
            "gradingBrackets": grading_brackets
        }

        # Grade with agents (all criteria in parallel!)
        agent_result = grade_with_agents_sync(
            essay=essay,
            rubric=rubric,
            question=question,
            professor_username=professor_username,
            course_id=course_id,
            assignment_title=assignment_title,
            tone=data.get('tone', 'moderate'),
            model=data.get('model')  # Pass model to grading agents
        )

        # Convert agent results to expected format
        if agent_result.get("success"):
            for criterion_name, score in agent_result["criterion_scores"].items():
                grading_results[criterion_name] = {
                    "score": round(score, 2),
                    "feedback": agent_result["feedbacks"].get(criterion_name, ""),
                    "quality_multiplier": agent_result.get("quality_multiplier", 1.0),
                    "specificity_score": agent_result.get("specificity_score", 0.5),
                    "agent_system": "langgraph"
                }
        else:
            # Check if this is gaming detection (has detected_issues) vs actual error
            if agent_result.get("detected_issues"):
                logger.warning(f"⚠️ Issues detected: {agent_result.get('detected_issues')}")
                # Still grade normally but mark as flagged - use actual scores if available
                for criterion in data.get('criteria', []):
                    criterion_name = criterion['name']
                    # Try to get actual scores from agent_result if available
                    actual_score = agent_result.get("criterion_scores", {}).get(criterion_name, 0)
                    actual_feedback = agent_result.get("feedbacks", {}).get(criterion_name, "")
                    
                    grading_results[criterion_name] = {
                        "score": round(actual_score, 2) if actual_score > 0 else 0,
                        "feedback": actual_feedback if actual_feedback else "Submission flagged for issues detected",
                        "quality_multiplier": agent_result.get("quality_multiplier", 1.0),
                        "specificity_score": agent_result.get("specificity_score", 0.5),
                        "agent_system": "langgraph"
                    }
            else:
                # Actual error
                logger.error(f"❌ Agent grading failed: {agent_result.get('error', 'Unknown error')}")
                for criterion in data.get('criteria', []):
                    grading_results[criterion['name']] = {
                        "error": "Agent grading failed",
                        "details": agent_result.get("error", "Unknown error")
                    }
        
        # Extract AI detection information
        ai_confidence = agent_result.get("ai_confidence", 0.0)
        detected_issues = agent_result.get("detected_issues", [])
        
        # Determine AI risk level for professor
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
        ai_detected = ai_confidence >= 0.5  # Flag if 50%+ confidence
        
        # Check for length warnings
        length_warning = None
        for issue in detected_issues:
            if "warning_length_short" in issue:
                length_warning = "below_minimum"
            elif "warning_insufficient_words" in issue:
                length_warning = "insufficient_words"
        
        # Build response with ALL detection fields
        response = {
            "message": "Essay graded successfully",
            "grading_results": grading_results,
            "success": agent_result.get("success", True),      # Grading completed successfully (has scores)
            "is_valid": agent_result.get("is_valid", True),    # No gaming/cheating detected
            "detected_issues": detected_issues,
            "final_score": agent_result.get("final_score", 0),
            "final_feedback": agent_result.get("final_feedback", ""),
            # AI Detection fields for professor review
            "ai_detected": ai_detected,
            "ai_confidence": round(ai_confidence, 2),  # 0.00 to 1.00
            "ai_confidence_percentage": round(ai_confidence * 100, 1),  # 0.0 to 100.0
            "ai_risk_level": ai_risk_level,  # "low", "medium", "high", "critical"
            "length_warning": length_warning  # null or "below_minimum" or "insufficient_words"
        }
        
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error grading essay: {e}")
        return jsonify({"error": str(e)}), 500
