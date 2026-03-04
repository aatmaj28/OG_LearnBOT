"""
File: langgraph_grading_agents.py
Production-ready multi-agent grading with your existing prompts
"""

from config.model_config import get_model_name, get_model_parameters
from typing import Dict, List, Any, TypedDict, Optional
from langgraph.graph import StateGraph, END
import asyncio
import json
import logging
import re
import requests
from datetime import datetime
import time
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

logger = logging.getLogger(__name__)


# ========================================
# STEP-BY-STEP CONSOLE LOGGING
# ========================================

class WorkflowLogger:
    """Beautiful step-by-step logging for the grading workflow"""

    def __init__(self):
        self.start_time = None
        self.step_times = {}

    def start_workflow(self, essay_preview: str):
        """Start the workflow timer"""
        self.start_time = time.time()
        print("\n" + "="*80)
        print("🤖 LANGGRAPH MULTI-AGENT GRADING WORKFLOW")
        print("="*80)
        print(f"📝 Essay Preview: {essay_preview[:100]}...")
        print(f"⏰ Started at: {datetime.now().strftime('%H:%M:%S')}")
        print("="*80 + "\n")

    def step(self, step_num: int, step_name: str, status: str = "START", details: str = ""):
        """Log a workflow step"""
        step_start = time.time()
        self.step_times[step_name] = step_start

        icons = {
            "START": "▶️",
            "SUCCESS": "✅",
            "FAILED": "❌",
            "SKIP": "⏭️"
        }

        icon = icons.get(status, "▶️")
        timestamp = datetime.now().strftime('%H:%M:%S')

        if status == "START":
            print(f"\n{icon} STEP {step_num}: {step_name}")
            print(f"   ⏰ {timestamp}")
            if details:
                print(f"   📋 {details}")
            print("   " + "-"*76)
        else:
            elapsed = time.time() - self.step_times.get(step_name, step_start)
            print(f"   {icon} {status} (took {elapsed:.2f}s)")
            if details:
                print(f"   📊 {details}")
            print("   " + "-"*76)

    def parallel_grading(self, num_criteria: int):
        """Log parallel grading start"""
        print(
            f"\n⚡ PARALLEL GRADING: Evaluating {num_criteria} criteria simultaneously")
        print("   " + "─"*76)

    def criterion_complete(self, criterion_name: str, score: float, elapsed: float):
        """Log individual criterion completion"""
        print(f"   ✓ {criterion_name}: {score:.1f} points ({elapsed:.2f}s)")

    def workflow_complete(self, final_score: float, total_criteria: int):
        """Log workflow completion"""
        total_time = time.time() - self.start_time
        print("\n" + "="*80)
        print("🎉 WORKFLOW COMPLETE")
        print("="*80)
        print(f"📊 Final Score: {final_score:.1f}%")
        print(f"📝 Criteria Evaluated: {total_criteria}")
        print(f"⏱️  Total Time: {total_time:.2f}s")
        print(
            f"⚡ Average per Criterion: {total_time/max(total_criteria, 1):.2f}s")
        print("="*80 + "\n")

    def error(self, step_name: str, error_msg: str):
        """Log an error"""
        print(f"\n❌ ERROR in {step_name}:")
        print(f"   {error_msg}")
        print("="*80 + "\n")


# Global workflow logger
workflow_logger = WorkflowLogger()


class GradingState(TypedDict):
    """Complete grading state"""
    # Input
    essay: str
    rubric: dict
    question: str
    professor_username: str
    course_id: str
    assignment_title: str
    tone: str
    model: str  # Model name/alias for LLM calls

    # Processing
    context: dict
    is_valid: bool
    detected_issues: list
    confidence_scores: dict  # AI detection and security scores
    quality_multiplier: float
    specificity_score: float
    criteria_prompts: dict

    # Results
    criterion_scores: dict
    feedbacks: dict
    final_score: float
    final_feedback: str


class CriterionAgent:
    """Agent using your existing agents.py prompts"""

    def __init__(self, criterion: dict, llm_url: str, model: str = None):
        self.criterion = criterion
        self.llm_url = llm_url
        self.model = model  # Store model for LLM calls
        self.name = criterion['name']
        self.weight = criterion['weight']

    async def evaluate(
        self,
        essay: str,
        question: str,
        context: dict,
        prompt_template: str,
        quality_multiplier: float
    ) -> Dict[str, Any]:
        """Evaluate using your existing prompt structure"""

        try:
            # Log what we're receiving
            logger.info(
                f"🔧 Evaluating '{self.name}' - prompt_template length: {len(prompt_template)}")

            # Format the prompt with manual replacement
            # Template uses {{placeholders}} which need to be replaced with actual values
            # We can't use .format() because the JSON example has single braces
            formatted_prompt = prompt_template.replace(
                "{{question}}", question)
            formatted_prompt = formatted_prompt.replace("{{essay}}", essay)
            formatted_prompt = formatted_prompt.replace(
                "{{course_context}}", context.get("course_context", ""))
            formatted_prompt = formatted_prompt.replace(
                "{{supporting_context}}", context.get("supporting_context", ""))

            logger.info(
                f"✅ Prompt formatted successfully for '{self.name}', length: {len(formatted_prompt)}")

            # Call LLM with retry logic for instruction-echo failures
            max_retries = 2
            result = None
            response = None
            
            for attempt in range(max_retries + 1):
                try:
                    # Call LLM
                    response = await self._call_llm(formatted_prompt)

                    # Log raw response BEFORE parsing for debugging
                    logger.info(
                        f"📝 RAW LLM response for '{self.name}' (attempt {attempt + 1}): {response[:500]}")

                    # Parse response
                    result = self._parse_llm_response(response)
                    if attempt > 0:
                        logger.info(f"✅ Successfully parsed on retry attempt {attempt + 1}")
                    break  # Success, exit retry loop
                    
                except (ValueError, json.JSONDecodeError) as e:
                    error_msg = str(e)
                    # Check if it's an instruction-echo failure
                    # Look at the response to see if it contains instructions
                    response_has_instructions = False
                    if response:
                        response_lower = response.lower()
                        response_has_instructions = (
                            response.strip().startswith('-') or 
                            response.strip().startswith('The JSON') or 
                            'must be valid' in response_lower[:200] or
                            response.count('- The') > 3 or
                            response.count('- The "') > 2 or
                            'json object must' in response_lower[:200]
                        )
                    
                    is_instruction_echo = (
                        'instructions instead of JSON' in error_msg or 
                        'LLM returned instructions' in error_msg or
                        response_has_instructions
                    )
                    
                    logger.debug(f"   Error: {error_msg[:100]}")
                    logger.debug(f"   Response has instructions: {response_has_instructions}")
                    logger.debug(f"   Is instruction echo: {is_instruction_echo}")
                    logger.debug(f"   Attempt: {attempt + 1}/{max_retries + 1}")
                    
                    if is_instruction_echo and attempt < max_retries:
                        logger.warning(f"⚠️  LLM returned instructions on attempt {attempt + 1}/{max_retries + 1}, retrying with more explicit prompt...")
                        logger.warning(f"   Response preview: {response[:300] if response else 'None'}...")
                        # Add even more explicit instruction to prompt - put it at the very end
                        formatted_prompt = formatted_prompt + "\n\n=== FINAL OUTPUT INSTRUCTION ===\nYou MUST return ONLY a JSON object. Nothing else. No text before. No text after. No instructions. No bullet points.\n\nReturn ONLY this: {\"score\": <number>, \"feedback\": \"<text>\"}\n\nThat is ALL you should return. Just the JSON object."
                        continue
                    # If it's a different error or we've exhausted retries, raise
                    if attempt >= max_retries:
                        logger.error(f"❌ All {max_retries + 1} attempts failed for '{self.name}'")
                    raise

            logger.info(
                f"✅ Parsed result for '{self.name}': score={result.get('score')}, feedback_len={len(result.get('feedback', ''))}")

            # Apply quality multiplier
            adjusted_score = result["score"] * quality_multiplier
            final_score = min(adjusted_score, self.weight)

            return {
                "criterion": self.name,
                "score": final_score,
                "raw_score": result["score"],
                "feedback": result["feedback"],
                "quality_adjusted": True
            }

        except Exception as e:
            logger.error(f"❌ Failed to evaluate {self.name} after all retries: {e}")
            logger.error(f"   Error type: {type(e).__name__}")
            logger.error(f"   Error details: {str(e)}")
            # Return valid dict structure instead of raising
            # Provide more helpful error message
            error_msg = str(e)
            if "Invalid JSON response" in error_msg or "instructions instead of JSON" in error_msg:
                feedback_msg = "The grading system received an invalid response from the AI model. Please try again."
            else:
                feedback_msg = f"Evaluation error: {error_msg[:100]}"
            return {
                "criterion": self.name,
                "score": 0,
                "feedback": feedback_msg,
                "error": str(e)
            }

    async def _call_llm(self, prompt: str) -> str:
        """Call your LLM endpoint"""
        # Get model and parameters from central config
        # Use self.model if available, otherwise fall back to DEFAULT_MODEL
        model_name = get_model_name(self.model)
        params = get_model_parameters(self.model)

        payload = {
            "model": model_name,
            "prompt": prompt,
            "max_tokens": params["max_tokens"],
            "temperature": params["temperature"],
            "top_p": params["top_p"]
        }

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: requests.post(self.llm_url, json=payload)
        )

        if response.status_code == 200:
            response_data = response.json()
            if "choices" not in response_data or len(response_data["choices"]) == 0:
                logger.error(f"❌ LLM API returned empty choices array")
                raise Exception("LLM API returned no choices")
            text = response_data["choices"][0]["text"]
            if not text or len(text.strip()) == 0:
                logger.error(f"❌ LLM API returned empty text in response")
                raise Exception("LLM API returned empty text")
            return text
        else:
            logger.error(f"❌ LLM API call failed with status {response.status_code}")
            logger.error(f"   Response: {response.text[:500]}")
            raise Exception(f"LLM call failed: {response.status_code}")

    def _parse_llm_response(self, response: str) -> dict:
        """Parse JSON from LLM response with robust error handling"""
        try:
            # Clean response
            original_response = response
            response = response.strip()
            
            # Check for completely empty response
            if not response or len(response) == 0:
                logger.error(f"❌ LLM returned empty response for '{self.name}'")
                raise ValueError("LLM returned empty response. No content received.")

            # Check if LLM returned instructions instead of JSON (common failure mode)
            # Look for instruction patterns at the start
            has_instructions = (
                response.strip().startswith('-') or 
                response.strip().startswith('The JSON') or 
                'must be valid' in response.lower()[:200] or
                response.strip().startswith('STRICT OUTPUT') or
                (response.count('- The') > 3)  # Multiple bullet points suggests instructions
            )
            
            if has_instructions:
                logger.warning(f"⚠️  LLM returned instructions for '{self.name}'. Searching for JSON in full response...")
                logger.debug(f"   Full response length: {len(response)} chars")
                
                # Try multiple strategies to find JSON even if buried in instructions
                json_found = False
                
                # Strategy 1: Look for JSON object with score and feedback anywhere in response
                json_match = re.search(r'\{[^{}]*"score"[^{}]*"feedback"[^{}]*\}', response, re.DOTALL)
                if not json_match:
                    # Strategy 2: Look for any JSON object that might contain score/feedback
                    json_match = re.search(r'\{.*?"score".*?"feedback".*?\}', response, re.DOTALL)
                if not json_match:
                    # Strategy 3: Look for balanced JSON object anywhere (might have score/feedback)
                    def find_any_json(s: str):
                        """Find any complete JSON object in the string."""
                        start = s.find('{')
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
                                elif ch == '\\':
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
                                        candidate = s[start:i+1]
                                        # Check if it looks like our expected format
                                        if '"score"' in candidate and '"feedback"' in candidate:
                                            return candidate
                        return None
                    json_candidate = find_any_json(response)
                    if json_candidate:
                        json_match = type('Match', (), {'group': lambda: json_candidate})()
                
                if json_match:
                    extracted_json = json_match.group()
                    logger.info(f"✅ Found JSON in response (extracted {len(extracted_json)} chars)")
                    logger.debug(f"   Extracted JSON: {extracted_json[:200]}...")
                    response = extracted_json
                    json_found = True
                else:
                    # If we can't find JSON, this is a real failure
                    logger.error(f"❌ LLM returned instructions with no JSON found")
                    logger.error(f"   Response preview (first 500 chars): {response[:500]}")
                    logger.error(f"   Response preview (last 500 chars): {response[-500:]}")
                    raise ValueError("LLM returned instructions instead of JSON. No JSON object found in response.")

            # Remove markdown code fences if present
            response = re.sub(r'```(?:json)?\s*', '', response)
            response = re.sub(r'```\s*$', '', response)

            # Remove escaped quotes in keys (fix for "\"score\"" issue)
            # This handles LLMs that escape JSON keys
            response = response.replace('\\"score\\"', '"score"')
            response = response.replace('\\"feedback\\"', '"feedback"')

            # Strategy 1: Try direct JSON parse
            parsed = None
            try:
                parsed = json.loads(response)
            except json.JSONDecodeError:
                pass

            # Strategy 2: Extract balanced JSON object using proper bracket matching
            if parsed is None:
                def extract_balanced_json(s: str) -> str:
                    """Extract the first complete JSON object with balanced braces."""
                    start = s.find('{')
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
                            elif ch == '\\':
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
                
                json_candidate = extract_balanced_json(response)
                if json_candidate:
                    try:
                        parsed = json.loads(json_candidate)
                    except json.JSONDecodeError:
                        pass

            # Strategy 3: Fallback to regex search for JSON-like structure
            if parsed is None:
                json_match = re.search(r'\{.*?"score".*?"feedback".*?\}', response, re.DOTALL)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group())
                    except json.JSONDecodeError:
                        pass

            # Strategy 4: Last resort - simple bracket matching
            if parsed is None:
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group())
                    except json.JSONDecodeError:
                        pass

            if parsed is None:
                raise ValueError(f"Could not parse JSON from response. Response starts with: {original_response[:200]}")

            # Handle escaped keys in parsed dict (if they still exist)
            if '"score"' in parsed:
                parsed['score'] = parsed['"score"']
                del parsed['"score"']
            if '"feedback"' in parsed:
                parsed['feedback'] = parsed['"feedback"']
                del parsed['"feedback"']

            # Validate required fields
            if "score" not in parsed:
                available_keys = list(parsed.keys())
                logger.error(
                    f"Missing 'score' field. Available keys: {available_keys}")
                logger.error(f"Parsed dict: {parsed}")
                raise ValueError(
                    f"Missing 'score' field. Got keys: {available_keys}")

            if "feedback" not in parsed:
                available_keys = list(parsed.keys())
                logger.error(
                    f"Missing 'feedback' field. Available keys: {available_keys}")
                logger.error(f"Parsed dict: {parsed}")
                raise ValueError(
                    f"Missing 'feedback' field. Got keys: {available_keys}")

            # Ensure score is numeric
            score = parsed["score"]
            if not isinstance(score, (int, float)):
                # Try to convert string to float
                try:
                    parsed["score"] = float(score)
                except (ValueError, TypeError):
                    raise ValueError(
                        f"Score must be numeric, got: {type(score)} = {score}")

            return parsed

        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parse error for '{self.name}': {e}")
            logger.error(
                f"   Raw response (first 500 chars): {response[:500]}")
            raise ValueError(f"Invalid JSON response: {str(e)}")
        except KeyError as e:
            logger.error(f"❌ KeyError for '{self.name}': {e}")
            logger.error(
                f"   Parsed object: {parsed if 'parsed' in locals() else 'Not parsed'}")
            logger.error(f"   Raw response: {response[:500]}")
            raise
        except Exception as e:
            logger.error(
                f"❌ Response validation failed for '{self.name}': {e}")
            logger.error(f"   Error type: {type(e).__name__}")
            logger.error(f"   Raw response: {response[:500]}")
            raise


class EnhancedGradingOrchestrator:
    """Orchestrator using your existing infrastructure"""

    def __init__(self, llm_url: str):
        self.llm_url = llm_url

        # Import your existing components
        from .grading_guardrails import GradingGuardrail
        import sys
        from pathlib import Path
        sys.path.append(str(Path(__file__).parent.parent))
        from llamaindex_rag.smart_query_processor import DynamicQueryProcessor

        self.guardrail = GradingGuardrail()
        self.query_processor = DynamicQueryProcessor()

    def create_workflow(self) -> StateGraph:
        """Create the grading workflow"""

        workflow = StateGraph(GradingState)

        # Add nodes
        workflow.add_node("validate", self.validate_essay)
        workflow.add_node("analyze_quality", self.analyze_quality)
        workflow.add_node("generate_prompts", self.generate_prompts)
        workflow.add_node("retrieve_context", self.retrieve_context)
        workflow.add_node("evaluate_criteria", self.evaluate_all_criteria)
        workflow.add_node("aggregate", self.aggregate_scores)

        # Define flow
        workflow.set_entry_point("validate")

        # Always continue grading even if flagged - is_valid is just a UI indicator
        workflow.add_edge("validate", "analyze_quality")

        workflow.add_edge("analyze_quality", "generate_prompts")
        workflow.add_edge("generate_prompts", "retrieve_context")
        workflow.add_edge("retrieve_context", "evaluate_criteria")
        workflow.add_edge("evaluate_criteria", "aggregate")
        workflow.add_edge("aggregate", END)

        return workflow.compile()

    async def validate_essay(self, state: GradingState) -> GradingState:
        """Validate essay for gaming attempts"""
        workflow_logger.step(1, "VALIDATE ESSAY", "START",
                             "Checking for gaming attempts and prompt injection")

        # Use updated validate_input method (v5.0+ API)
        validation_result = self.guardrail.validate_input(
            essay_text=state["essay"],
            student_id=state.get("professor_username", "unknown"),
            min_length=200,
            max_length=10000
        )

        state["is_valid"] = validation_result.is_valid

        # Extract issue descriptions for legacy compatibility
        issue_descriptions = [
            f"{issue.issue_type}: {issue.description}"
            for issue in validation_result.blocking_issues
        ]
        state["detected_issues"] = issue_descriptions

        # Store risk scores as confidence scores for AI detection reporting
        state["confidence_scores"] = validation_result.risk_scores

        if not validation_result.is_valid:
            state["final_score"] = 0
            state["final_feedback"] = f"Invalid submission detected: {', '.join(issue_descriptions)}"
            workflow_logger.step(1, "VALIDATE ESSAY", "FAILED",
                                 f"Gaming detected: {', '.join(issue_descriptions[:3])}")
        else:
            workflow_logger.step(1, "VALIDATE ESSAY",
                                 "SUCCESS", "Essay is valid")

        return state

    async def analyze_quality(self, state: GradingState) -> GradingState:
        """Analyze essay quality using smart processor"""
        workflow_logger.step(2, "ANALYZE QUALITY", "START",
                             "Running smart query processor")

        # Learn from a sample (you'd cache this in production)
        self.query_processor.learn_from_documents([state["essay"]])

        # Analyze essay
        analysis = self.query_processor.analyze_query(state["essay"][:1000])

        state["quality_multiplier"] = analysis.similarity_boost
        state["specificity_score"] = analysis.specificity_score

        details = f"Type: {analysis.query_type}, Specificity: {analysis.specificity_score:.2f}, Multiplier: {analysis.similarity_boost:.2f}"
        workflow_logger.step(2, "ANALYZE QUALITY", "SUCCESS", details)

        return state

    async def generate_prompts(self, state: GradingState) -> GradingState:
        """Generate criterion prompts using agents.py"""
        num_criteria = len(state["rubric"]["criteria"])
        workflow_logger.step(3, "GENERATE PROMPTS", "START",
                             f"Creating prompts for {num_criteria} criteria using agents.py")

        import sys
        from pathlib import Path
        sys.path.append(str(Path(__file__).parent.parent))
        from agents import get_prompt

        # Generate prompts for all criteria
        criteria_prompts = []
        for criterion in state["rubric"]["criteria"]:
            # Create prompt data structure expected by agents.py
            criteria_prompts.append({
                "criterionName": criterion["name"],
                "prompt": {
                    "header": f"{criterion['name']}",
                    "instructions": self._get_criterion_instructions(criterion),
                    "introduction": f"Evaluate the {criterion['name']} criterion"
                }
            })

        prompt_data = get_prompt(
            criteria_prompts=criteria_prompts,
            tone=state["tone"],
            quality_multiplier=state["quality_multiplier"],
            specificity_score=state["specificity_score"],
            has_supporting_docs=False,  # Will be determined after retrieval
            grading_brackets=state["rubric"].get("gradingBrackets"),
            criteria_weights=state["rubric"]["criteria"],
            criteria_data=state["rubric"]["criteria"]
        )

        state["criteria_prompts"] = prompt_data.get("criteria_prompts", {})

        workflow_logger.step(3, "GENERATE PROMPTS", "SUCCESS",
                             f"Generated {len(state['criteria_prompts'])} prompts")

        return state

    async def retrieve_context(self, state: GradingState) -> GradingState:
        """Retrieve context from Qdrant"""
        workflow_logger.step(4, "RETRIEVE CONTEXT", "START",
                             "Querying Qdrant for course materials")

        import sys
        from pathlib import Path
        sys.path.append(str(Path(__file__).parent.parent))
        from llamaindex_rag.llamaindex_retrieval import get_retrieval_engine

        retriever = get_retrieval_engine()

        # Get dual context
        dual_results = retriever.retrieve_dual_context(
            query=state["essay"][:500],
            professor_username=state["professor_username"],
            course_id=state["course_id"],
            assignment_title=state["assignment_title"]
        )

        course_context = " ".join([
            r["text"] for r in dual_results.get("course_content", {}).get("results", [])
        ])

        supporting_context = " ".join([
            r["text"] for r in dual_results.get("supporting_docs", {}).get("results", [])
        ])

        state["context"] = {
            "course_context": course_context,
            "supporting_context": supporting_context,
            "has_supporting_docs": len(supporting_context) > 100
        }

        course_chunks = dual_results.get(
            "course_content", {}).get("total_results", 0)
        supporting_chunks = dual_results.get(
            "supporting_docs", {}).get("total_results", 0)
        details = f"Retrieved {course_chunks} course chunks, {supporting_chunks} supporting chunks"
        workflow_logger.step(4, "RETRIEVE CONTEXT", "SUCCESS", details)

        return state

    async def evaluate_all_criteria(self, state: GradingState) -> GradingState:
        """Evaluate all criteria in parallel"""
        num_criteria = len(state["rubric"]["criteria"])
        workflow_logger.step(5, "EVALUATE CRITERIA", "START",
                             f"Spawning {num_criteria} agent threads")
        workflow_logger.parallel_grading(num_criteria)

        # Debug: Check what criteria_prompts contains
        logger.info(
            f"🔍 criteria_prompts keys: {list(state.get('criteria_prompts', {}).keys())}")
        logger.info(
            f"🔍 rubric criteria names: {[c['name'] for c in state['rubric']['criteria']]}")

        # Create agents
        agents = []
        model = state.get("model")  # Get model from state
        for criterion in state["rubric"]["criteria"]:
            agent = CriterionAgent(criterion, self.llm_url, model=model)
            agents.append((agent, criterion["name"]))

        # Create evaluation tasks
        tasks = []
        task_names = []
        for agent, criterion_name in agents:
            if criterion_name in state["criteria_prompts"]:
                prompt_data = state["criteria_prompts"][criterion_name]
                logger.info(
                    f"🔍 Prompt data for '{criterion_name}': type={type(prompt_data)}, keys={list(prompt_data.keys()) if isinstance(prompt_data, dict) else 'N/A'}")

                prompt = prompt_data.get("prompt") if isinstance(
                    prompt_data, dict) else prompt_data
                logger.info(
                    f"🔍 Extracted prompt for '{criterion_name}': type={type(prompt)}, len={len(str(prompt)) if prompt else 0}")

                task = agent.evaluate(
                    essay=state["essay"],
                    question=state["question"],
                    context=state["context"],
                    prompt_template=prompt,
                    quality_multiplier=state["quality_multiplier"]
                )
                tasks.append(task)
                task_names.append(criterion_name)
            else:
                logger.warning(
                    f"⚠️ No prompt found for criterion: {criterion_name}")

        # Run in parallel (⚡ THE MAGIC HAPPENS HERE!)
        start_time = time.time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        parallel_time = time.time() - start_time

        # Process results with validation
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                criterion_name = task_names[i] if i < len(
                    task_names) else "unknown"
                logger.error(f"Agent failed for {criterion_name}: {result}")
                # Set zero score for failed criteria
                state["criterion_scores"][criterion_name] = 0
                state["feedbacks"][criterion_name] = f"Evaluation error: {str(result)}"
                continue

            # Validate result structure
            if not isinstance(result, dict):
                logger.error(f"Invalid result type: {type(result)}")
                continue

            if "criterion" not in result:
                logger.error(f"Result missing 'criterion' key: {result}")
                continue

            criterion_name = result["criterion"]
            state["criterion_scores"][criterion_name] = result.get("score", 0)
            state["feedbacks"][criterion_name] = result.get(
                "feedback", "No feedback provided")

            # Log each criterion completion
            workflow_logger.criterion_complete(
                criterion_name, result.get("score", 0), parallel_time)

        workflow_logger.step(5, "EVALUATE CRITERIA", "SUCCESS",
                             f"All {num_criteria} criteria graded in {parallel_time:.2f}s")

        return state

    async def aggregate_scores(self, state: GradingState) -> GradingState:
        """Aggregate final results"""
        workflow_logger.step(6, "AGGREGATE SCORES", "START",
                             "Calculating final score and feedback")

        # Always calculate scores even if flagged - is_valid is just a UI indicator
        # Flagged submissions should still be graded normally

        # Calculate total
        total_score = sum(state["criterion_scores"].values())
        max_score = sum(c["weight"] for c in state["rubric"]["criteria"])
        percentage = (total_score / max_score * 100) if max_score > 0 else 0

        state["final_score"] = percentage

        # Build feedback
        feedback_parts = []

        # Add grade bracket with robust parsing
        for bracket in state["rubric"].get("gradingBrackets", []):
            try:
                range_str = bracket.get("range", "")
                if not range_str:
                    continue

                range_parts = range_str.split("-")
                if len(range_parts) == 2:
                    # Strip whitespace and percentage symbols
                    low_str = range_parts[0].strip().rstrip('%')
                    high_str = range_parts[1].strip().rstrip('%')

                    low, high = float(low_str), float(high_str)
                    if low <= percentage <= high:
                        feedback_parts.append(
                            f"**Grade: {bracket['label']} ({percentage:.1f}%)**")
                        feedback_parts.append(bracket.get("expectation", ""))
                        break
            except (ValueError, KeyError) as e:
                logger.warning(
                    f"Failed to parse grading bracket {bracket}: {e}")
                continue

        # Add criterion feedback
        for criterion_name, feedback in state["feedbacks"].items():
            score = state["criterion_scores"].get(criterion_name, 0)

            # Safely get weight with fallback
            weight = None
            for c in state["rubric"]["criteria"]:
                if c["name"] == criterion_name:
                    weight = c["weight"]
                    break

            if weight is None:
                logger.warning(
                    f"Could not find weight for criterion: {criterion_name}")
                weight = 0

            feedback_parts.append(
                f"\n**{criterion_name}** ({score:.1f}/{weight}):")
            feedback_parts.append(feedback)

        state["final_feedback"] = "\n".join(feedback_parts)

        # ✅ OUTPUT VALIDATION: Check for anomalies in grading model output
        # This catches attacks that slipped through input validation
        try:
            output_validation = self.guardrail.validate_output(
                essay_text=state["essay"],
                score=percentage,
                feedback=state["final_feedback"],
                max_score=100.0
            )

            # Log any output issues detected
            if output_validation.issues:
                issue_summary = [
                    f"{i.issue_type}({i.risk_level.name})"
                    for i in output_validation.issues[:3]
                ]
                logger.warning(
                    f"⚠️ OUTPUT VALIDATION DETECTED: {', '.join(issue_summary)}"
                )

            # Handle critical output anomalies
            if output_validation.should_reject:
                logger.error(
                    f"❌ OUTPUT VALIDATION FAILED - Rejecting grade for assignment {state['assignment_title']}"
                )
                blocking_issues = [
                    i.description for i in output_validation.issues if i.blocking]

                # Override score and feedback
                state["final_score"] = 0
                state["final_feedback"] = (
                    "**Grade Rejected Due to Output Anomalies**\n\n"
                    "The grading system detected suspicious patterns in the output. "
                    "This may indicate a gaming attempt or model malfunction.\n\n"
                    f"Issues detected: {', '.join(blocking_issues)}\n\n"
                    "Please contact your instructor for manual review."
                )

                workflow_logger.step(6, "AGGREGATE SCORES", "FAILED",
                                     f"Output rejected: {', '.join(blocking_issues[:2])}")

            # Flag for manual review (but don't reject)
            elif output_validation.should_review:
                logger.warning(
                    f"⚠️ OUTPUT FLAGGED FOR REVIEW - assignment {state['assignment_title']}"
                )
                review_issues = [
                    i.description for i in output_validation.issues]

                # Add review flag to feedback (don't modify score)
                state["final_feedback"] += (
                    "\n\n---\n"
                    "**⚠️ Flagged for Instructor Review**\n"
                    f"Note: {review_issues[0]}"
                )

                workflow_logger.step(6, "AGGREGATE SCORES", "SUCCESS",
                                     f"Final score: {percentage:.1f}% (flagged for review)")
            else:
                # No output issues - normal success
                workflow_logger.step(6, "AGGREGATE SCORES", "SUCCESS",
                                     f"Final score: {percentage:.1f}%")

        except Exception as e:
            # Output validation failed - log but don't crash
            logger.error(f"❌ Output validation error (non-critical): {str(e)}")
            workflow_logger.step(6, "AGGREGATE SCORES", "SUCCESS",
                                 f"Final score: {percentage:.1f}% (validation error: {str(e)[:50]})")

        return state

    def _get_criterion_instructions(self, criterion: dict) -> List[str]:
        """Generate default instructions for a criterion"""
        description = criterion.get(
            'description', 'the criterion requirements')
        return [
            f"Check if the essay addresses {criterion['name']}",
            f"Evaluate based on {description}",
            f"Score out of {criterion['weight']} points"
        ]
