import { Request, Response } from "express";
import axios from "axios";
import { Assignment, IAssignment } from "../../models/Assignment";

// Add environment variable for Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:6001";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

export const createRubric = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { courseId, question, assignmentId, model } = req.body;
    const username = req.user.username;

    if (!courseId || !question || !assignmentId) {
      return res.status(400).json({
        message: "courseId and question are required",
      });
    }

    // Get the assignment to retrieve guidelines
    const assignment = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // Prepare request payload for Flask
    const payload = {
      courseId,
      question,
      username,
      title: assignmentId,
      model,
      guidelines: assignment.guidelines || "", // Include guidelines in payload
    };

    // Call Flask /generate_rubric endpoint
    const flaskResponse = await axios.post(
      `${PYTHON_SERVICE_URL}/generate_rubric`,
      payload
    );

    const { data }: any = flaskResponse;
    console.log(data?.rubric);
    if ((data as any).success) {
      return res.status(200).json({
        message: "Rubric generated successfully",
        rubric: (data as any).rubric,
      });
    } else {
      return res.status(500).json({
        message: "Failed to generate rubric",
        error: (data as any).error || "Unknown error",
      });
    }
  } catch (error: any) {
    console.error("Error creating rubric:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error?.response?.data?.error || error.message,
    });
  }
};

export const fillCriteriaExpectations = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { courseId, criteriaName, criteriaDescription, question, assignmentId, model, bracketLabels } = req.body;
    const username = req.user.username;

    // Validate required fields
    if (!courseId || !criteriaName || !criteriaDescription || !question || !assignmentId || !bracketLabels) {
      return res.status(400).json({
        message: "courseId, criteriaName, criteriaDescription, question, assignmentId, and bracketLabels are required",
      });
    }

    // Validate bracketLabels is an array
    if (!Array.isArray(bracketLabels) || bracketLabels.length === 0) {
      return res.status(400).json({
        message: "bracketLabels must be a non-empty array",
      });
    }

    // Validate string fields are not empty
    if (!criteriaName.trim() || !criteriaDescription.trim() || !question.trim()) {
      return res.status(400).json({
        message: "criteriaName, criteriaDescription, and question cannot be empty",
      });
    }

    // Prepare request payload for Flask
    const payload = {
      courseId,
      criteriaName,
      criteriaDescription,
      question,
      username,
      title: assignmentId,
      model,
      bracketLabels,
    };

    // Call Flask /fill_expectations endpoint
    const flaskResponse = await axios.post(
      `${PYTHON_SERVICE_URL}/fill_expectations`,
      payload
    );

    const { data }: any = flaskResponse;
    console.log("Flask response data:", data);
    
    // Ensure we always return a consistent response format
    if ((data as any).success && (data as any).expectations) {
      return res.status(200).json({
        message: "Expectations generated successfully",
        expectations: (data as any).expectations,
      });
    } else {
      console.error("Flask response error:", data);
      return res.status(500).json({
        message: "Failed to generate expectations",
        error: (data as any).error || "Unknown error from Flask service",
      });
    }
  } catch (error: any) {
    console.error("Error filling expectations:", error);
    
    // Handle specific Flask service connection errors
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        message: "Flask service is not available",
        error: "The AI service is currently unavailable. Please try again later.",
      });
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(408).json({
        message: "Request timeout",
        error: "The request took too long to complete. Please try again.",
      });
    }
    
    return res.status(500).json({
      message: "Internal server error",
      error: error?.response?.data?.error || error.message,
    });
  }
};
