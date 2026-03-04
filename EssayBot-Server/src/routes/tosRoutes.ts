import express from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { acceptToS } from "../controllers/tos/acceptToS";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Accept ToS
router.post("/accept", acceptToS);

export default router;
