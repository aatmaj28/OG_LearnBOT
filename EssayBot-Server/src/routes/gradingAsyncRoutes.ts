import express, { RequestHandler } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { gradeSingleEssay, getTaskResult } from "../controllers/grading/gradeSingleEssayHybrid";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken as RequestHandler);

// Async essay grading endpoints
router.post(
  "/grade-single-essay-async",
  gradeSingleEssay as unknown as RequestHandler
);

// Get task result endpoint
router.get(
  "/task/:taskId",
  getTaskResult as unknown as RequestHandler
);

export default router;
