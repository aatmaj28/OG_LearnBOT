import { Schema, model, Document } from "mongoose";

// Interfaces for the rubric configuration
interface ScoringLevels {
  full: string;
  partial: string;
  minimal: string;
}

interface Criterion {
  name: string;
  description: string;
  weight: number;
  scoringLevels: string[];
  subCriteria: Criterion[];
}

interface GradingBracket {
  label: string;
  range: string;
  expectation: string;
}

interface RubricConfig {
  gradingBrackets: GradingBracket[];
  criteria: Criterion[];
}

// Interface for the Assignment document
export interface IAssignment extends Document {
  title: string;
  question?: string;
  guidelines?: string; // Add guidelines field
  course: Schema.Types.ObjectId;
  config_rubric: RubricConfig;
  config_prompt: Record<string, any>;
  excelFiles?: Array<{
    url: string;
    originalName: string;
    uploadedAt: Date;
  }>;
  gradedFile?: {
    url: string;
    originalName: string;
    gradedAt: Date;
  };
  gradingApproved: boolean;
  approvedOn?: Date;
  totalEssays?: number;
  gradingStats?: Array<Schema.Types.ObjectId>;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for creating a new assignment
export interface ICreateAssignment {
  title: string;
  question?: string;
  guidelines?: string; // Add guidelines field
  course: Schema.Types.ObjectId;
  config_rubric: RubricConfig;
  config_prompt?: Record<string, any>;
  excelFiles?: Array<{
    url: string;
    originalName: string;
    uploadedAt: Date;
  }>;
}

const assignmentSchema = new Schema<IAssignment>({
  title: { type: String, required: true },
  question: { type: String },
  guidelines: { type: String }, // Add guidelines field to schema
  course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
  config_rubric: {
    gradingBrackets: {
      type: [Schema.Types.Mixed],
      required: false,
    },
    criteria: {
      type: [Schema.Types.Mixed],
      required: true,
    },
  },
  config_prompt: { type: Schema.Types.Mixed },
  excelFiles: [
    {
      url: { type: String, required: true },
      originalName: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  gradingStats: [{ type: Schema.Types.ObjectId, ref: "GradingStats" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: "essaybot_assignments" });

export const Assignment = model<IAssignment>("Assignment", assignmentSchema);
