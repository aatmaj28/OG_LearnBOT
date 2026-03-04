import express, { RequestHandler } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import {
  finalizeRubricAndGeneratePrompt,
  updateAssignment,
} from "../controllers/assignments/updateAssignment";
import { getRubricMeta } from "../controllers/assignments";
import { createAssignment } from "../controllers/assignments/createAssignment";
import { AssignmentParams, getAssignmentGuidelines } from "../controllers/assignments";
import { createRubric, fillCriteriaExpectations } from "../controllers/assignments/generateRubric";
import { createRubricAsync } from "../controllers/assignments/generateRubricAsync";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken as RequestHandler);

// Create a new assignment
router.post(
  "/:courseId/assignments",
  createAssignment as unknown as RequestHandler<AssignmentParams>
);

// Update assignment (handles question, config_rubric, and config_prompt updates)
router.patch(
  "/:courseId/assignments/:assignmentId",
  updateAssignment as unknown as RequestHandler<AssignmentParams>
);

// Get assignment guidelines
router.get(
  "/:courseId/assignments/:assignmentId/guidelines",
  getAssignmentGuidelines as unknown as RequestHandler<AssignmentParams>
);

router.post(
  "/generate-rubric",
  createRubric as unknown as RequestHandler<AssignmentParams>
);

router.post(
  "/generate-rubric-async",
  createRubricAsync as unknown as RequestHandler<AssignmentParams>
);

router.post(
  "/fill-expectations",
  fillCriteriaExpectations as unknown as RequestHandler<AssignmentParams>
);

router.post(
  "/:courseId/assignments/:assignmentId/finalize-rubric",
  finalizeRubricAndGeneratePrompt as unknown as RequestHandler<AssignmentParams>
);

// Rubric metadata (names and latest versions per assignment for current user)
router.get(
  "/:courseId/assignments/:assignmentId/rubrics/meta",
  (getRubricMeta as unknown) as RequestHandler<AssignmentParams>
);
export default router;
