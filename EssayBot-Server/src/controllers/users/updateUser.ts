import { Request, Response } from "express";
import mongoose from "mongoose";

// Define the updateUser controller
export const updateUser = async (req: Request, res: Response) => {
  try {
    // Extract the user ID from the request parameters
    const userId = req.params.userId;

    // Extract the update data from the request body
    const updatedData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updatedData.password;
    delete updatedData._id;

    // Get database connection
    const db = mongoose.connection.db;
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database connection not available" });
    }

    // Update user using raw MongoDB query
    const result = await db.collection("users").findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: updatedData },
      {
        returnDocument: "after",
        projection: { password: 0 }, // Exclude password from returned document
      }
    );

    // If user is not found, return a 404 error
    if (!result || !result.value) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return the updated user data
    res.status(200).json(result.value);
  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
