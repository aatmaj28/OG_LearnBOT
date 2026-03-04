import express from "express";
import authRoutes from "./authRoutes";
import courseRoutes from "./courseRoutes";
// import fileRoutes from "./fileRoutes";
import assignmentRoutes from "./assignmentRoutes";
import userRoutes from "./userRoutes";
import attachmentRoutes from "./attachmentRoutes";
import gradingRoutes from "./gradingRoutes";
import gradingAsyncRoutes from "./gradingAsyncRoutes";
import bulkGradingAsyncRoutes from "./bulkGradingAsyncRoutes";
import reportsRoutes from "./reportsRoute";
import modelsRoutes from "./modelsRoutes";
import tosRoutes from "./tosRoutes";
import internalRoutes from "./internalRoutes";

const router = express.Router();

// Internal routes first (no auth) - must be before other routes
router.use("/internal", internalRoutes);

// Group all API routes
router.use("/auth", authRoutes);
router.use("/courses", courseRoutes);
router.use("/courses", assignmentRoutes);
router.use("/users", userRoutes);
router.use("/attachments", attachmentRoutes);
router.use("/grading", gradingRoutes);
router.use("/grading", gradingAsyncRoutes);
router.use("/grading", bulkGradingAsyncRoutes);
router.use("/reports", reportsRoutes);
router.use("/tos", tosRoutes);
router.use("/", modelsRoutes);

export default router;
