/**
 * Hybrid Essay Grading Controller
 * Uses queues for async processing but maintains same API
 */

import { Request, Response } from "express";
import { Course } from "../../models/Course";
import { Assignment, IAssignment } from "../../models/Assignment";
import { queueService } from "../../services/queueService";
import { redisService } from "../../services/redisService";
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
    const { courseId, assignmentId, essay, model, tone, currentRubric, useQueue = true, useCurrentRubric } = req.body;
    const username = req?.user?.username;

    // Validate required fields
    if (!courseId || !assignmentId || !essay || !username) {
      return res.status(400).json({ 
        message: "Missing required fields: courseId, assignmentId, essay, or username" 
      });
    }

    // Validate course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Validate assignment exists and belongs to course
    const assignment: IAssignment | null = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found or does not belong to this course" });
    }

    // Validate assignment has required fields
    if (!assignment.question || !assignment.config_prompt) {
      return res.status(400).json({ 
        message: "Assignment is missing required fields: question or config_prompt" 
      });
    }

    // If useQueue is false, use the old synchronous method
    if (useQueue === false) {
      return await gradeSingleEssaySync(req, res);
    }

    // NEW: Use queue-based async processing
    try {
      // IMPORTANT: Default to the SAVED rubric/prompt like sync. Only use currentRubric
      // if explicitly requested and valid.
      let computedConfigPrompt = assignment.config_prompt;
      let rubricToSend = assignment.config_rubric;
      let criteriaToSend = assignment.config_rubric.criteria;
      let gradingBracketsToSend = assignment.config_rubric.gradingBrackets;

      if (useCurrentRubric === true && currentRubric && currentRubric.mainCriteria && currentRubric.mainCriteria.length > 0) {
        try {
          const promptResponse = await axios.post(
            `${PYTHON_SERVICE_URL}/generate_prompt`,
            {
              criteria: currentRubric.mainCriteria,
              courseId,
              assignmentTitle: assignmentId,
              username,
              model,
            }
          );
          if (promptResponse.data && typeof promptResponse.data === 'object' && 'criteria_prompts' in promptResponse.data) {
            computedConfigPrompt = (promptResponse.data as any).criteria_prompts;
            rubricToSend = currentRubric;
            // Align criteria and gradingBrackets with currentRubric to match prompt criterion names
            criteriaToSend = (currentRubric as any).criteria || currentRubric.mainCriteria || assignment.config_rubric.criteria;
            gradingBracketsToSend = (currentRubric as any).gradingBrackets || assignment.config_rubric.gradingBrackets;
          }
        } catch (e) {
          console.error("Failed to pre-generate prompts for current rubric (async). Falling back to stored prompts.", e);
          computedConfigPrompt = assignment.config_prompt;
          rubricToSend = assignment.config_rubric;
          criteriaToSend = assignment.config_rubric.criteria;
          gradingBracketsToSend = assignment.config_rubric.gradingBrackets;
        }
      }

      // Create task data (same as original, but for queue)
      const taskData = {
        courseId,
        assignmentId,
        essay,
        model: model || "Qwen/Qwen2.5-14B-Instruct",
        tone: tone || "professional",
        currentRubric: rubricToSend,
        question: assignment.question,
        config_prompt: computedConfigPrompt,
        gradingBrackets: gradingBracketsToSend,
        criteria: criteriaToSend,
        username, // include for Flask
      };

      // Publish task to queue
      const taskId = await queueService.publishTask(
        'grade-single-essay',
        taskData,
        username
      );

      // Store initial task status in Redis
      await redisService.storeTaskResult(taskId, {
        taskId,
        status: 'queued',
        createdAt: Date.now()
      });

      console.log(`📤 Essay grading task queued: ${taskId} for user: ${username}`);

      // Return task ID immediately (same response format as before)
      res.status(201).json({
        message: "Essay grading task queued successfully",
        taskId,
        status: "queued",
        estimatedTime: "30-60 seconds"
      });

    } catch (queueError) {
      console.error("❌ Queue error, falling back to sync:", queueError);
      // Fallback to synchronous processing if queue fails
      return await gradeSingleEssaySync(req, res);
    }

  } catch (error) {
    console.error("❌ Error in gradeSingleEssay:", error);
    res.status(500).json({ 
      message: "Error processing essay grading request",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Fallback synchronous method (your original logic)
const gradeSingleEssaySync = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId, assignmentId, essay, model, tone, currentRubric } = req.body;
    const username = req?.user?.username;

    const assignment: IAssignment | null = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });

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
            assignmentTitle: assignment?._id,
            username,
            model,
          }
        );
        
        if (promptResponse.data && typeof promptResponse.data === 'object' && 'criteria_prompts' in promptResponse.data) {
          config_prompt = (promptResponse.data as any).criteria_prompts;
          console.log("Generated prompts for current rubric:", config_prompt);
        } else {
          throw new Error("Invalid response format from prompt generation service");
        }
      } catch (promptError) {
        console.error("Error generating prompts for current rubric:", promptError);
        config_prompt = assignment?.config_prompt;
      }
    } else {
      config_prompt = assignment?.config_prompt;
    }

    const requestData = {
      courseId,
      assignmentId,
      essay,
      model: model || "google/gemma-3-27b-it",
      tone: tone || "professional",
      currentRubric: currentRubric || assignment?.config_rubric,
      question: assignment?.question,
      config_prompt,
      gradingBrackets: assignment?.config_rubric.gradingBrackets,
      criteria: assignment?.config_rubric.criteria
    };
    
    const response: any = await axios.post(
      `${PYTHON_SERVICE_URL}/grade_single_essay`,
      requestData
    );

    return res.status(201).json(response.data);
  } catch (error) {
    console.error("Error in sync grading:", error);
    return res.status(500).json({ message: "Error grading essay" });
  }
};

// Get task result endpoint (for async processing)
export const getTaskResult = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { taskId } = req.params;
    const username = req?.user?.username;

    if (!taskId) {
      return res.status(400).json({ message: "Task ID is required" });
    }

    // Get task result from Redis
    const result = await redisService.getTaskResult(taskId);
    
    if (!result) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Return task status and result
    res.status(200).json({
      taskId,
      status: result.status,
      result: result.result,
      error: result.error,
      progress: result.progress,
      createdAt: result.createdAt,
      completedAt: result.completedAt
    });

  } catch (error) {
    console.error("❌ Error getting task result:", error);
    res.status(500).json({ 
      message: "Error getting task result",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
