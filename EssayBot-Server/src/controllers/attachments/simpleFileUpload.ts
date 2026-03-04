import { Request, Response, NextFunction } from "express";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Attachment } from "../../models/Attachment";
import { Course } from "../../models/Course";
import { Assignment } from "../../models/Assignment";
 
// Using global AuthenticatedRequest from src/types/express/index.d.ts
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    username: string;
    email?: string;
  };
}
 
// Configure MinIO client
const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "",
  },
});
 
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain", // TXT files
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, false); // Reject file without error
    }
    cb(null, true); // Accept file
  },
}).array("files", 15);
 
const sanitizeFileName = (fileName: string): string => {
  const extension = fileName.slice(fileName.lastIndexOf("."));
  const name = fileName.slice(0, fileName.lastIndexOf("."));
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, "-");
  return `${sanitized}${extension}`;
};
 
export const uploadCourseContent = [
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError || err) {
        return res
          .status(400)
          .json({ message: "Upload error", error: err.message });
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const { courseId, assignmentId } = req.body;
    const username = req.user.username;
    const files = req.files as Express.Multer.File[];
 
    if (!courseId || !assignmentId || !files?.length) {
      return res.status(400).json({
        message: "Missing courseId, assignmentId, or no files uploaded",
      });
    }
 
    try {
      // Validate course and assignment exist
      const course = await Course.findById(courseId);
      const assignment = await Assignment.findById(assignmentId);
      if (
        !course ||
        !assignment ||
        !course.assignments.includes(assignmentId)
      ) {
        return res
          .status(404)
          .json({ message: "Invalid course or assignment" });
      }
 
      const bucket = process.env.MINIO_BUCKET || "essaybot";
      const uploadedFiles = [];
      const errors = [];
 
      for (const file of files) {
        try {
          // Validate file type
          const allowedMimeTypes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain", // TXT files
          ];
 
          if (!allowedMimeTypes.includes(file.mimetype)) {
            errors.push({
              fileName: file.originalname,
              error: "Only PDF, DOC, DOCX, and TXT files are allowed",
            });
            continue;
          }
 
          const sanitizedFileName = sanitizeFileName(file.originalname);
          // Create folder structure: username/courseId/assignmentId/course_content/
          const fileKey = `${username}/${courseId}/${assignmentId}/course_content/${sanitizedFileName}`;
 
          const uploadParams = {
            Bucket: bucket,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            CacheControl: "max-age=31536000",
          };
 
          const command = new PutObjectCommand(uploadParams);
          await s3Client.send(command);
 
          const fileUrl = `${process.env.MINIO_ENDPOINT}/${bucket}/${fileKey}`;
 
          // Save to database
          const newAttachment = new Attachment({
            fileName: file.originalname,
            fileUrl: fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
            courseId,
            assignmentId,
          });
 
          const savedAttachment = await newAttachment.save();
 
          uploadedFiles.push({
            id: savedAttachment._id,
            originalName: file.originalname,
            sanitizedName: sanitizedFileName,
            fileUrl: fileUrl,
            fileKey: fileKey,
            fileSize: file.size,
            fileType: file.mimetype,
            folder: "course_content",
          });
        } catch (error: any) {
          errors.push({
            fileName: file.originalname,
            error: error.message,
          });
        }
      }
 
      if (errors.length > 0 && uploadedFiles.length === 0) {
        return res.status(500).json({
          message: "All uploads failed",
          errors: errors,
        });
      }
 
      res.status(201).json({
        message: "Course content uploaded successfully",
        uploadedFiles: uploadedFiles,
        errors: errors.length > 0 ? errors : undefined,
        totalUploaded: uploadedFiles.length,
        totalErrors: errors.length,
      });
    } catch (error: any) {
      console.error("Error uploading course content:", error);
      res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
];
 
export const uploadSupportingDocs = [
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError || err) {
        return res
          .status(400)
          .json({ message: "Upload error", error: err.message });
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const { courseId, assignmentId } = req.body;
    const username = req.user.username;
    const files = req.files as Express.Multer.File[];
 
    if (!courseId || !assignmentId || !files?.length) {
      return res.status(400).json({
        message: "Missing courseId, assignmentId, or no files uploaded",
      });
    }
 
    try {
      // Validate course and assignment exist
      const course = await Course.findById(courseId);
      const assignment = await Assignment.findById(assignmentId);
      if (
        !course ||
        !assignment ||
        !course.assignments.includes(assignmentId)
      ) {
        return res
          .status(404)
          .json({ message: "Invalid course or assignment" });
      }
 
      const bucket = process.env.MINIO_BUCKET || "essaybot";
      const uploadedFiles = [];
      const errors = [];
 
      for (const file of files) {
        try {
          // Validate file type
          const allowedMimeTypes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain", // TXT files
          ];
 
          if (!allowedMimeTypes.includes(file.mimetype)) {
            errors.push({
              fileName: file.originalname,
              error: "Only PDF, DOC, DOCX, and TXT files are allowed",
            });
            continue;
          }
 
          const sanitizedFileName = sanitizeFileName(file.originalname);
          // Create folder structure: username/courseId/assignmentId/supporting_docs/
          const fileKey = `${username}/${courseId}/${assignmentId}/supporting_docs/${sanitizedFileName}`;
 
          const uploadParams = {
            Bucket: bucket,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            CacheControl: "max-age=31536000",
          };
 
          const command = new PutObjectCommand(uploadParams);
          await s3Client.send(command);
 
          const fileUrl = `${process.env.MINIO_ENDPOINT}/${bucket}/${fileKey}`;
 
          // Save to database
          const newAttachment = new Attachment({
            fileName: file.originalname,
            fileUrl: fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
            courseId,
            assignmentId,
          });
 
          const savedAttachment = await newAttachment.save();
 
          uploadedFiles.push({
            id: savedAttachment._id,
            originalName: file.originalname,
            sanitizedName: sanitizedFileName,
            fileUrl: fileUrl,
            fileKey: fileKey,
            fileSize: file.size,
            fileType: file.mimetype,
            folder: "supporting_docs",
          });
        } catch (error: any) {
          errors.push({
            fileName: file.originalname,
            error: error.message,
          });
        }
      }
 
      if (errors.length > 0 && uploadedFiles.length === 0) {
        return res.status(500).json({
          message: "All uploads failed",
          errors: errors,
        });
      }
 
      res.status(201).json({
        message: "Supporting documents uploaded successfully",
        uploadedFiles: uploadedFiles,
        errors: errors.length > 0 ? errors : undefined,
        totalUploaded: uploadedFiles.length,
        totalErrors: errors.length,
      });
    } catch (error: any) {
      console.error("Error uploading supporting docs:", error);
      res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
];
 
export const listFiles = async (req: AuthenticatedRequest, res: Response) => {
  const { courseId, assignmentId } = req.params;
  const username = req.user.username;
 
  if (!courseId || !assignmentId) {
    return res
      .status(400)
      .json({ message: "Missing courseId or assignmentId" });
  }
 
  try {
    // Query from database instead of MinIO directly
    const attachments = await Attachment.find({
      courseId: courseId,
      assignmentId: assignmentId,
    });
 
    // Categorize files by folder type based on file path
    const courseContentFiles = [];
    const supportingDocsFiles = [];
 
    for (const attachment of attachments) {
      // Extract fileKey from fileUrl
      const bucket = process.env.MINIO_BUCKET || "essaybot";
      const fileKey = attachment.fileUrl.replace(`${process.env.MINIO_ENDPOINT}/${bucket}/`, "");
      
      const fileData = {
        id: attachment._id,
        fileName: attachment.fileName,
        fileKey: fileKey,
        fileUrl: attachment.fileUrl,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
        uploadedAt: attachment.uploadedAt,
        // Legacy fields (deprecated) - data now stored in Qdrant
        storageType: "qdrant",
        collection: "essay_bot_materials"
      };
 
      // Determine folder type from file URL
      if (attachment.fileUrl.includes("/course_content/")) {
        courseContentFiles.push({ ...fileData, folder: "course_content" });
      } else if (attachment.fileUrl.includes("/supporting_docs/")) {
        supportingDocsFiles.push({ ...fileData, folder: "supporting_docs" });
      } else {
        // Default to course_content for legacy files
        courseContentFiles.push({ ...fileData, folder: "course_content" });
      }
    }
 
    res.status(200).json({
      courseId,
      assignmentId,
      files: {
        course_content: courseContentFiles,
        supporting_docs: supportingDocsFiles,
      },
      summary: {
        total_course_content: courseContentFiles.length,
        total_supporting_docs: supportingDocsFiles.length,
        total_files: courseContentFiles.length + supportingDocsFiles.length,
      },
    });
  } catch (error: any) {
    console.error("Error listing files:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
 
export const deleteFile = async (req: AuthenticatedRequest, res: Response) => {
  const { courseId, assignmentId } = req.params;
  const { fileKey } = req.body;
  const username = req.user.username;
 
  if (!courseId || !assignmentId || !fileKey) {
    return res.status(400).json({
      message: "Missing courseId, assignmentId, or fileKey",
    });
  }
 
  // Security: Ensure fileKey is within the user's allowed folder
  const allowedPrefix1 = `${username}/${courseId}/${assignmentId}/course_content/`;
  const allowedPrefix2 = `${username}/${courseId}/${assignmentId}/supporting_docs/`;
  if (
    !fileKey.startsWith(allowedPrefix1) &&
    !fileKey.startsWith(allowedPrefix2)
  ) {
    return res.status(403).json({
      message: "Invalid fileKey or permission denied",
    });
  }
 
  try {
    const bucket = process.env.MINIO_BUCKET || "essaybot";
    const fileUrl = `${process.env.MINIO_ENDPOINT}/${bucket}/${fileKey}`;
 
    // Find and delete from database first
    const attachment = await Attachment.findOneAndDelete({
      fileUrl: fileUrl,
      courseId: courseId,
      assignmentId: assignmentId,
    });
 
    if (!attachment) {
      console.warn(`No database record found for file: ${fileUrl}`);
    }
 
    // Delete from MinIO
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    });
    await s3Client.send(command);
 
    return res.status(200).json({
      message: "File deleted successfully",
      deletedFromDatabase: !!attachment,
    });
  } catch (error: any) {
    console.error("Error deleting file:", error);
    return res.status(500).json({
      message: "Failed to delete file",
      error: error.message,
    });
  }
};
 