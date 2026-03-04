import { Router } from "express";
import { gradeBulkEssaysAsync, getBulkGradingTaskResult, updateBulkGradingProgress } from "../controllers/grading/bulkGradingAsync";
import { authenticateToken } from "../middleware/authenticateToken";

const router = Router();

// Async bulk grading endpoints
router.post("/bulk-grade-async", authenticateToken, gradeBulkEssaysAsync);
router.get("/task/:taskId", authenticateToken, getBulkGradingTaskResult);
// Internal endpoint for worker - must be defined BEFORE any auth middleware
// This route is explicitly public and doesn't require authentication
router.post("/progress-update", updateBulkGradingProgress); // No auth needed - internal endpoint

export default router;
