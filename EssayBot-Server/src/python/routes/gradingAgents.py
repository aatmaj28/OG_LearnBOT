"""
LangGraph agent grading endpoint
Production-ready multi-agent grading system
"""

from utils.langgraph_grading_agents import EnhancedGradingOrchestrator
import os
import logging
import asyncio
from flask import Blueprint, request, jsonify
from typing import Dict, Any
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))


logger = logging.getLogger(__name__)

# Create blueprint
agents_bp = Blueprint("agents", __name__)

# LLM configuration
LLM_URL = os.getenv("OLLAMA_URL", "http://129.10.156.97:8000/v1/completions")


async def grade_with_agents(
    essay: str,
    rubric: Dict[str, Any],
    question: str,
    professor_username: str,
    course_id: str,
    assignment_title: str,
    tone: str = "moderate",
    model: str = None
) -> Dict[str, Any]:
    """
    Grade essay using LangGraph agents

    Returns dict with:
        - success: bool
        - final_score: float
        - final_feedback: str
        - criterion_scores: dict
        - detected_issues: list
    """
    try:
        # Import workflow logger
        from utils.langgraph_grading_agents import workflow_logger

        # Start workflow logging
        workflow_logger.start_workflow(essay)

        # Initialize orchestrator
        orchestrator = EnhancedGradingOrchestrator(LLM_URL)

        # Create workflow
        workflow = orchestrator.create_workflow()

        # Initialize state
        initial_state = {
            "essay": essay,
            "rubric": rubric,
            "question": question,
            "professor_username": professor_username,
            "course_id": course_id,
            "assignment_title": assignment_title,
            "tone": tone,
            "model": model,  # Pass model through workflow state
            "context": {},
            "is_valid": True,
            "detected_issues": [],
            "quality_multiplier": 1.0,
            "specificity_score": 0.5,
            "criteria_prompts": {},
            "criterion_scores": {},
            "feedbacks": {},
            "final_score": 0.0,
            "final_feedback": ""
        }

        logger.info(f"🤖 Starting LangGraph workflow for essay")

        # Run workflow
        final_state = await workflow.ainvoke(initial_state)

        # Log workflow completion
        workflow_logger.workflow_complete(
            final_state["final_score"],
            len(rubric.get("criteria", []))
        )

        # Extract AI confidence for professor review
        confidence_scores = final_state.get("confidence_scores", {})
        ai_confidence = confidence_scores.get("ai_generated", 0.0)

        # Success means grading completed (has scores), not whether essay is valid
        # Flagged essays should still be graded and return scores
        has_scores = final_state.get("criterion_scores") and len(final_state.get("criterion_scores", {})) > 0
        grading_success = has_scores  # Success if we have scores, regardless of is_valid

        return {
            "success": grading_success,  # True if grading completed (has scores), False only if actual error
            "final_score": final_state["final_score"],
            "final_feedback": final_state["final_feedback"],
            "criterion_scores": final_state["criterion_scores"],
            "feedbacks": final_state.get("feedbacks", {}),
            "detected_issues": final_state["detected_issues"],
            "quality_multiplier": final_state.get("quality_multiplier", 1.0),
            "specificity_score": final_state.get("specificity_score", 0.5),
            "ai_confidence": ai_confidence,  # 0.0 to 1.0
            "confidence_scores": confidence_scores,  # All scores for detailed analysis
            "agent_system": "langgraph",
            "is_valid": final_state["is_valid"]  # Include is_valid separately for UI flagging
        }

    except Exception as e:
        logger.error(f"❌ LangGraph grading failed: {e}")
        import traceback
        traceback.print_exc()

        # Log error
        from utils.langgraph_grading_agents import workflow_logger
        workflow_logger.error("WORKFLOW", str(e))

        return {
            "success": False,
            "final_score": 0,
            "final_feedback": f"Grading system error: {str(e)}",
            "criterion_scores": {},
            "feedbacks": {},
            "detected_issues": ["system_error"],
            "error": str(e)
        }


def grade_with_agents_sync(
    essay: str,
    rubric: Dict[str, Any],
    question: str,
    professor_username: str,
    course_id: str,
    assignment_title: str,
    tone: str = "moderate",
    model: str = None
) -> Dict[str, Any]:
    """Synchronous wrapper for Flask compatibility"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            grade_with_agents(
                essay=essay,
                rubric=rubric,
                question=question,
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title,
                tone=tone,
                model=model
            )
        )
    finally:
        loop.close()


@agents_bp.route('/grade_with_agents', methods=['POST'])
def grade_essay_agents():
    """
    New endpoint for agent-based grading
    Test this before switching main endpoints
    """
    try:
        data = request.get_json()

        # Validate required fields
        required = ["essay", "rubric", "question",
                    "username", "courseId", "assignmentTitle"]
        if not all(field in data for field in required):
            return jsonify({"error": f"Missing required fields: {required}"}), 400

        # Grade with agents
        result = grade_with_agents_sync(
            essay=data["essay"],
            rubric=data["rubric"],
            question=data["question"],
            professor_username=data["username"],
            course_id=data["courseId"],
            assignment_title=data["assignmentTitle"],
            tone=data.get("tone", "moderate")
        )

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error in agent grading: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
