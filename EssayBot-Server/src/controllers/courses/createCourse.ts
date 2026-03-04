import { Request, Response } from "express";
import { Course } from "../../models/Course";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

export const createCourse = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { title, description } = req.body;
  const userId = req?.user?.id;

  try {
    // User is already authenticated via JWT middleware, no need to re-verify
    const newCourse = new Course({
      title,
      description,
      createdBy: userId,
      assignments: [],
      attachments: [],
    });

    // Save the course to the database
    const savedCourse = await newCourse.save();

    // Respond with the created course
    res.status(201).json(savedCourse);
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
