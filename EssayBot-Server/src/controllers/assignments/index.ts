import { ParamsDictionary } from "express-serve-static-core";
import { Request, Response } from "express";
import { Assignment } from "../../models/Assignment";
import { GradingHistory } from "../../models/GradingHistory";

export interface AssignmentRouteParams {
  assignmentId?: string;
}

export type AssignmentParams = AssignmentRouteParams & ParamsDictionary;

export interface ScoringLevels {
  full: string;
  partial: string;
  minimal: string;
}

export interface Criterion {
  name: string;
  description: string;
  weight: number;
  scoringLevels: string[];
  subCriteria: Criterion[];
}

export interface GradingBracket {
  label: string;
  range: string;
  expectation: string;
}

export interface RubricConfig {
  gradingBrackets: GradingBracket[];
  criteria: Criterion[];
}

// Type for the update payload
export interface AssignmentUpdatePayload {
  question?: string;
  guidelines?: string; // Add guidelines field
  config_rubric?: RubricConfig;
  config_prompt?: Record<string, any>;
  model?: string;
  rubricName?: string;
  versioningMode?: "new_name" | "same_name_new_version";
}

// Controller function to get assignment guidelines
export const getAssignmentGuidelines = async (req: Request, res: Response) => {
  try {
    const { courseId, assignmentId } = req.params as { courseId: string; assignmentId: string };
    
    const assignment = await Assignment.findOne(
      { _id: assignmentId, course: courseId },
      { _id: 1, course: 1, guidelines: 1 } // Only fetch these fields
    );

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    return res.status(200).json({
      _id: assignment._id,
      course: assignment.course,
      guidelines: assignment.guidelines || ""
    });
  } catch (error) {
    console.error("Error fetching assignment guidelines:", error);
    return res.status(500).json({ message: "Error fetching assignment guidelines" });
  }
};

// Rubric metadata per assignment for the current user
export const getRubricMeta = async (req: Request, res: Response) => {
  try {
    const { courseId, assignmentId } = req.params as { courseId: string; assignmentId: string };
    const userId = (req as any)?.user?.id;

    if (!courseId || !assignmentId || !userId) {
      return res.status(400).json({ message: "Missing courseId, assignmentId, or user" });
    }



    const pipeline = [
      { $match: { courseId: new (await import("mongoose")).Types.ObjectId(courseId), assignmentId: new (await import("mongoose")).Types.ObjectId(assignmentId), createdBy: new (await import("mongoose")).Types.ObjectId(userId) } },
      { $group: { _id: "$rubricName", latestVersion: { $max: "$version" }, lastUsedAt: { $max: "$createdAt" }, count: { $sum: 1 } } },
      { $project: { _id: 0, rubricName: "$_id", latestVersion: 1, totalVersions: "$count", lastUsedAt: 1 } },
      { $sort: { lastUsedAt: -1 } }
    ];

    const meta = await (GradingHistory as any).aggregate(pipeline);

    return res.status(200).json({ meta });
  } catch (error) {
    console.error("Error fetching rubric metadata:", error);
    return res.status(500).json({ message: "Error fetching rubric metadata" });
  }
};
