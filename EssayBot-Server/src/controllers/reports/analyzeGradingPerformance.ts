import { Request, Response } from "express";
import axios from "axios";
import { Schema, Types } from "mongoose";
import { Course } from "../../models/Course";
import { Assignment } from "../../models/Assignment";
import { GradingStats } from "../../models/GradingStats";
import { Criterion } from "../assignments";
import { GradingHistory } from "../../models/GradingHistory";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

interface AnalyzeGradingRequest {
  courseId: string;
  assignmentId: string;
  gradingHistoryId?: string; // Optional parameter to specify which grading history to analyze
  config_rubric: {
    criteria: Criterion[];
  };
}

export const analyzeGradingPerformance = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { courseId, assignmentId, gradingHistoryId } =
      req.body as AnalyzeGradingRequest;

    console.log(`[analyzeGradingPerformance] Request received: courseId=${courseId}, assignmentId=${assignmentId}, gradingHistoryId=${gradingHistoryId}, userId=${req.user?.id}`);

    // Validate required fields
    if (!courseId || !assignmentId) {
      console.log(`[analyzeGradingPerformance] Missing required fields: courseId=${!!courseId}, assignmentId=${!!assignmentId}`);
      return res.status(400).json({
        message: "Missing required fields: courseId, assignmentId",
      });
    }

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Verify assignment exists and belongs to course
    const assignment = await Assignment.findOne({ _id: assignmentId, course: courseId });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found or does not belong to this course" });
    }

    console.log(`[analyzeGradingPerformance] Assignment found: ${assignmentId}, has config_rubric: ${!!assignment.config_rubric}`);

    // Find the GradingHistory record - match production behavior
    // Production: If gradingHistoryId is provided, use it directly without user filtering
    // Otherwise, find the most recent one for this assignment/course
    let gradingHistory = null as any;
    
    if (gradingHistoryId) {
      // Production behavior: find by ID directly without user filtering
      gradingHistory = await GradingHistory.findById(gradingHistoryId).lean();
      
      if (!gradingHistory) {
        console.log(`[analyzeGradingPerformance] Grading history not found for ID: ${gradingHistoryId}`);
        return res.status(400).json({
          message: "No grading history found for this assignment",
        });
      }
    } else {
      // If no ID provided, find the most recent one for this assignment/course
      gradingHistory = await GradingHistory.findOne({
        assignmentId: new Types.ObjectId(assignmentId),
        courseId: new Types.ObjectId(courseId),
      })
        .sort({ createdAt: -1 })
        .lean();
      
      if (!gradingHistory) {
        console.log(`[analyzeGradingPerformance] No grading history found for assignment ${assignmentId}, course ${courseId}`);
        return res.status(400).json({
          message: "No grading history found for this assignment",
        });
      }
    }

    console.log(`[analyzeGradingPerformance] Grading history found: ${gradingHistory._id}, has config_rubric: ${!!gradingHistory.config_rubric}, has gradingStatsId: ${!!gradingHistory.gradingStatsId}`);

    // Get the GradingStats record using the gradingStatsId (production behavior)
    // If the provided history doesn't have a gradingStatsId, try to find one that does
    if (!gradingHistory.gradingStatsId) {
      console.log(`[analyzeGradingPerformance] Grading history has no gradingStatsId - trying to find one with gradingStatsId`);
      
      // Try to find a grading history with gradingStatsId for this assignment/course
      const historyWithStats = await GradingHistory.findOne({
        assignmentId: new Types.ObjectId(assignmentId),
        courseId: new Types.ObjectId(courseId),
        gradingStatsId: { $exists: true, $ne: null },
      })
        .sort({ createdAt: -1 })
        .lean();
      
      if (historyWithStats && historyWithStats.gradingStatsId) {
        console.log(`[analyzeGradingPerformance] Found alternative grading history with gradingStatsId: ${historyWithStats._id}`);
        gradingHistory = historyWithStats;
      } else {
        console.log(`[analyzeGradingPerformance] No grading history with gradingStatsId found - grading may not be complete yet`);
        return res.status(400).json({
          message: "Grading is not complete yet. Please wait for the grading process to finish.",
        });
      }
    }

    const gradingStats = await GradingStats.findById(gradingHistory.gradingStatsId);
    
    if (!gradingStats || !gradingStats.gradeFile?.url) {
      console.log(`[analyzeGradingPerformance] GradingStats not found or has no file. Stats exists: ${!!gradingStats}, has file: ${!!gradingStats?.gradeFile?.url}`);
      return res.status(400).json({
        message: "No grading file found for this grading attempt",
      });
    }

    console.log(`[analyzeGradingPerformance] Grading stats found: ${gradingStats._id}, file URL: ${gradingStats.gradeFile.url}`);

    // Use the rubric from GradingHistory (production behavior)
    if (!gradingHistory.config_rubric) {
      console.log(`[analyzeGradingPerformance] No config_rubric found in gradingHistory`);
      return res.status(400).json({
        message: "No rubric configuration found in grading history. Please ensure the assignment has a valid rubric.",
      });
    }

    // Python analytics service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:6001";
    const response = await axios.post(`${pythonServiceUrl}/analyze_grading`, {
      s3_file_path: gradingStats.gradeFile.url,
      config_rubric: gradingHistory.config_rubric, // Use the rubric from GradingHistory (production behavior)
    });

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Error analyzing grading performance:", error?.response?.data || error?.message || error);
    return res.status(500).json({
      message: "Failed to analyze grading performance",
      error: error?.response?.data || error?.message || String(error),
    });
  }
};
