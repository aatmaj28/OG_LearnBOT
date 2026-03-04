from flask import Flask, request, jsonify, Blueprint
import json
import logging
import requests
import os
import sys
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
    load_dotenv('.env.local', override=True)  # Override with .env.local in development

prompt_bp = Blueprint("prompt", __name__)

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# LLM API settings
# LLM_API_URL = os.getenv("OLLAMA_URL", "http://localhost:5000/api/generate")
LLM_API_URL = os.getenv("OLLAMA_URL", "http://129.10.156.97:8000/v1/completions")

def clean_llm_response(response_text):
    """
    Clean the LLM response by removing markdown code blocks and extracting JSON.
    
    Args:
        response_text (str): Raw response from LLM
        
    Returns:
        str: Cleaned JSON string
    """
    # Handle the specific SGLang format: ```\n\n```json\n{...}\n```
    # First try to extract JSON from markdown code blocks with proper brace matching
    json_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', response_text, flags=re.DOTALL)
    if json_match:
        response_text = json_match.group(1)
    else:
        # Fallback: remove all markdown and find JSON with proper brace counting
        response_text = re.sub(r'```.*?```', '', response_text, flags=re.DOTALL)
        response_text = re.sub(r'```json\s*', '', response_text)
        response_text = re.sub(r'```\s*', '', response_text)
        
        # Find the JSON object by counting braces
        start_idx = response_text.find('{')
        if start_idx != -1:
            brace_count = 0
            end_idx = start_idx
            for i in range(start_idx, len(response_text)):
                if response_text[i] == '{':
                    brace_count += 1
                elif response_text[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i
                        break
            if brace_count == 0:
                response_text = response_text[start_idx:end_idx + 1]
    
    # Remove any leading/trailing whitespace
    response_text = response_text.strip()
    
    return response_text


def sanitize_llm_json_response(text: str) -> str:
    """Remove markdown code fences and trim whitespace to aid JSON parsing."""
    import re as _re
    text = _re.sub(r"```json\s*", "", text)
    text = _re.sub(r"```\s*$", "", text)
    return text.strip()


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


def send_post_request(prompt, temperature=0.3, top_p=0.1, max_tokens=2048, model=None):
    """Send a request to the remote LLM API."""
    # Get model from central config
    mapped_model = get_model_name(model)
    
    payload = {
        "model": mapped_model,
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
    }
    
    
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(LLM_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        logger.info(f"LLM Response for model {mapped_model}: {result}")
        return result
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to get response from LLM server: {e}")
        return None


def generate_criterion_prompt(criterion, agent_index, model):
    """
    Uses LLM to generate the evaluation instructions for a single criterion in JSON format.

    Args:
        criterion (dict): The criterion details.
        agent_index (int): The index of the agent (e.g., 2 for "Agent 2").

    Returns:
        str: The generated prompt as a JSON string, or None if failed.
    """
    llm_instruction = f"""
You are an expert prompt engineer. Generate 2-3 focused evaluation points for the criterion '{criterion['name']}'. 

Requirements:
- Each point should be ONE specific thing to check in the essay
- Use simple, direct language (avoid complex phrasing)
- Focus ONLY on this criterion, not general essay quality
- Keep each instruction under 15 words

Criterion: {json.dumps(criterion)}

Return EXACTLY ONE JSON object and nothing else (no markdown, no code fences, no explanations, no trailing commas):
{{
  "instructions": [
    "<check 1>",
    "<check 2>",
    "<check 3>"
  ]
}}
"""

    # Retry logic for empty/invalid responses
    max_retries = 2
    for attempt in range(max_retries + 1):
        response = send_post_request(
            llm_instruction, temperature=0.3, top_p=0.1, max_tokens=2048, model=model)
        
        if not response or "choices" not in response or not response["choices"]:
            logger.warning(f"Empty or invalid response from LLM for criterion {criterion['name']} (attempt {attempt + 1})")
            if attempt < max_retries:
                # Add more explicit instruction on retry
                llm_instruction = llm_instruction + "\n\nCRITICAL: You MUST return a JSON object with an 'instructions' array. Do NOT return empty text."
                continue
            else:
                logger.error(f"Failed to get valid response after {max_retries + 1} attempts for criterion: {criterion['name']}")
                break
        
        response_text = response["choices"][0]["text"]
        logger.info(f"Raw LLM response text for criterion {criterion['name']} (attempt {attempt + 1}): {response_text[:200]}")
        
        # Check for empty response
        if not response_text or len(response_text.strip()) == 0:
            logger.warning(f"Empty response from LLM for criterion {criterion['name']} (attempt {attempt + 1})")
            if attempt < max_retries:
                # Add more explicit instruction on retry
                llm_instruction = llm_instruction + "\n\nCRITICAL: You MUST return a JSON object with an 'instructions' array. Do NOT return empty text."
                continue
            else:
                logger.error(f"Empty response after {max_retries + 1} attempts for criterion: {criterion['name']}")
                break
        
        try:
            # Clean the response to remove markdown code blocks
            cleaned_response = clean_llm_response(response_text)
            logger.info(f"Cleaned LLM response for criterion {criterion['name']}: {cleaned_response[:200]}")
            
            # Check if cleaned response is still empty
            if not cleaned_response or len(cleaned_response.strip()) == 0:
                logger.warning(f"Cleaned response is empty for criterion {criterion['name']} (attempt {attempt + 1})")
                if attempt < max_retries:
                    llm_instruction = llm_instruction + "\n\nCRITICAL: You MUST return a JSON object with an 'instructions' array. Do NOT return empty text."
                    continue
                else:
                    break
            
            # Try direct JSON parsing first since clean_llm_response already extracted the JSON
            result = None
            try:
                result = json.loads(cleaned_response)
            except json.JSONDecodeError:
                # Fallback to the more complex parsing
                result = try_parse_json_object(cleaned_response)
            
            if result is None:
                logger.warning(f"Could not parse JSON for criterion {criterion['name']} (attempt {attempt + 1})")
                if attempt < max_retries:
                    llm_instruction = llm_instruction + "\n\nCRITICAL: You MUST return a valid JSON object. Return ONLY this format: {\"instructions\": [\"check 1\", \"check 2\", \"check 3\"]}"
                    continue
                else:
                    logger.error(f"Invalid response format from LLM for criterion: {criterion['name']}")
                    break
            if "instructions" not in result or not isinstance(result["instructions"], list):
                logger.warning(f"Missing 'instructions' array in result for criterion {criterion['name']} (attempt {attempt + 1})")
                if attempt < max_retries:
                    llm_instruction = llm_instruction + "\n\nCRITICAL: You MUST return a JSON object with an 'instructions' array containing 2-3 evaluation points."
                    continue
                else:
                    logger.error(f"Invalid response format from LLM for criterion: {criterion['name']}")
                    break

            # Ensure the instructions are limited to 2-3 (simplified)
            if len(result["instructions"]) > 3:
                result["instructions"] = result["instructions"][:3]
            elif len(result["instructions"]) < 2:
                logger.warning(
                    f"LLM generated fewer than 2 instructions for criterion: {criterion['name']}")
                # Accept what the LLM provides, even if fewer than expected

            # Construct the prompt as a JSON object
            prompt_data = {
                "header": f"**{criterion['name']} (Max: {criterion['weight']} points)**",
                "introduction": f"Check if the essay meets these requirements:",
                "instructions": result["instructions"]
            }

            # Return the prompt as a JSON string
            return json.dumps(prompt_data)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode error for criterion {criterion['name']} (attempt {attempt + 1}): {str(e)}")
            if attempt < max_retries:
                llm_instruction = llm_instruction + "\n\nCRITICAL: You MUST return a valid JSON object. Return ONLY this format: {\"instructions\": [\"check 1\", \"check 2\", \"check 3\"]}"
                continue
            else:
                logger.error(f"Failed to parse LLM response for criterion: {criterion['name']}, error: {str(e)}")
                break
        except Exception as e:
            logger.warning(f"Unexpected error for criterion {criterion['name']} (attempt {attempt + 1}): {str(e)}")
            if attempt < max_retries:
                continue
            else:
                logger.error(f"Unexpected error processing response for criterion: {criterion['name']}, error: {str(e)}")
                break
    
    # If we get here, all retries failed - return a default prompt
    logger.error(f"All retries failed for criterion: {criterion['name']}, returning default prompt")
    prompt_data = {
        "header": f"**{criterion['name']} (Max: {criterion['weight']} points)**",
        "introduction": f"Evaluate the essay based on: {criterion.get('description', criterion['name'])}",
        "instructions": [
            f"Check if the essay addresses {criterion['name']}",
            f"Assess the quality and depth of the response"
        ]
    }
    return json.dumps(prompt_data)


@prompt_bp.route('/generate_prompt', methods=['POST'])
def generate_prompt():
    """
    Generates prompts for a rubric and returns them to be stored in Node.js.
    Expects a POST request with criteria JSON, username, courseId, and assignmentTitle.
    """
    try:
        data = request.get_json()
        required_fields = ["criteria", "username",
                           "courseId", "assignmentTitle", "model"]
        if not data or not all(field in data for field in required_fields):
            return jsonify({"error": f"Missing required fields: {', '.join(required_fields)}"}), 400

        rubric_json = data["criteria"]

        # Validate rubric_json
        if not isinstance(rubric_json, list):
            return jsonify({"error": "Criteria must be a list of criterion objects"}), 400

        # Generate prompts for each criterion
        criteria_prompts = {}
        # Start agent index at 1
        for idx, criterion in enumerate(rubric_json, start=1):
            prompt = generate_criterion_prompt(
                criterion, agent_index=idx, model=data["model"])
            if not prompt:
                return jsonify({"error": f"Failed to generate prompt for criterion: {criterion['name']}"}), 500
            criteria_prompts[criterion["name"]] = prompt
            logger.info(f"Generated prompt for criterion: {criterion['name']}")

        # Prepare the response in a flatter format
        return jsonify({
            "message": "Prompts generated successfully",
            "criteria_prompts": criteria_prompts
        }), 200
    except Exception as e:
        logger.error(f"Error generating prompts: {e}")
        return jsonify({"error": str(e)}), 500
