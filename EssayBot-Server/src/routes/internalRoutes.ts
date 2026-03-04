import { Router } from "express";
import { updateBulkGradingProgress } from "../controllers/grading/bulkGradingAsync";

const router = Router();

// Internal endpoints - no authentication required
// These are called by internal services (workers, etc.)
router.post("/grading/progress-update", updateBulkGradingProgress);

export default router;

