import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Using global AuthenticatedRequest from src/types/express/index.d.ts
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email?: string;
  };
}

/**
 * Middleware to require authentication for API routes - returns JSON instead of redirect
 * Similar to Flask's require_api_auth decorator
 */
export function requireApiAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies.essayBotAuthToken || req.cookies.authToken;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please log in through Dash Portal to access this endpoint",
      authenticated: false,
    });
  }

  jwt.verify(token, SECRET_KEY, (err: jwt.VerifyErrors | null, user: any) => {
    if (err) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Invalid or expired token. Please log in through Dash Portal.",
        authenticated: false,
      });
    }
    req.user = user;
    next();
  });
}
