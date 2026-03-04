# agents.py - Simplified for clarity and anti-hallucination

# Common components for all prompts
ROLE_DESCRIPTION = """
You are a {tone} academic essay grader with expertise in evaluating student work. 
Provide fair, consistent scoring and constructive feedback based on the rubric.
Do NOT use external knowledge or make up quotes.
"""

GRADING_PRINCIPLES = """
GRADING PRINCIPLES:
- Grade based ONLY on those exact phrases from the student's writing
- Reference specific parts of their essay in your feedback only if necessary
- Be consistent with the rubric criteria and point allocation
- Apply quality adjustments for response relevance and engagement
- For responses that don't address the assignment: assign 0 points
- IMPORTANT: If the student's response is not relevant to the assignment question, assign 0 points
- IMPORTANT: If the student's response is not relevant to the course content, assign 0 points
- IMPORTANT: Assign 0 if the student response follows guidelines but does not address the assignment question or course content or is gibberish

TONE-SPECIFIC SCORING BEHAVIOR:
You are a {tone} grader. {tone_instruction}

CONCRETE SCORING GUIDELINES:
- LENIENT: Add 10-15% bonus for effort, round up borderline scores, give 60-70% partial credit
- MODERATE: Use standard grading, give 60-70% partial credit, balance feedback
- STRICT: Subtract 10-15% for incomplete work, round down borderline scores, give 30-40% partial credit

IMPORTANT: Your tone setting significantly affects the final score. Apply these guidelines consistently.
- IMPORTANT: If the student's response is not relevant to the assignment question, assign 0 points
- IMPORTANT: If the student's response is not relevant to the course content, assign 0 points
- IMPORTANT: Assign 0 if the student response follows guidelines but does not address the assignment question or course content or is gibberish

TONE-SPECIFIC SCORING BEHAVIOR:
You are a {tone} grader. {tone_instruction}

CONCRETE SCORING GUIDELINES:
- LENIENT: Add 10-15% bonus for effort, round up borderline scores, give 60-70% partial credit
- MODERATE: Use standard grading, give 60-70% partial credit, balance feedback
- STRICT: Subtract 10-15% for incomplete work, round down borderline scores, give 30-40% partial credit

IMPORTANT: Your tone setting significantly affects the final score. Apply these guidelines consistently.
"""


def get_feedback_instructions(quality_multiplier=1.0, specificity_score=0.5):
    """Generate quality-aware feedback instructions based on essay analysis."""
    if quality_multiplier < 0.7:  # Low quality / gibberish responses (specificity < 0.3)
        return """
**For Low-Quality/Irrelevant Responses (Gibberish Detection):**
- This response shows minimal or zero engagement with the assignment (quality score: {:.2f})
- State clearly that the response doesn't address the assignment requirements
- Be direct: "This response does not address the assignment question and lacks relevant academic content."
- IMPORTANT: Do NOT include any numerical scores or grades in your feedback text
- Focus on qualitative feedback only - the score will be calculated separately
- IMPORTANT: Do NOT include any numerical scores or grades in your feedback text
- Focus on qualitative feedback only - the score will be calculated separately
""".format(quality_multiplier)
    elif quality_multiplier < 0.9:  # Moderate quality (specificity 0.3-0.7)
        return """
**For Moderate-Quality Responses:**
- This response shows moderate engagement (quality score: {:.2f})
- Reference specific parts of their essay when giving feedback only if necessary
- Identify what they did well and provide constructive feedback
- Provide 1-2 concrete suggestions based on their actual content if required
- Keep feedback between 50-60 words
- IMPORTANT: Do NOT include any numerical scores or grades in your feedback text
- Focus on qualitative feedback only - the score will be calculated separately
- IMPORTANT: Do NOT include any numerical scores or grades in your feedback text
- Focus on qualitative feedback only - the score will be calculated separately
""".format(quality_multiplier)
    else:  # High quality responses (specificity > 0.7)
        return """
**For High-Quality Responses:**
- This response shows strong engagement with course material (quality score: {:.2f})
- Quote or reference specific strengths in their essay only if necessary
- Provide nuanced feedback that pushes them to the next level
- Suggest ways to deepen their analysis based on what they've written
- Keep feedback between 50-60 words
- IMPORTANT: Do NOT include any numerical scores or grades in your feedback text
- Focus on qualitative feedback only - the score will be calculated separately
- IMPORTANT: Do NOT include any numerical scores or grades in your feedback text
- Focus on qualitative feedback only - the score will be calculated separately
""".format(quality_multiplier)


def get_quality_analysis_note(quality_multiplier, specificity_score):
    """Generate a note about the quality analysis for transparency."""
    if quality_multiplier < 0.7:
        return f"\n[Analysis: Response specificity: {specificity_score:.3f}, Quality multiplier: {quality_multiplier:.2f} - Low engagement detected]"
    elif quality_multiplier > 1.1:
        return f"\n[Analysis: Response specificity: {specificity_score:.3f}, Quality multiplier: {quality_multiplier:.2f} - Strong engagement detected]"
    else:
        return ""


def _create_prompt_template(prompt_data, instructions, feedback_instructions, quality_multiplier, quality_note, has_supporting_docs=False, grading_brackets=None, criterion_max_points=None, criterion_scoring_levels=None, tone="moderate", criterion_description=None, prompt_introduction=None):
    """Create the standardized prompt template to eliminate duplication."""

    # Define tone-specific instructions with concrete scoring guidance
    tone_instructions = {
        "lenient": """be more forgiving and generous in scoring:
- Add 10-15% bonus to scores for effort and partial understanding
- Give credit for attempts even if incomplete
- Focus on what students did well rather than what they missed
- Be more generous with partial credit (give 60-70% for attempts)
- Round up borderline scores
- Emphasize positive aspects in feedback""",
        "moderate": """maintain balanced scoring that is fair and consistent with standard academic expectations:
- Use standard academic grading practices
- Give appropriate partial credit (50-60% for attempts)
- Balance positive and negative feedback
- Apply consistent standards across all students""",
        "strict": """be more rigorous in scoring, requiring higher standards:
- Subtract 10-15% from scores for incomplete or unclear work
- Require clear evidence of understanding for full credit
- Be less generous with partial credit (give 30-40% for attempts)
- Round down borderline scores
- Hold students to high academic standards
- Emphasize areas for improvement in feedback"""
    }
    tone_instruction = tone_instructions.get(tone, tone_instructions["moderate"])

    # Base template with question, essay and course content
    template = f"""
 {ROLE_DESCRIPTION.format(tone=tone)}
 
 ========== ASSIGNMENT QUESTION ==========
 {{{{question}}}}
 ========== END OF QUESTION ==========
 
 ========== STUDENT ESSAY (ONLY SOURCE FOR QUOTES) ==========
 {{{{essay}}}}
 ========== END OF STUDENT ESSAY ==========
 
 ========== COURSE CONTENT (PRIMARY GRADING SOURCE) ==========
 {{{{course_context}}}}
 ========== END OF COURSE CONTENT =========="""

    # Conditionally add supporting docs section
    if has_supporting_docs:
        template += """

========== SUPPORTING DOCUMENTS (FACT-CHECKING & REFERENCE) ==========
{{{{supporting_context}}}}
========== END OF SUPPORTING DOCUMENTS =========="""

    # Continue with the rest of the template
    max_points_str = f" (Max: {criterion_max_points} points)" if criterion_max_points is not None else ""
    template += f"""
 
 GRADING TASK: {prompt_data['prompt']['header']}{max_points_str}
 """
    # Optionally include criterion description
    if criterion_description:
        template += f"""
 
 CRITERION DESCRIPTION:
 {criterion_description}
 """
    # Optionally include the per-criterion prompt introduction
    if prompt_introduction:
        template += f"""
 
 EVALUATION INTRODUCTION:
 {prompt_introduction}
 """
    # Always include the concrete grading checks
    template += f"""
 
 GRADING CRITERIA:
 {instructions}"""

    # Add grading brackets section if available
    if grading_brackets and len(grading_brackets) > 0 and criterion_max_points is not None:
        template += """

SCORING BRACKETS FOR THIS CRITERION:"""
        for i, bracket in enumerate(grading_brackets):
            # Convert percentage range to point range
            try:
                percent_range = bracket['range']
                if '-' in percent_range:
                    low, high = percent_range.split('-')
                    low = float(low.strip())
                    high = float(high.strip())
                    low_points = round((low / 100.0) * criterion_max_points, 2)
                    high_points = round((high / 100.0) * criterion_max_points, 2)
                    points_str = f"{low_points} - {high_points} points"
                else:
                    points_str = ""
            except Exception:
                points_str = ""
            
            # Get expectation from criterion's scoring levels (if available)
            expectation = None
            if criterion_scoring_levels and isinstance(criterion_scoring_levels, list):
                if i < len(criterion_scoring_levels):
                    expectation = criterion_scoring_levels[i]
            
            # If no scoring level, use the bracket expectation from grading_brackets
            if not expectation or (isinstance(expectation, str) and expectation.strip() == ""):
                expectation = bracket.get('expectation', '')
            
            # Build the line
            if expectation and expectation.strip():
                template += f"""
- {bracket['label']} ({bracket['range']}%): {points_str}: {expectation}"""
            else:
                template += f"""
- {bracket['label']} ({bracket['range']}%): {points_str}"""
        
        template += f"""

BRACKET-BASED GRADING INSTRUCTIONS:
- Assign a score out of {criterion_max_points} for this criterion.
- Use the bracket descriptions and point ranges to guide your scoring and feedback.
- Ensure your score falls within the range of the selected bracket.
- Don't just give the edge scores per bracket, you can give scores within the bracket as per how the answer has been written.
- For brackets which ahve less than whateer percentage, give marks as per how answer is drafted and if it is bad, give low marks.
"""

    template += f"""
 
 {GRADING_PRINCIPLES.format(tone=tone, tone_instruction=tone_instruction)}    
 
 CONTEXT USAGE INSTRUCTIONS:
 - Focus EXCLUSIVELY on the specific criterion being graded
 - Use COURSE CONTENT as your PRIMARY source for grading criteria and standards
 - Consider the ASSIGNMENT QUESTION to assess alignment and relevance
 - Grade based on the criterion requirements, the student's essay, and course content alignment"""

    if has_supporting_docs:
        template += """
- Use SUPPORTING DOCUMENTS for fact-checking and additional context only
- Supporting documents provide supplementary information but should not override course content"""

    template += f"""
 
  {feedback_instructions}
 
  IMPORTANT GRADING RULES:
  Do NOT paraphrase or rewrite what the student said. Do NOT reference content not written by the student. If student essay doesn't address the criteria, say so directly. Focus ONLY on the specific criterion being graded. Base grading primarily on COURSE CONTENT alignment and the ASSIGNMENT QUESTION. Do NOT quote from course content or supporting documents; only quote the student's essay if necessary.
  
  Quality Level: {quality_multiplier:.2f} (affects final score){quality_note}
  
  FINAL TONE REMINDER:
  As a {tone} grader, remember to apply your tone-specific scoring behavior:
  LENIENT: Be generous, add bonuses, round up, emphasize positives.
  MODERATE: Be balanced, use standard practices, give fair partial credit.
  STRICT: Be rigorous, subtract for issues, round down, emphasize improvements.
  """

    # Append JSON example and schema as plain strings to avoid f-string parsing of braces
    # Use very explicit, directive language to prevent LLM from echoing instructions
    # Put JSON instruction at the very end and make it extremely clear
    json_example_block = """

=== OUTPUT FORMAT ===
You MUST return ONLY a JSON object. No other text. No explanations. No instructions. No bullet points.

Return this exact format:
{{"score": 0, "feedback": ""}}

Replace 0 with the actual score (integer) and "" with the actual feedback (string).

DO NOT return anything else. DO NOT repeat these instructions. DO NOT add bullet points. Just return the JSON object.
"""

    # Trimmed guidance: example + brief rules (schema removed for brevity)
    template += "\n\n" + json_example_block

    return template


def get_prompt(criteria_prompts, criterion_name=None, tone="moderate", quality_multiplier=1.0, specificity_score=0.5, has_supporting_docs=False, grading_brackets=None, criteria_weights=None, criteria_data=None):
    """
    Assembles prompts with smart gibberish detection and quality-aware scoring.

    Args:
        quality_multiplier (float): 0.6 for gibberish, 1.0 neutral, 1.2 for excellent (from LlamaIndex analysis)
        specificity_score (float): 0.0-1.0 specificity score from DynamicQueryProcessor
        has_supporting_docs (bool): Whether supporting documents are available
        grading_brackets (list): List of grading brackets with label, range, and expectation
        criteria_weights (dict): Mapping from criterion name to max points (weight)
        has_supporting_docs (bool): Whether supporting documents are available
        grading_brackets (list): List of grading brackets with label, range, and expectation
        criteria_weights (dict): Mapping from criterion name to max points (weight)
    """
    if not criteria_prompts:
        return None

    # Validate grading brackets structure
    if grading_brackets is not None:
        if not isinstance(grading_brackets, list):
            raise ValueError(f"grading_brackets must be a list, got {type(grading_brackets)}")
        
        for i, bracket in enumerate(grading_brackets):
            if not isinstance(bracket, dict):
                raise ValueError(f"grading_brackets[{i}] must be a dict, got {type(bracket)}: {bracket}")
            
            if 'label' not in bracket:
                raise ValueError(f"grading_brackets[{i}] missing required field 'label': {bracket}")
            
            if 'range' not in bracket:
                raise ValueError(f"grading_brackets[{i}] missing required field 'range': {bracket}")

    # Build a mapping from criterion name to max points (weight)
    weights_map = {}
    if criteria_weights and isinstance(criteria_weights, list):
        for crit in criteria_weights:
            if isinstance(crit, dict) and 'name' in crit and 'weight' in crit:
                weights_map[crit['name']] = crit['weight']
    # Validate grading brackets structure
    if grading_brackets is not None:
        if not isinstance(grading_brackets, list):
            raise ValueError(f"grading_brackets must be a list, got {type(grading_brackets)}")
        
        for i, bracket in enumerate(grading_brackets):
            if not isinstance(bracket, dict):
                raise ValueError(f"grading_brackets[{i}] must be a dict, got {type(bracket)}: {bracket}")
            
            if 'label' not in bracket:
                raise ValueError(f"grading_brackets[{i}] missing required field 'label': {bracket}")
            
            if 'range' not in bracket:
                raise ValueError(f"grading_brackets[{i}] missing required field 'range': {bracket}")

    # Build a mapping from criterion name to max points (weight)
    weights_map = {}
    if criteria_weights and isinstance(criteria_weights, list):
        for crit in criteria_weights:
            if isinstance(crit, dict) and 'name' in crit and 'weight' in crit:
                weights_map[crit['name']] = crit['weight']

    if criterion_name:
        # Find the prompt for the specific criterion
        prompt_data = next(
            (item for item in criteria_prompts if item["criterionName"] == criterion_name),
            None
        )
        if not prompt_data:
            return None

        # Assemble the instructions with bullet points
        instructions = "\n".join(
            [f"• {instr}" for instr in prompt_data["prompt"]["instructions"]])

        # Get max points and scoring levels for this criterion
        criterion_max_points = weights_map.get(criterion_name)
        criterion_scoring_levels = None
        if criteria_data and isinstance(criteria_data, list):
            for crit in criteria_data:
                if crit.get('name') == criterion_name:
                    criterion_scoring_levels = crit.get('scoringLevels')
                    break

        # Get max points and scoring levels for this criterion
        criterion_max_points = weights_map.get(criterion_name)
        criterion_scoring_levels = None
        if criteria_data and isinstance(criteria_data, list):
            for crit in criteria_data:
                if crit.get('name') == criterion_name:
                    criterion_scoring_levels = crit.get('scoringLevels')
                    break

        # Create standardized prompt using reusable template
        full_prompt = _create_prompt_template(
            prompt_data=prompt_data,
            instructions=instructions,
            feedback_instructions=get_feedback_instructions(quality_multiplier, specificity_score),
            quality_multiplier=quality_multiplier,
            quality_note=get_quality_analysis_note(quality_multiplier, specificity_score),
            has_supporting_docs=has_supporting_docs,
            grading_brackets=grading_brackets,
            criterion_max_points=criterion_max_points,
            criterion_scoring_levels=criterion_scoring_levels,
            tone=tone,
            criterion_description=(
                next((crit.get('description') for crit in (criteria_data or []) if crit.get('name') == criterion_name), None)
            ),
            prompt_introduction=prompt_data.get('prompt', {}).get('introduction')
        )
        return {
            "prompt": full_prompt
        }

    # If no criterion_name is specified, return all prompts
    assembled_prompts = {}
    for prompt_data in criteria_prompts:
        criterion_name = prompt_data["criterionName"]
        instructions = "\n".join(
            [f"• {instr}" for instr in prompt_data["prompt"]["instructions"]])
        criterion_max_points = weights_map.get(criterion_name)
        
        # Get scoring levels and description for this criterion
        criterion_scoring_levels = None
        criterion_description = None
        if criteria_data and isinstance(criteria_data, list):
            for crit in criteria_data:
                if crit.get('name') == criterion_name:
                    criterion_scoring_levels = crit.get('scoringLevels')
                    criterion_description = crit.get('description')
                    break
        
        criterion_max_points = weights_map.get(criterion_name)
        
        # Get scoring levels and description for this criterion
        criterion_scoring_levels = None
        criterion_description = None
        if criteria_data and isinstance(criteria_data, list):
            for crit in criteria_data:
                if crit.get('name') == criterion_name:
                    criterion_scoring_levels = crit.get('scoringLevels')
                    criterion_description = crit.get('description')
                    break
        
        full_prompt = _create_prompt_template(
            prompt_data=prompt_data,
            instructions=instructions,
            feedback_instructions=get_feedback_instructions(quality_multiplier, specificity_score),
            quality_multiplier=quality_multiplier,
            quality_note=get_quality_analysis_note(quality_multiplier, specificity_score),
            has_supporting_docs=has_supporting_docs,
            grading_brackets=grading_brackets,
            criterion_max_points=criterion_max_points,
            criterion_scoring_levels=criterion_scoring_levels,
            tone=tone,
            criterion_description=criterion_description,
            prompt_introduction=prompt_data.get('prompt', {}).get('introduction')
        )
        assembled_prompts[criterion_name] = {
            "prompt": full_prompt
        }

    return {"criteria_prompts": assembled_prompts}
