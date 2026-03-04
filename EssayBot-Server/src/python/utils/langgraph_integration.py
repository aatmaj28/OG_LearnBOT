"""
Integration wrapper for LangGraph grading agents
Bridges existing Flask endpoints with the new agent system
"""

import asyncio
import logging
from typing import Dict, Any
from .langgraph_grading_agents import GradingOrchestrator, GradingState

logger = logging.getLogger(__name__)


class LangGraphGradingService:
    """Service to integrate LangGraph agents with existing endpoints"""

    def __init__(self, llm_client):
        self.orchestrator = GradingOrchestrator(llm_client)

    async def grade_essay_async(
        self,
        essay: str,
        rubric: Dict[str, Any],
        professor_username: str,
        course_id: str,
        assignment_title: str,
        question: str = "",
        tone: str = "moderate"
    ) -> Dict[str, Any]:
        """
        Grade essay using LangGraph workflow

        Args:
            essay: Student essay text
            rubric: Assignment rubric with criteria and brackets
            professor_username: Professor identifier
            course_id: Course identifier
            assignment_title: Assignment identifier
            question: Assignment question (optional)
            tone: Grading tone (lenient/moderate/strict)

        Returns:
            Dict with score, feedback, criterion_scores, etc.
        """
        try:
            # Create workflow
            workflow = self.orchestrator.create_workflow(rubric)

            # Initialize state
            initial_state = GradingState(
                essay=essay,
                rubric=rubric,
                context="",
                criterion_scores={},
                feedbacks={},
                final_score=0.0,
                final_feedback="",
                detected_issues=[],
                is_valid=True,
                professor_username=professor_username,
                course_id=course_id,
                assignment_title=assignment_title,
                question=question,
                tone=tone
            )

            # Run workflow
            logger.info(f"🤖 Starting LangGraph workflow for essay")
            final_state = await workflow.ainvoke(initial_state)

            # Format response to match existing API
            return {
                "success": final_state["is_valid"],
                "total_score": final_state["final_score"],
                "feedback": final_state["final_feedback"],
                "criterion_scores": final_state["criterion_scores"],
                "detected_issues": final_state["detected_issues"],
                "agent_system": "langgraph",  # Indicate this used agents
                "is_valid": final_state["is_valid"]
            }

        except Exception as e:
            logger.error(f"❌ LangGraph grading failed: {e}")
            return {
                "success": False,
                "total_score": 0,
                "feedback": f"Grading system error: {str(e)}",
                "criterion_scores": {},
                "detected_issues": ["system_error"],
                "error": str(e)
            }

    def grade_essay_sync(self, *args, **kwargs) -> Dict[str, Any]:
        """Synchronous wrapper for compatibility with Flask"""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(self.grade_essay_async(*args, **kwargs))
        finally:
            loop.close()


# Singleton instance
_grading_service = None


def get_langgraph_service(llm_client) -> LangGraphGradingService:
    """Get or create singleton LangGraph service"""
    global _grading_service
    if _grading_service is None:
        _grading_service = LangGraphGradingService(llm_client)
        logger.info("🤖 LangGraph Grading Service initialized")
    return _grading_service


# Direct function for easy integration
def grade_with_langgraph(
    essay: str,
    rubric: Dict[str, Any],
    professor_username: str,
    course_id: str,
    assignment_title: str,
    llm_client,
    question: str = "",
    tone: str = "moderate"
) -> Dict[str, Any]:
    """
    One-line function to grade with LangGraph

    Usage in your endpoints:
        result = grade_with_langgraph(
            essay=student_essay,
            rubric=assignment.config_rubric,
            professor_username=username,
            course_id=course_id,
            assignment_title=assignment_title,
            llm_client=your_llm_client,
            question=question,
            tone=tone
        )
    """
    service = get_langgraph_service(llm_client)
    return service.grade_essay_sync(
        essay=essay,
        rubric=rubric,
        professor_username=professor_username,
        course_id=course_id,
        assignment_title=assignment_title,
        question=question,
        tone=tone
    )
