import { Request, Response } from "express";
import { Course } from "../../models/Course";
import {
  Assignment,
  IAssignment,
  ICreateAssignment,
} from "../../models/Assignment";
import { Schema } from "mongoose";
import axios from "axios";

// Add environment variable for Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:6001";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

export const gradeSingleEssay = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { courseId, assignmentId, essay, model, tone, currentRubric } = req.body;
    const username = req?.user?.username;

    // Validate required fields
    if (!courseId || !assignmentId || !essay || !username) {
      return res.status(400).json({ 
        message: "Missing required fields: courseId, assignmentId, essay, or username" 
      });
    }

    const assignment: IAssignment | null = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Validate assignment has required fields
    if (!assignment.question || !assignment.config_prompt) {
      return res.status(400).json({ 
        message: "Assignment is missing required fields: question or config_prompt" 
      });
    }

    // If currentRubric is provided, generate prompts on-the-fly
    let config_prompt;
    if (currentRubric && currentRubric.mainCriteria && currentRubric.mainCriteria.length > 0) {
      try {
        // Generate prompts for the current rubric
        const promptResponse = await axios.post(
          `${PYTHON_SERVICE_URL}/generate_prompt`,
          {
            criteria: currentRubric.mainCriteria,
            courseId,
            assignmentTitle: assignment._id,
            // assignmentTitle: assignment.title,
            username,
            model,
          }
        );
        
        // Type check the response
        if (promptResponse.data && typeof promptResponse.data === 'object' && 'criteria_prompts' in promptResponse.data) {
          config_prompt = (promptResponse.data as any).criteria_prompts;
          console.log("Generated prompts for current rubric:", config_prompt);
        } else {
          throw new Error("Invalid response format from prompt generation service");
        }
      } catch (promptError) {
        console.error("Error generating prompts for current rubric:", promptError);
        // Fallback to stored config_prompt
        config_prompt = assignment.config_prompt;
      }
    } else {
      // Use stored config_prompt if no current rubric provided
      config_prompt = assignment.config_prompt;
    }

    // Get grading brackets (these only contain label and range)
    const gradingBrackets = assignment.config_rubric?.gradingBrackets || [];
    const rawCriteria = assignment.config_rubric?.criteria || [];

    // Normalize scoringLevels to array form for each criterion (supports object or array in DB)
    const normalizeScoringLevels = (sl: any, numBrackets: number): string[] => {
      let levelsArray: string[] = [];
      if (Array.isArray(sl)) {
        levelsArray = [...sl];
      } else if (sl && typeof sl === 'object') {
        const full = typeof sl.full === 'string' ? sl.full : '';
        const partial = typeof sl.partial === 'string' ? sl.partial : '';
        const minimal = typeof sl.minimal === 'string' ? sl.minimal : '';
        levelsArray = [full, partial, minimal];
      } else {
        levelsArray = [];
      }
      // Ensure we have exactly numBrackets entries. For extra brackets beyond 3, reuse minimal.
      while (levelsArray.length < numBrackets) {
        const fallback = levelsArray.length >= 3 ? levelsArray[2] || '' : '';
        levelsArray.push(fallback);
      }
      return levelsArray.slice(0, numBrackets);
    };

    const criteria = rawCriteria.map((c: any) => ({
      ...c,
      scoringLevels: normalizeScoringLevels(c?.scoringLevels, gradingBrackets.length),
    }));
    
    // Validate that each criterion has the correct number of scoring levels
    for (const criterion of criteria) {
      if (!criterion.scoringLevels || !Array.isArray(criterion.scoringLevels)) {
        return res.status(400).json({ 
          message: `Invalid scoring levels for criterion: ${criterion.name}` 
        });
      }
      
      if (criterion.scoringLevels.length !== gradingBrackets.length) {
        return res.status(400).json({ 
          message: `Criterion "${criterion.name}" has ${criterion.scoringLevels.length} scoring levels but there are ${gradingBrackets.length} grading brackets. Please ensure all criteria have expectations for all brackets.` 
        });
      }
      
      // Check for empty expectations
      for (let i = 0; i < criterion.scoringLevels.length; i++) {
        if (!criterion.scoringLevels[i] || criterion.scoringLevels[i].trim() === '') {
          return res.status(400).json({ 
            message: `Criterion "${criterion.name}" has an empty expectation for bracket ${i + 1} (${gradingBrackets[i]?.label || 'Unknown'}). Please fill in all expectations.` 
          });
        }
      }
    }

    const requestData = {
      courseId,
      assignmentId: assignment._id,
      essay,
      config_prompt: config_prompt,
      question: assignment.question,
      username,
      model,
      currentRubric, // Send rubric with per-domain tone
      gradingBrackets, // Always includes expectation
      criteria: criteria, // Pass full criteria with weights (normalized scoring levels)
    };
    
    // Log the request data for debugging
    console.log("Request data being sent:", {
      courseId: requestData.courseId,
      assignmentId: requestData.assignmentId,
      essayLength: requestData.essay?.length || 0,
      config_promptKeys: Object.keys(requestData.config_prompt || {}),
      question: requestData.question,
      username: requestData.username,
      model: requestData.model,
      gradingBracketsCount: requestData.gradingBrackets?.length || 0,
      criteriaCount: requestData.criteria?.length || 0
    });
    
    const response: any = await axios.post(
      `${PYTHON_SERVICE_URL}/grade_single_essay`,
      requestData
    );
    console.log(response.data);

    return res.status(201).json(response.data);
  } catch (error) {
    console.error("Error grading essay:", error);
    return res.status(500).json({ message: "Error grading essay" });
  }
};
