import { Request, Response } from "express";
import { Assignment } from "../../models/Assignment";
import { Course } from "../../models/Course";
import { fileUploadService } from "../../utils/awsS3";
import mongoose from "mongoose";

// Extend the Request type to include user
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
  };
}

export const deleteExcelFile = async (req: AuthenticatedRequest, res: Response) => {
  const { courseId, assignmentId } = req.params;
  const { fileUrl } = req.body;
  const username = req.user.username;

  if (!courseId || !assignmentId || !fileUrl) {
    return res.status(400).json({
      message: "Missing courseId, assignmentId, or fileUrl",
    });
  }

  try {
    // Check if the course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if the assignment exists and belongs to the course
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    if (!course.assignments.includes(assignmentId as any)) {
      return res
        .status(400)
        .json({ message: "Assignment does not belong to this course" });
    }

    // Security: Ensure fileUrl belongs to this user
    const expectedPrefix = `${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET}/${username}/${courseId}/${assignmentId}/`;
    if (!fileUrl.startsWith(expectedPrefix)) {
      return res.status(403).json({
        message: "Invalid fileUrl or permission denied",
      });
    }

    // Find the Excel file in the assignment
    const excelFileIndex = assignment.excelFiles?.findIndex(
      (file: any) => file.url === fileUrl
    ) ?? -1;

    if (excelFileIndex === -1) {
      return res.status(404).json({ message: "Excel file not found in assignment" });
    }

    // Extract the S3 key from the fileUrl
    const s3Key = fileUrl.replace(`${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET}/`, "");

    // Delete from S3
    try {
      await fileUploadService.deleteFile(s3Key);
      console.log(`Excel file deleted from S3: ${s3Key}`);
    } catch (s3Error) {
      console.warn(`Failed to delete file from S3: ${s3Error}`);
      // Continue with database deletion even if S3 deletion fails
    }

    // Remove from assignment's excelFiles array
    if (assignment.excelFiles) {
      assignment.excelFiles.splice(excelFileIndex, 1);
    }
    await assignment.save();

    return res.status(200).json({
      message: "Excel file deleted successfully",
      deletedFromDatabase: true,
    });
  } catch (error: any) {
    console.error("Error deleting Excel file:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
