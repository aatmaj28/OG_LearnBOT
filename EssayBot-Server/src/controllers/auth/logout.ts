import { Request, Response } from "express";

export const logoutUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Clear the JWT token cookie - MUST match login cookie settings exactly
    res.clearCookie("essayBotAuthToken", {
      httpOnly: true,
      secure: false, // Match login: secure is false for EssayBot local/dev
      sameSite: "lax",
      path: "/",
    });

    // Also clear legacy cookie name for backward compatibility
    const isProduction = process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "production";
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: isProduction, // Legacy dash-portal/old EssayBot tokens might be secure in prod
      sameSite: "lax",
      path: "/",
    });

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ message: "Error logging out", error });
  }
};
