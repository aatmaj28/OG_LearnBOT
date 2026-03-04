import { Request, Response } from "express";
import { Course } from "../../models/Course";
import { Assignment } from "../../models/Assignment";
import { GradingHistory } from "../../models/GradingHistory";
import axios from "axios";
import { AssignmentUpdatePayload } from ".";

// Add environment variable for Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:6001";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

interface PromptResponse {
  message: string;
  criteria_prompts: Record<string, string>;
}

interface CleanedPromptResponse {
  message: string;
  criteria_prompts: Array<{ criterionName: string; prompt: any }>;
}

// Function to extract the agent number from the header
const getAgentNumber = (header: string): number => {
  const match = header.match(/Agent (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

// Function to clean and sort the prompts response
const cleanPromptsResponse = (
  responseData: PromptResponse
): CleanedPromptResponse => {
  const { message, criteria_prompts } = responseData;
  const cleanedCriteriaPrompts: Record<string, any> = {};

  for (const [criterionName, promptString] of Object.entries(
    criteria_prompts
  )) {
    try {
      let cleanedString = promptString
        .replace(/\n/g, "")
        .replace(/\s+/g, " ")
        .trim();

      cleanedString = cleanedString
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");

      const parsedPrompt = JSON.parse(cleanedString);
      cleanedCriteriaPrompts[criterionName] = parsedPrompt;
    } catch (error) {
      console.error(
        `Error parsing prompt for criterion "${criterionName}":`,
        error
      );
      cleanedCriteriaPrompts[criterionName] = {
        error: `Failed to parse prompt: ${error}`,
      };
    }
  }

  const sortedCriteriaPrompts = Object.entries(cleanedCriteriaPrompts)
    .sort(([, promptA], [, promptB]) => {
      const agentNumberA = getAgentNumber(promptA.header);
      const agentNumberB = getAgentNumber(promptB.header);
      return agentNumberA - agentNumberB;
    })
    .map(([criterionName, prompt]) => ({
      criterionName,
      prompt,
    }));

  return {
    message,
    criteria_prompts: sortedCriteriaPrompts,
  };
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

// Update Assignment Endpoint
export const updateAssignment = async (req: Request, res: Response) => {
  try {
    const { courseId, assignmentId } = req.params;
    const updates: AssignmentUpdatePayload = req.body;

    if (!assignmentId) {
      return res.status(400).json({ message: "Assignment ID is required" });
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No updates provided" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (updates?.question) {
      assignment.question = updates.question;
    }
    if (updates?.guidelines !== undefined) {
      assignment.guidelines = updates.guidelines;
    }
    if (updates?.config_rubric) {
      assignment.config_rubric = updates.config_rubric;
    }

    await assignment.save();

    return res.status(200).json(assignment);
  } catch (error) {
    console.error("Error updating assignment:", error);
    return res.status(500).json({ message: "Error updating assignment" });
  }
};

// Combined Endpoint: Finalize Rubric and Generate Prompt
export const finalizeRubricAndGeneratePrompt = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { courseId, assignmentId } = req.params;
    const { config_rubric, question, model, rubricName, versioningMode } =
      req.body as AssignmentUpdatePayload;
    const username = req?.user?.username;

    // Validate inputs
    if (!courseId || !assignmentId) {
      return res
        .status(400)
        .json({ message: "Course ID and Assignment ID are required" });
    }

    if (!config_rubric || !config_rubric.criteria) {
      return res.status(400).json({ message: "Rubric criteria are required" });
    }

    // Step 1: Find the course and assignment
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      course: courseId,
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Step 2: Update the assignment with the new rubric and question
    assignment.config_rubric = config_rubric;
    // Update the question if provided in the request body
    if (question !== undefined) {
      assignment.question = question;
    }
    await assignment.save();

    // Determine rubric naming and versioning
    const proposedName = (typeof rubricName === 'string' && rubricName.trim().length > 0)
      ? rubricName.trim()
      : (assignment.title || 'Untitled Rubric');

    let versionToSave = 1;
    if (versioningMode === 'same_name_new_version') {
      const latest = await GradingHistory.find({
        assignmentId: assignment._id,
        courseId: course._id,
        createdBy: req.user.id,
        rubricName: proposedName
      })
        .sort({ version: -1 })
        .limit(1)
        .lean();
      versionToSave = latest.length > 0 ? (latest[0] as any).version + 1 : 1;
    } else {
      // If a record already exists with version 1 for this name, bump to next available
      const conflict = await GradingHistory.findOne({
        assignmentId: assignment._id,
        courseId: course._id,
        createdBy: req.user.id,
        rubricName: proposedName,
        version: 1
      }).lean();
      if (conflict) {
        const latest = await GradingHistory.find({
          assignmentId: assignment._id,
          courseId: course._id,
          createdBy: req.user.id,
          rubricName: proposedName
        })
          .sort({ version: -1 })
          .limit(1)
          .lean();
        versionToSave = latest.length > 0 ? (latest[0] as any).version + 1 : 2;
      }
    }

    await GradingHistory.create({
      courseId: course._id,
      assignmentId: assignment._id,
      // Store rubric exactly as provided, preserving arrays/extra columns
      config_rubric: config_rubric,
      createdBy: req.user.id,
      createdAt: new Date(),
      rubricName: proposedName,
      version: versionToSave,
    });

    // Step 4: Generate prompts using the Python service
    const requestData = {
      criteria: config_rubric.criteria,
      courseId,
      assignmentTitle: assignment._id,
      username,
      model,
    };

    const response: any = await axios.post(
              `${PYTHON_SERVICE_URL}/generate_prompt`,
      requestData
    );

    console.log("Raw Grading Result:", response.data);

    const cleanedData = cleanPromptsResponse(response.data);

    console.log("Cleaned Grading Result:", cleanedData);
    if (cleanedData && cleanedData.criteria_prompts) {
      console.log("Prompt generation summary:");
      cleanedData.criteria_prompts.forEach(cp => {
        console.log(`Prompt generated for criterion: ${cp.criterionName}`);
      });
    }

    // Step 5: Update the assignment with the generated prompts
    assignment.config_prompt = cleanedData.criteria_prompts;
    await assignment.save();

    // Step 6: Return the updated assignment
    return res.status(200).json({
      message: "Rubric updated and prompts generated successfully",
      assignment,
    });
  } catch (error) {
    console.error("Error finalizing rubric and generating prompt:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
