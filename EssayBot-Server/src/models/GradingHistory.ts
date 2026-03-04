import { Schema, model, Document, Types } from "mongoose";

// Interface for the rubric criteria
interface Criterion {
  name: string;
  description: string;
  weight: number;
  scoringLevels: {
    full: string;
    partial: string;
    minimal: string;
  };
  subCriteria: Criterion[];
}

// Interface for the rubric configuration
interface RubricConfig {
  gradingBrackets?: Array<{ label: string; range: string; expectation?: string }>;
  criteria: Criterion[];
}

// Interface for the GradingHistory document
export interface IGradingHistory extends Document {
  courseId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  config_rubric: RubricConfig;
  gradingStatsId?: Types.ObjectId;
  taskId?: string; // Optional taskId to link async grading tasks to history
  createdAt: Date;
  createdBy: Types.ObjectId;
  rubricName: string;
  version: number;
}

const gradingHistorySchema = new Schema<IGradingHistory>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
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
    gradingStatsId: {
      type: Schema.Types.ObjectId,
      ref: "GradingStats",
      required: false,
    },
    taskId: {
      type: String,
      required: false,
      index: true, // Index for faster lookups
    },
    rubricName: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "essaybot_gradinghistories" }
);

// Add indexes for efficient querying
gradingHistorySchema.index({ courseId: 1, assignmentId: 1 });
gradingHistorySchema.index({ gradingStatsId: 1 });
gradingHistorySchema.index({ createdAt: -1 });
gradingHistorySchema.index({ taskId: 1 }); // Index for taskId lookups
gradingHistorySchema.index({ assignmentId: 1, createdBy: 1, rubricName: 1, version: 1 }, { unique: true });

export const GradingHistory = model<IGradingHistory>(
  "GradingHistory",
  gradingHistorySchema
);
