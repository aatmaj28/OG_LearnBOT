import { Schema, model, Document } from "mongoose";

export interface ICourse extends Document {
  title: string;
  description?: string;
  createdBy: Schema.Types.ObjectId;
  assignments: Schema.Types.ObjectId[];
  attachments: Schema.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true },
    description: { type: String },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    assignments: [{ type: Schema.Types.ObjectId, ref: "Assignment" }],
    attachments: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "essaybot_courses" } // Automatically manage createdAt and updatedAt
);

// Create a compound unique index on title + createdBy to allow same title for different users
courseSchema.index({ title: 1, createdBy: 1 }, { unique: true });

export const Course = model<ICourse>("Course", courseSchema);
