import { Schema, model, Document } from "mongoose";

export interface ISection extends Document {
  name: string;
  course: Schema.Types.ObjectId;
  instructor: Schema.Types.ObjectId;
  tasks: Schema.Types.ObjectId[];
  students: Schema.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<ISection>(
  {
    name: { type: String, required: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    instructor: { type: Schema.Types.ObjectId, required: true },
    tasks: [{ type: Schema.Types.ObjectId, ref: "Task" }],
    students: [{ type: Schema.Types.ObjectId }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "essaybot_sections" }
);

export const Section = model<ISection>("Section", sectionSchema);
