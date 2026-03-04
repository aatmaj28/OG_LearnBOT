import mongoose from "mongoose";
import dotenv from "dotenv";
import { alertDatabaseFailure } from "../utils/critical-monitor";

// Load environment variables conditionally based on NODE_ENV
dotenv.config(); // Always load .env first
if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: '.env.local', override: true }); // Override with .env.local in development
}

const MONGO_URI = process.env.MONGO_URI as string;

export const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined in the environment variables");
    }
    console.log("Connecting to MongoDB...");
    await mongoose.connect(
      MONGO_URI
    );

    console.log("MongoDB Connected Successfully to dash_portal database!");
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    console.error("MongoDB Connection Error:", errorMessage);
    
    // Send critical alert for database failure (only in production)
    try {
      await alertDatabaseFailure(errorMessage);
    } catch (alertError) {
      console.error("Failed to send database failure alert:", alertError);
    }
    
    // Don't exit process - let the application continue and handle gracefully
    return false;
  }
};
