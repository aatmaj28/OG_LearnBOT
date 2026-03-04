import express from "express";
// import { loginUser } from "../controllers/auth/login"; // Removed - login now happens through Dash Portal
// import { registerUser } from "../controllers/auth/register"; // Removed - registration now happens through Dash Portal
import { logoutUser } from "../controllers/auth/logout";
// import { validateToken } from "../controllers/auth/validateToken"; // Removed - replaced by session-status endpoint
import { authenticateFromDashPortal } from "../controllers/auth/crossDomainAuth";
import { getSessionStatus } from "../controllers/auth/sessionStatus";

const router = express.Router();

// Cross-domain authentication from Dash Portal
router.post("/", authenticateFromDashPortal);

// Session status endpoint - replaces validateToken for new auth flow
router.get("/session-status", getSessionStatus);

// Standard authentication routes
// router.post("/register", registerUser); // Removed - registration now happens through Dash Portal
// router.post("/login", loginUser); // Removed - login now happens through Dash Portal
router.post("/logout", logoutUser);
// router.get("/validateToken", validateToken); // Removed - replaced by session-status endpoint

export default router;
