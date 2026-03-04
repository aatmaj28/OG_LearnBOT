import { Request, Response } from "express";
import { Course } from "../../models/Course";
import { Assignment, IAssignment } from "../../models/Assignment";
import { GradingStats, IGradingStats } from "../../models/GradingStats";
import axios from "axios";
import { Types } from "mongoose";
import { GradingHistory } from "../../models/GradingHistory";

// Add environment variable for Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:6001";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

interface BulkGradingRequest {
  courseId: string;
  assignmentId: string;
  s3_excel_link: string;
  model?: string;
  tone?: string;
}

// Function to sanitize file names for S3/Minio compatibility
const sanitizeFileName = (fileName: string): string => {
  return (
    fileName
      // Replace spaces with underscores
      .replace(/\s+/g, "_")
      // Replace special characters with underscores
      .replace(/[!@#$%^&*()+\=\[\]{}|\\:;"'<>,?\/]/g, "_")
      // Replace any remaining non-alphanumeric characters (except -_.)
      .replace(/[^a-zA-Z0-9-_\.]/g, "_")
      // Replace multiple consecutive underscores with a single one
      .replace(/_{2,}/g, "_")
      // Remove leading/trailing underscores
      .replace(/^_+|_+$/g, "")
      // Convert to lowercase
      .toLowerCase()
  );
};

// Function to generate a Minio-compatible timestamp
const generateMinioSafeTimestamp = (): string => {
  const now = new Date();
  return now
    .toISOString()
    .replace(/T/g, "-") // Replace T with hyphen
    .replace(/:/g, "-") // Replace colons with hyphens
    .replace(/\./g, "-") // Replace dots with hyphens
    .replace(/Z/g, "") // Remove Z
    .slice(0, 19); // Take only YYYY-MM-DD-HH-mm-ss part
};

// Function to convert scoringLevels from array format to object format
const convertScoringLevelsFormat = (configRubric: any) => {
  if (!configRubric || !configRubric.criteria) {
    return configRubric;
  }

  const convertedCriteria = configRubric.criteria.map((criterion: any) => {
    let scoringLevels = criterion.scoringLevels;

    // If scoringLevels is an array, convert it to object format
    if (Array.isArray(scoringLevels)) {
      scoringLevels = {
        full: scoringLevels[0] || 'Excellent performance in this criterion.',
        partial: scoringLevels[1] || 'Satisfactory performance in this criterion.',
        minimal: scoringLevels[2] || 'Minimal performance in this criterion.'
      };
    }

    // If scoringLevels is missing or not an object, create default
    if (!scoringLevels || typeof scoringLevels !== 'object') {
      scoringLevels = {
        full: 'Excellent performance in this criterion.',
        partial: 'Satisfactory performance in this criterion.',
        minimal: 'Minimal performance in this criterion.'
      };
    }

    return {
      ...criterion,
      scoringLevels: {
        full: scoringLevels.full || 'Excellent performance in this criterion.',
        partial: scoringLevels.partial || 'Satisfactory performance in this criterion.',
        minimal: scoringLevels.minimal || 'Minimal performance in this criterion.'
      }
    };
  });

  return {
    ...configRubric,
    criteria: convertedCriteria
  };
};

export const gradeBulkEssays = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const {
      courseId,
      assignmentId,
      s3_excel_link,
      model,
      tone,
    }: BulkGradingRequest = req.body;
    const username = req?.user?.username;
    const userId = req?.user?.id;

    // Validate required fields
    if (!courseId || !assignmentId || !s3_excel_link) {
      return res.status(400).json({
        message:
          "Missing required fields: courseId, assignmentId, s3_excel_link",
      });
    }

    // Find the assignment
    const assignment: IAssignment | null = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Validate that each criterion has the correct number of scoring levels
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

    // Prepare request data for Flask API
    const requestData = {
      courseId,
      assignmentTitle: assignment._id,
      // assignmentTitle: assignment.title,
      // assignmentTitle: assignment.title,
      config_prompt: assignment.config_prompt,
      question: assignment.question,
      username,
      s3_excel_link,
      model: model || "google/gemma-3-27b-it",
      tone: tone || "moderate",
      gradingBrackets: gradingBrackets, // Pass bracket information (label and range only)
      criteria: criteria, // Pass full criteria with weights and scoring levels
    };
    
    // Log the grading brackets for debugging
    console.log("Bulk grading - Grading brackets being sent:", requestData.gradingBrackets);
    console.log("Bulk grading - Number of brackets:", requestData.gradingBrackets.length);
    
    console.log(requestData);

    // Create GradingHistory upfront before grading starts (to avoid race conditions)
    // For sync grading, we don't have a taskId, so we'll link by finding the most recent without gradingStatsId
    let gradingHistory = await GradingHistory.findOne({
      assignmentId: new Types.ObjectId(assignmentId),
      courseId: new Types.ObjectId(courseId),
      createdBy: new Types.ObjectId(userId),
      gradingStatsId: { $exists: false },
    }).sort({ createdAt: -1 });

    if (!gradingHistory) {
      // Create a new history for this grading session
      gradingHistory = await GradingHistory.create({
        assignmentId: new Types.ObjectId(assignmentId),
        courseId: new Types.ObjectId(courseId),
        createdBy: new Types.ObjectId(userId),
        config_rubric: assignment.config_rubric,
        rubricName: assignment.title || "Untitled Rubric",
        version: 1,
      });
      console.log(`✅ Created GradingHistory ${gradingHistory._id} for sync bulk grading`);
    }

    // Call Flask API for bulk grading with extended timeout
    const response: any = await axios.post(
      `${PYTHON_SERVICE_URL}/grade_bulk_essays`,
      requestData,
      {
        timeout: 1800000 // 30 minutes timeout for bulk grading operations
      }
    );

    if (response.data.s3_graded_link) {
      // Use the new Minio-safe timestamp function
      const timestamp = generateMinioSafeTimestamp();
      const gradedFileName = `graded_${assignment.title}_${timestamp}.xlsx`;
      console.log("Generated file name:", gradedFileName);

      // Create a new GradingStats record
      const gradingStats = await GradingStats.create({
        courseId: new Types.ObjectId(courseId),
        assignmentId: new Types.ObjectId(assignmentId),
        modelName: model || "google/gemma-3-27b-it",
        gradeFile: {
          url: response.data.s3_graded_link,
          originalName: gradedFileName,
          uploadedAt: new Date(),
        },
        totalEssays: response.data.total_essays || 0,
        completedAt: new Date(),
        createdBy: new Types.ObjectId(userId),
      });

      // Link the GradingStats to the GradingHistory we created upfront
      // Re-fetch to ensure we have the latest version (in case another grading completed)
      gradingHistory = await GradingHistory.findById(gradingHistory._id);
      if (gradingHistory && !gradingHistory.gradingStatsId) {
        gradingHistory.gradingStatsId = gradingStats._id as Types.ObjectId;
        gradingHistory.config_rubric = assignment.config_rubric as any; // Update rubric in case it changed
        await gradingHistory.save();
        console.log(`✅ Linked GradingStats ${gradingStats._id} to GradingHistory ${gradingHistory._id}`);
      } else {
        // Fallback: if history was already linked, find/create another one
        console.warn(`⚠️ GradingHistory ${gradingHistory?._id} already has gradingStatsId, creating new history`);
        const newHistory = await GradingHistory.create({
          assignmentId: new Types.ObjectId(assignmentId),
          courseId: new Types.ObjectId(courseId),
          createdBy: new Types.ObjectId(userId),
          config_rubric: assignment.config_rubric,
          rubricName: assignment.title || "Untitled Rubric",
          version: 1,
        });
        newHistory.gradingStatsId = gradingStats._id as Types.ObjectId;
        await newHistory.save();
        console.log(`✅ Created and linked new GradingHistory ${newHistory._id} to GradingStats ${gradingStats._id}`);
      }
    }

    console.log(response.data);
    // Return the response from Flask API
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Error in bulk grading:", error);

    // Log the full error details
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
    }

    // Handle specific error cases
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return res.status(error.response.status).json({
        message: error.response.data.error || "Error in bulk grading",
        details: error.response.data,
      });
    } else if (error.request) {
      // The request was made but no response was received
      return res.status(503).json({
        message: "No response received from grading service",
        details: error.message,
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      return res.status(500).json({
        message: "Error setting up bulk grading request",
        details: error.message,
      });
    }
  }
};
