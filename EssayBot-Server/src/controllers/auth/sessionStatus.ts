import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

interface AuthenticatedRequest extends Request {
  user?: any;
}

export const getSessionStatus = (
  req: AuthenticatedRequest,
  res: Response
): void => {
  try {
    const token = req.cookies.essayBotAuthToken || req.cookies.authToken;

    if (!token) {
      res.status(401).json({ authenticated: false });
      return;
    }

    // Verify the JWT token
    jwt.verify(token, SECRET_KEY, async (err: jwt.VerifyErrors | null, user: any) => {
      if (err) {
        res.status(401).json({ authenticated: false });
        return;
      }


      const db = mongoose.connection.db;
      const u = await db?.collection("users")
        .findOne({ _id: new mongoose.Types.ObjectId(user.id) }, { projection: { userType: 1, name: 1, email: 1, username: 1, essaybot_tos_accepted: 1 } });

      // Return authenticated user information
      res.json({
        authenticated: true,
        user_id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        userType: u?.userType ?? user.userType ?? "student",  
        essaybot_tos_accepted: user.essaybot_tos_accepted || false,
      });
    });
  } catch (error) {
    console.error("Session status error:", error);
    res.status(401).json({ authenticated: false });
  }
};