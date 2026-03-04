import { Request, Response } from "express";
import mongoose from "mongoose";

interface AuthenticatedRequest extends Request {
  user?: any;
}

export const acceptToS = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user_id = req.user?.id;

    if (!user_id) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    // Get database connection
    const db = mongoose.connection.db;
    if (!db) {
      res.status(500).json({ error: "Database connection not available" });
      return;
    }

    // Update user's ToS acceptance in DashPortal database
    await db.collection("users").updateOne(
      { _id: new mongoose.Types.ObjectId(user_id) },
      {
        $set: {
          essaybot_tos_accepted: true,
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error accepting ToS:", error);
    res.status(500).json({ error: "Failed to save ToS acceptance" });
  }
};
