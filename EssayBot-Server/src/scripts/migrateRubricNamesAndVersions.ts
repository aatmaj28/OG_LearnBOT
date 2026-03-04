import dotenv from "dotenv";
dotenv.config();
import mongoose, { Types } from "mongoose";
import { GradingHistory } from "../models/GradingHistory";
import { Assignment } from "../models/Assignment";

async function run() {
  const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL || "";
  if (!mongoUri) {
    console.error("Missing MONGO_URI or DATABASE_URL env var");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  try {
    // Find all distinct (assignmentId, createdBy)
    const distinctCombos = await GradingHistory.aggregate([
      { $group: { _id: { assignmentId: "$assignmentId", createdBy: "$createdBy" } } },
    ]);

    for (const combo of distinctCombos) {
      const assignmentId: Types.ObjectId = combo._id.assignmentId;
      const createdBy: Types.ObjectId = combo._id.createdBy;

      const assignment = await Assignment.findById(assignmentId).lean();
      const defaultName = assignment?.title || "Untitled Rubric";

      const histories = await GradingHistory.find({ assignmentId, createdBy })
        .sort({ createdAt: 1 })
        .lean();

      let versionCounter = 1;
      for (const h of histories) {
        const nameToUse = (h as any).rubricName && typeof (h as any).rubricName === "string" && (h as any).rubricName.trim().length > 0
          ? (h as any).rubricName
          : defaultName;
        const versionToUse = (h as any).version && Number((h as any).version) > 0
          ? (h as any).version
          : versionCounter;

        await GradingHistory.updateOne({ _id: h._id }, {
          $set: {
            rubricName: nameToUse,
            version: versionToUse,
          }
        });
        versionCounter = versionToUse + 1;
      }
    }

    console.log("Migration complete");
  } catch (err) {
    console.error("Migration failed", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();




