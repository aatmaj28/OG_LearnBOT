import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables (support .env.local in development to match server behavior)
dotenv.config();
if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.local", override: true });
}

async function migrateAttachmentIndex() {
  try {
    // Connect to database
    const MONGO_URI =
      process.env.MONGO_URI ||
      "mongodb://admin:REDACTED_PASSWORD@localhost:27017/dash_portal?authSource=admin";
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection failed");
    }
    const collection = db.collection("essaybot_attachments");

    // Drop the old global fileName unique index
    console.log("Dropping old fileName unique index...");
    try {
      await collection.dropIndex("fileName_1");
      console.log("Successfully dropped old fileName_1 index");
    } catch (error: any) {
      if (error.code === 26) {
        console.log("fileName_1 index does not exist, skipping...");
      } else {
        throw error;
      }
    }

    // Create the new compound unique index
    console.log("Creating new compound unique index...");
    await collection.createIndex(
      { fileName: 1, courseId: 1, assignmentId: 1 },
      { unique: true }
    );
    console.log("Successfully created new compound unique index");

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateAttachmentIndex();
}

export { migrateAttachmentIndex };
