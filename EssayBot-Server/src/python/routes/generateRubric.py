import os
import json
import logging
import random
import requests
import re
import sys
from typing import List, Dict, Any
from flask import Flask, request, jsonify, Blueprint
from dotenv import load_dotenv
from dotenv import load_dotenv

from .rag_pipeline import retrieve_relevant_text

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

# Import central model configuration
from config.model_config import get_model_name, get_model_parameters

# Load environment variables conditionally based on NODE_ENV
load_dotenv()  # Always load .env first
if os.environ.get('NODE_ENV') == 'development':
    load_dotenv('.env.local', override=True)  # Override with .env.local in development

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create a Flask blueprint for rubric generation
rubric_bp = Blueprint("rubric", __name__)

# Local LLM API configuration
# API_URL = os.getenv("OLLAMA_URL", "http://localhost:5000/api/generate")
API_URL = os.getenv("OLLAMA_URL", "http://129.10.156.97:8000/v1/completions")
DEFAULT_TEMPERATURE = 0.3
DEFAULT_TOP_P = 0.9
DEFAULT_MAX_TOKENS = 4000


def send_post_request(prompt: str, temperature=DEFAULT_TEMPERATURE,
                      top_p=DEFAULT_TOP_P, max_tokens=DEFAULT_MAX_TOKENS,
                      model=None, type=None) -> str:
    # Get model from central config
    mapped_model = get_model_name(model)
    
    payload = {
        "model": mapped_model,
        "model": mapped_model,
        "prompt": prompt,
        # "stream": False,
        # "stream": False,
        "temperature": temperature,
        # "top_p": top_p,
        "max_tokens": max_tokens,
        # "type": "json"
        # "top_p": top_p,
        "max_tokens": max_tokens,
        # "type": "json"
    }
    headers = {"Content-Type": "application/json"}
    logger.info(f"Sending request to local model: {model} -> {mapped_model}")
    logger.info(f"Sending request to local model: {model} -> {mapped_model}")
    try:
        response = requests.post(API_URL, json=payload, headers=headers)
        response.raise_for_status()
        # return response.json()["response"]
        return response.json()["choices"][0]["text"]
        # return response.json()["response"]
        return response.json()["choices"][0]["text"]
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling local model API: {str(e)}")
        raise


def generate_sample_rubric(question: str, context: List[str], guidelines: str = "", model: str = None) -> Dict[str, Any]:
    """Generate a single sample rubric for the given question and context."""
    logger.info(f"Generating a sample rubric using model: {model}...")
    try:
        context_text = ' '.join(context)
        
        # Build guidelines section
        guidelines_section = ""
        if guidelines and guidelines.strip():
            guidelines_section = f"""
        **ASSIGNMENT GUIDELINES (IMPORTANT):**
        {guidelines.strip()}
        
        """
        
        
        # Build guidelines section
        guidelines_section = ""
        if guidelines and guidelines.strip():
            guidelines_section = f"""
        **ASSIGNMENT GUIDELINES (IMPORTANT):**
        {guidelines.strip()}
        
        """
        
        prompt = f"""
        You are an expert educational assessment designer. Your task is to create a grading rubric based ONLY on the assignment question, course content, and guidelines provided below.
        You are an expert educational assessment designer. Your task is to create a grading rubric based ONLY on the assignment question, course content, and guidelines provided below.

        **ASSIGNMENT QUESTION:**
        **ASSIGNMENT QUESTION:**
        {question}

        {guidelines_section}**COURSE CONTENT (Textbooks, Lectures, Course Materials):**
        {guidelines_section}**COURSE CONTENT (Textbooks, Lectures, Course Materials):**
        {context_text}

        **RUBRIC CREATION INSTRUCTIONS:**
        Create grading criteria based EXCLUSIVELY on:
        1. **The assignment question requirements** - what specific knowledge/skills it's testing
        2. **The course content provided** - the main learning materials for this course
        3. **The assignment guidelines (if provided)** - treat these as IMPORTANT requirements that must be reflected in the rubric
        
        Do NOT use external knowledge or general essay writing criteria. Base your rubric entirely on what students should demonstrate based on the course materials, question requirements, and guidelines.

        **CRITERIA REQUIREMENTS:**
        Each criterion should be:
        1. **Specific to this assignment question** - directly assess what the question is asking
        2. **Grounded in course content** - evaluate understanding of the provided course materials
        3. **Aligned with guidelines** - if guidelines are provided, ensure criteria reflect those requirements
        4. **Measurable and distinct** - clearly define different aspects of student performance
        5. **Keep criteria separate** - do not combine multiple concepts into one criterion
        6. **Concise** - criterion descriptions should be 40-50 words maximum

        Create a grading rubric with 3-5 relevant criteria. Each criterion should include:
        **RUBRIC CREATION INSTRUCTIONS:**
        Create grading criteria based EXCLUSIVELY on:
        1. **The assignment question requirements** - what specific knowledge/skills it's testing
        2. **The course content provided** - the main learning materials for this course
        3. **The assignment guidelines (if provided)** - treat these as IMPORTANT requirements that must be reflected in the rubric
        
        Do NOT use external knowledge or general essay writing criteria. Base your rubric entirely on what students should demonstrate based on the course materials, question requirements, and guidelines.

        **CRITERIA REQUIREMENTS:**
        Each criterion should be:
        1. **Specific to this assignment question** - directly assess what the question is asking
        2. **Grounded in course content** - evaluate understanding of the provided course materials
        3. **Aligned with guidelines** - if guidelines are provided, ensure criteria reflect those requirements
        4. **Measurable and distinct** - clearly define different aspects of student performance
        5. **Keep criteria separate** - do not combine multiple concepts into one criterion
        6. **Concise** - criterion descriptions should be 40-50 words maximum

        Create a grading rubric with 3-5 relevant criteria. Each criterion should include:
        1. A clear name
        2. A detailed description based on course content expectations
        2. A detailed description based on course content expectations
        3. A weight (numerical value where all weights add up to 100)
        4. Scoring levels with descriptions for full, partial, and minimal performance
        5. An empty subCriteria array
        
        Also create grading brackets that define score ranges and expectations for overall performance.
        
        Also create grading brackets that define score ranges and expectations for overall performance.
        
        Return the rubric as a valid JSON object with the following structure:
        
        {{
          "gradingBrackets": [
            {{
              "label": "Excellent",
              "range": "90-100",
              "expectation": "Outstanding performance demonstrating thorough understanding and exceptional analysis"
            }},
            {{
              "label": "Good", 
              "range": "75-89",
              "expectation": "Strong performance with good understanding and analysis, minor areas for improvement"
            }},
            {{
              "label": "Satisfactory",
              "range": "60-74", 
              "expectation": "Adequate performance with basic understanding, several areas need improvement"
            }},
            {{
              "label": "Needs Improvement",
              "range": "0-59",
              "expectation": "Poor performance with significant gaps in understanding and analysis"
            }}
          ],
          "gradingBrackets": [
            {{
              "label": "Excellent",
              "range": "90-100",
              "expectation": "Outstanding performance demonstrating thorough understanding and exceptional analysis"
            }},
            {{
              "label": "Good", 
              "range": "75-89",
              "expectation": "Strong performance with good understanding and analysis, minor areas for improvement"
            }},
            {{
              "label": "Satisfactory",
              "range": "60-74", 
              "expectation": "Adequate performance with basic understanding, several areas need improvement"
            }},
            {{
              "label": "Needs Improvement",
              "range": "0-59",
              "expectation": "Poor performance with significant gaps in understanding and analysis"
            }}
          ],
          "criteria": [
            {{
              "name": "Criterion Name",
              "description": "Detailed description grounded in course content and question requirements",
              "description": "Detailed description grounded in course content and question requirements",
              "weight": number,
              "scoringLevels": {{
                "full": "Description of full points performance based on course expectations",
                "partial": "Description of partial points performance based on course expectations",
                "minimal": "Description of minimal points performance based on course expectations"
                "full": "Description of full points performance based on course expectations",
                "partial": "Description of partial points performance based on course expectations",
                "minimal": "Description of minimal points performance based on course expectations"
              }},
              "subCriteria": []
            }}
          ]
        }}

        **IMPORTANT:**
        - Return ONLY the JSON object with no additional text before or after it
        - Do NOT include labels like "Full Points:" or "Partial Points:" in the scoringLevels descriptions
        - The descriptions should be the actual expectation text only
        - Keep scoring level descriptions concise and specific
        - Create 3-5 grading brackets with appropriate ranges and clear expectations
        **IMPORTANT:**
        - Return ONLY the JSON object with no additional text before or after it
        - Do NOT include labels like "Full Points:" or "Partial Points:" in the scoringLevels descriptions
        - The descriptions should be the actual expectation text only
        - Keep scoring level descriptions concise and specific
        - Create 3-5 grading brackets with appropriate ranges and clear expectations
        """
        response = send_post_request(prompt=prompt, temperature=0.3, top_p=0.1,
                                     max_tokens=1500, model=model)
        response = response.strip()
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start != -1 and json_end > json_start:
            json_str = response[json_start:json_end]
            try:
                rubric_json = json.loads(json_str)
                if "criteria" not in rubric_json:
                    rubric_json = {"criteria": rubric_json}

                # Ensure gradingBrackets exist, create default if not
                if "gradingBrackets" not in rubric_json or not rubric_json["gradingBrackets"]:
                    rubric_json["gradingBrackets"] = [
                        {
                            "label": "Excellent",
                            "range": "90-100",
                            "expectation": "Outstanding performance demonstrating thorough understanding and exceptional analysis"
                        },
                        {
                            "label": "Good",
                            "range": "75-89",
                            "expectation": "Strong performance with good understanding and analysis, minor areas for improvement"
                        },
                        {
                            "label": "Satisfactory",
                            "range": "60-74",
                            "expectation": "Adequate performance with basic understanding, several areas need improvement"
                        },
                        {
                            "label": "Needs Improvement",
                            "range": "0-59",
                            "expectation": "Poor performance with significant gaps in understanding and analysis"
                        }
                    ]


                # Ensure gradingBrackets exist, create default if not
                if "gradingBrackets" not in rubric_json or not rubric_json["gradingBrackets"]:
                    rubric_json["gradingBrackets"] = [
                        {
                            "label": "Excellent",
                            "range": "90-100",
                            "expectation": "Outstanding performance demonstrating thorough understanding and exceptional analysis"
                        },
                        {
                            "label": "Good",
                            "range": "75-89",
                            "expectation": "Strong performance with good understanding and analysis, minor areas for improvement"
                        },
                        {
                            "label": "Satisfactory",
                            "range": "60-74",
                            "expectation": "Adequate performance with basic understanding, several areas need improvement"
                        },
                        {
                            "label": "Needs Improvement",
                            "range": "0-59",
                            "expectation": "Poor performance with significant gaps in understanding and analysis"
                        }
                    ]

                for criterion in rubric_json["criteria"]:
                    if "subCriteria" not in criterion:
                        criterion["subCriteria"] = []
                    if "scoringLevels" not in criterion:
                        criterion["scoringLevels"] = {
                            "full": "Excellent performance in this criterion.",
                            "partial": "Satisfactory performance in this criterion.",
                            "minimal": "Minimal performance in this criterion."
                        }

                    # Clean scoring levels to remove any labels
                    if "scoringLevels" in criterion and isinstance(criterion["scoringLevels"], dict):
                        def clean_text(text):
                            if not text:
                                return ""
                            # Remove common labels that might be included
                            return re.sub(r'^(Full Points?|Partial Points?|Minimal Points?):\s*', '', text, flags=re.IGNORECASE).strip()

                        for level in ["full", "partial", "minimal"]:
                            if level in criterion["scoringLevels"]:
                                criterion["scoringLevels"][level] = clean_text(
                                    criterion["scoringLevels"][level])


                    # Clean scoring levels to remove any labels
                    if "scoringLevels" in criterion and isinstance(criterion["scoringLevels"], dict):
                        def clean_text(text):
                            if not text:
                                return ""
                            # Remove common labels that might be included
                            return re.sub(r'^(Full Points?|Partial Points?|Minimal Points?):\s*', '', text, flags=re.IGNORECASE).strip()

                        for level in ["full", "partial", "minimal"]:
                            if level in criterion["scoringLevels"]:
                                criterion["scoringLevels"][level] = clean_text(
                                    criterion["scoringLevels"][level])

                    if "weight" not in criterion or not isinstance(criterion["weight"], (int, float)):
                        criterion["weight"] = 100 // len(
                            rubric_json["criteria"])
                total_weight = sum(c["weight"]
                                   for c in rubric_json["criteria"])
                if total_weight != 100:
                    scale_factor = 100 / total_weight
                    for criterion in rubric_json["criteria"]:
                        criterion["weight"] = round(
                            criterion["weight"] * scale_factor)
                    diff = 100 - sum(c["weight"]
                                     for c in rubric_json["criteria"])
                    if diff != 0:
                        rubric_json["criteria"][0]["weight"] += diff
                logger.info("Successfully generated sample rubric")
                return rubric_json
            except json.JSONDecodeError as e:
                logger.error(
                    f"Error parsing JSON from model response: {str(e)}")
                raise
        else:
            logger.error("Could not find valid JSON in model response")
            raise ValueError("No valid JSON found in response")
    except Exception as e:
        logger.error(f"Error generating rubric: {str(e)}")
        return {
            "gradingBrackets": [
                {
                    "label": "Excellent",
                    "range": "90-100",
                    "expectation": "Outstanding performance demonstrating thorough understanding and exceptional analysis"
                },
                {
                    "label": "Good",
                    "range": "75-89",
                    "expectation": "Strong performance with good understanding and analysis, minor areas for improvement"
                },
                {
                    "label": "Satisfactory",
                    "range": "60-74",
                    "expectation": "Adequate performance with basic understanding, several areas need improvement"
                },
                {
                    "label": "Needs Improvement",
                    "range": "0-59",
                    "expectation": "Poor performance with significant gaps in understanding and analysis"
                }
            ],
            "gradingBrackets": [
                {
                    "label": "Excellent",
                    "range": "90-100",
                    "expectation": "Outstanding performance demonstrating thorough understanding and exceptional analysis"
                },
                {
                    "label": "Good",
                    "range": "75-89",
                    "expectation": "Strong performance with good understanding and analysis, minor areas for improvement"
                },
                {
                    "label": "Satisfactory",
                    "range": "60-74",
                    "expectation": "Adequate performance with basic understanding, several areas need improvement"
                },
                {
                    "label": "Needs Improvement",
                    "range": "0-59",
                    "expectation": "Poor performance with significant gaps in understanding and analysis"
                }
            ],
            "criteria": [
                {
                    "name": "Criterion 1",
                    "description": "Auto-generated placeholder criterion",
                    "weight": 100,
                    "scoringLevels": {
                        "full": "Excellent performance in this criterion.",
                        "partial": "Satisfactory performance in this criterion.",
                        "minimal": "Minimal performance in this criterion."
                    },
                    "subCriteria": []
                }
            ]
        }


def generate_criteria_expectations(criteria_name: str, criteria_description: str, question: str, context: List[str], bracket_labels: List[str], model: str = "llama3.3:70b") -> Dict[str, str]:
    """Generate expectations for a single criterion based on its name and description, for arbitrary bracket labels."""
    logger.info(
        f"Generating expectations for criterion: {criteria_name} using model: {model}...")
    try:
        context_text = ' '.join(context)
        # Dynamically build the bracket instructions
        bracket_instructions = "\n".join([
            f"{i+1}. **{label}**: What constitutes {label.lower()} performance for this criterion" for i, label in enumerate(bracket_labels)
        ])
        bracket_json = ",\n".join(
            [f'  "{label}": "Description for {label} performance"' for label in bracket_labels])
        prompt = f"""
        You are an expert educational assessment designer. Your task is to generate specific expectations for a grading criterion.

        **CRITERION DETAILS:**
        Name: {criteria_name}
        Description: {criteria_description}

        **EXPECTATIONS GENERATION INSTRUCTIONS:**
        Based ONLY on the criterion name and description above, generate expectations for each of the following marks brackets:
{bracket_instructions}

        **REQUIREMENTS:**
        - Focus EXCLUSIVELY on the specific criterion (name and description)
        - Be specific and measurable for the criterion being assessed
        - Use clear, academic language
        - **Keep expectations SHORT and PRECISE - maximum 10-15 words each**
        - Focus on key performance indicators for this specific criterion only
        - Avoid verbose descriptions

        Return ONLY a JSON object with the following structure:
        {{
{bracket_json}
        }}

        **IMPORTANT:**
        - Return ONLY the JSON object with no additional text before or after it
        - Do NOT include labels like "Full Points:" or similar in the descriptions
        - The descriptions should be the actual expectation text only
        - Keep each description short and precise (10-15 words maximum)
        - Focus ONLY on the criterion, not the assignment topic
        """
        response = send_post_request(prompt=prompt, temperature=0.3, top_p=0.1,
                                     max_tokens=800, model=model, type=json)
        response = response.strip()
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start != -1 and json_end > json_start:
            json_str = response[json_start:json_end]
            try:
                expectations_json = json.loads(json_str)
                # Ensure all required fields are present
                for label in bracket_labels:
                    if label not in expectations_json or not expectations_json[label]:
                        expectations_json[label] = f"Default {label} expectation for {criteria_name}"
                logger.info(
                    f"Successfully generated expectations for criterion: {criteria_name}")
                return expectations_json
            except json.JSONDecodeError as e:
                logger.error(
                    f"Error parsing JSON from model response: {str(e)}")
                raise
        else:
            logger.error("Could not find valid JSON in model response")
            raise ValueError("No valid JSON found in response")
    except Exception as e:
        logger.error(
            f"Error generating expectations for criterion {criteria_name}: {str(e)}")
        return {label: f"Default {label} expectation for {criteria_name}" for label in bracket_labels}


def generate_criteria_expectations(criteria_name: str, criteria_description: str, question: str, context: List[str], bracket_labels: List[str], model: str = "llama3.3:70b") -> Dict[str, str]:
    """Generate expectations for a single criterion based on its name and description, for arbitrary bracket labels."""
    logger.info(
        f"Generating expectations for criterion: {criteria_name} using model: {model}...")
    try:
        context_text = ' '.join(context)
        # Dynamically build the bracket instructions
        bracket_instructions = "\n".join([
            f"{i+1}. **{label}**: What constitutes {label.lower()} performance for this criterion" for i, label in enumerate(bracket_labels)
        ])
        bracket_json = ",\n".join(
            [f'  "{label}": "Description for {label} performance"' for label in bracket_labels])
        prompt = f"""
        You are an expert educational assessment designer. Your task is to generate specific expectations for a grading criterion.

        **CRITERION DETAILS:**
        Name: {criteria_name}
        Description: {criteria_description}

        **EXPECTATIONS GENERATION INSTRUCTIONS:**
        Based ONLY on the criterion name and description above, generate expectations for each of the following marks brackets:
{bracket_instructions}

        **REQUIREMENTS:**
        - Focus EXCLUSIVELY on the specific criterion (name and description)
        - Be specific and measurable for the criterion being assessed
        - Use clear, academic language
        - **Keep expectations SHORT and PRECISE - maximum 10-15 words each**
        - Focus on key performance indicators for this specific criterion only
        - Avoid verbose descriptions

        Return ONLY a JSON object with the following structure:
        {{
{bracket_json}
        }}

        **IMPORTANT:**
        - Return ONLY the JSON object with no additional text before or after it
        - Do NOT include labels like "Full Points:" or similar in the descriptions
        - The descriptions should be the actual expectation text only
        - Keep each description short and precise (10-15 words maximum)
        - Focus ONLY on the criterion, not the assignment topic
        """
        response = send_post_request(prompt=prompt, temperature=0.3, top_p=0.1,
                                     max_tokens=800, model=model, type=json)
        response = response.strip()
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start != -1 and json_end > json_start:
            json_str = response[json_start:json_end]
            try:
                expectations_json = json.loads(json_str)
                # Ensure all required fields are present
                for label in bracket_labels:
                    if label not in expectations_json or not expectations_json[label]:
                        expectations_json[label] = f"Default {label} expectation for {criteria_name}"
                logger.info(
                    f"Successfully generated expectations for criterion: {criteria_name}")
                return expectations_json
            except json.JSONDecodeError as e:
                logger.error(
                    f"Error parsing JSON from model response: {str(e)}")
                raise
        else:
            logger.error("Could not find valid JSON in model response")
            raise ValueError("No valid JSON found in response")
    except Exception as e:
        logger.error(
            f"Error generating expectations for criterion {criteria_name}: {str(e)}")
        return {label: f"Default {label} expectation for {criteria_name}" for label in bracket_labels}


@rubric_bp.route("/generate_rubric", methods=["POST"])
def generate_rubric():
    data = request.get_json()
    print(data)
    question = data.get("question")
    professor = data.get("username")
    title = data.get("title")
    course_id = data.get("courseId")  # e.g., "67dd03b10804dc82ad45da1d"
    model = data.get("model", "llama3.3:70b")
    guidelines = data.get("guidelines", "")  # Get guidelines from request
    guidelines = data.get("guidelines", "")  # Get guidelines from request

    if not all([question, professor, course_id, title]):
        return jsonify({"error": "question, username, and courseId are required"}), 400

    try:
        # Retrieve comprehensive context from Qdrant vector store for rubric generation
        context = retrieve_relevant_text(
            query=question,
            k=30,  # Get many more chunks for comprehensive rubric coverage
            professor_username=professor,
            course_id=course_id,
            assignmentTitle=title,
            distance_threshold=0.3,  # Lower threshold to include more content
            max_total_length=12000  # Double the context length for rubrics
        )

        # Generate a single rubric with guidelines
        rubric = generate_sample_rubric(question, context, guidelines, model=model)
        print(rubric)
        result = {
            "success": True,
            "message": "Generated a sample rubric",
            "rubric": rubric
        }
        return jsonify(result)

    except Exception as e:
        logger.exception(f"Error generating sample rubric: {str(e)}")
        return jsonify({
            "success": False,
            "message": f"Error generating sample rubric: {str(e)}",
            "error": str(e)
        }), 500


@rubric_bp.route("/fill_expectations", methods=["POST"])
def fill_expectations():
    data = request.get_json()
    print(data)
    criteria_name = data.get("criteriaName")
    criteria_description = data.get("criteriaDescription")
    question = data.get("question")
    professor = data.get("username")
    title = data.get("title")
    course_id = data.get("courseId")
    model = data.get("model", "llama3.3:70b")
    bracket_labels = data.get("bracketLabels")
    if not all([criteria_name, criteria_description, question, professor, course_id, title, bracket_labels]):
        return jsonify({"error": "criteriaName, criteriaDescription, question, username, courseId, and bracketLabels are required"}), 400
    try:
        # Retrieve relevant context from Qdrant vector store
        context = retrieve_relevant_text(
            query=f"{criteria_name} {criteria_description}",
            k=20,
            professor_username=professor,
            course_id=course_id,
            assignmentTitle=title,
            distance_threshold=0.4,
            max_total_length=8001
        )
        # Generate expectations for the criterion and all brackets
        expectations = generate_criteria_expectations(
            criteria_name, criteria_description, question, context, bracket_labels, model=model
        )
        result = {
            "success": True,
            "message": "Generated expectations successfully",
            "expectations": expectations
        }
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error generating expectations: {str(e)}")
        # Return a fallback response with default expectations
        fallback_expectations = {label: f"Default {label} expectation" for label in bracket_labels}
        return jsonify({
            "success": True,
            "message": "Generated fallback expectations due to error",
            "expectations": fallback_expectations,
            "warning": f"Error occurred: {str(e)}"
        }), 200
