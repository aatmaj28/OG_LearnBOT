import { Request, Response } from "express";
import { Course } from "../../models/Course";
import mongoose from "mongoose";

// Define the getUser controller
export const getUser = async (req: Request, res: Response) => {
  try {
    // Extract the user ID from the request parameters
    const userId = req.params.userId;

    // Get user data from dash_portal database using raw MongoDB query
    const db = mongoose.connection.db;
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database connection not available" });
    }

    const user = await db.collection("users").findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { password: 0 } } // Exclude password field
    );

    // If user is not found, return a 404 error
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find courses created by this user using Course model
    const courses = await Course.find({ createdBy: userId })
      .populate({
        path: "assignments",
        select: "title question config_rubric config_prompt",
      })
      .lean();

    // Combine user data with courses
    const userData = {
      ...user,
      courses: courses,
    };

    // Return the user data with populated courses and assignments
    res.status(200).json(userData);
  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
