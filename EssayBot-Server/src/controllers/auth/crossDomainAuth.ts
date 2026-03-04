import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import crypto from "crypto";

export const authenticateFromDashPortal = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Debug logging
    console.log("DEBUG - Request body:", req.body);
    console.log("DEBUG - Content-Type:", req.headers["content-type"]);

    // Get token from POST request body or form data
    const token = req.body.token;

    if (!token) {
      console.log("DEBUG - No token found in request body");
      res.status(400).send("No authentication token provided");
      return;
    }

    console.log("DEBUG - Token received, length:", token.length);

    // Decode token without verification to see its contents
    try {
      const unverifiedPayload = jwt.decode(token, { complete: true });
      if (unverifiedPayload && typeof unverifiedPayload === 'object' && 'payload' in unverifiedPayload) {
        const payload = unverifiedPayload.payload as any;
        console.log(`DEBUG - Token payload (unverified):`);
        console.log(`  User ID: ${payload.id}`);
        console.log(`  Email: ${payload.email}`);
        console.log(`  Service: ${payload.service}`);
        console.log(`  Issuer: ${payload.iss}`);
        console.log(`  Audience: ${payload.aud}`);
        console.log(`  Expires: ${new Date(payload.exp * 1000).toISOString()}`);
      }
    } catch (e) {
      console.log(`DEBUG - Could not decode token: ${e}`);
    }

    // Use EXTERNAL_JWT_SECRET if available (matches DashPortal token generation)
    // Otherwise fall back to JWT_SECRET
    // IMPORTANT: Must match DashPortal's secret selection logic
    const externalSecret = process.env.EXTERNAL_JWT_SECRET;
    const jwtSecretFallback = process.env.JWT_SECRET;
    
    // Debug: Check if EXTERNAL_JWT_SECRET exists in env (even if empty)
    console.log(`DEBUG - Environment variable check:`);
    console.log(`  EXTERNAL_JWT_SECRET exists: ${'EXTERNAL_JWT_SECRET' in process.env}`);
    console.log(`  EXTERNAL_JWT_SECRET value: ${externalSecret ? `length=${externalSecret.length}` : 'undefined or empty'}`);
    console.log(`  JWT_SECRET exists: ${'JWT_SECRET' in process.env}`);
    console.log(`  JWT_SECRET value: ${jwtSecretFallback ? `length=${jwtSecretFallback.length}` : 'undefined or empty'}`);
    
    const jwtSecret = externalSecret || jwtSecretFallback;

    // Debug: Log JWT secret info (without exposing full value)
    const secretSource = externalSecret ? "EXTERNAL_JWT_SECRET" : "JWT_SECRET";
    console.log(`DEBUG - EssayBot JWT Secret Info:`);
    console.log(`  Source: ${secretSource}`);
    
    if (!externalSecret) {
      console.warn(`  EXTERNAL_JWT_SECRET is NOT set or is empty - falling back to JWT_SECRET`);
      console.warn(`  DashPortal likely uses EXTERNAL_JWT_SECRET, so signatures won't match!`);
      if ('EXTERNAL_JWT_SECRET' in process.env && !externalSecret) {
        console.warn(` EXTERNAL_JWT_SECRET exists in env but is empty string - check your GitHub secrets!`);
      }
    }
    
    if (externalSecret) {
      console.log(`  EXTERNAL_JWT_SECRET: length=${externalSecret.length}, first_char=${externalSecret[0]}, last_char=${externalSecret[externalSecret.length - 1]}`);
      // Check for potential truncation (common with GitHub secrets and special chars)
      const lastChar = externalSecret[externalSecret.length - 1];
      const commonTruncatedChars = ['@', '#', '$', '%', '&', '*', '!'];
      if (commonTruncatedChars.includes(lastChar)) {
        console.warn(`  WARNING: EXTERNAL_JWT_SECRET ends with '${lastChar}' - GitHub secrets may truncate special characters!`);
        console.warn(`  Solution: Wrap secret in quotes in GitHub secrets or use base64 encoding`);
      }
      // Log raw bytes to detect encoding issues
      const rawBytes = Buffer.from(externalSecret, 'utf8');
      console.log(`  EXTERNAL_JWT_SECRET raw bytes length: ${rawBytes.length}, last_byte: 0x${rawBytes[rawBytes.length - 1].toString(16)}`);
      const hash = crypto.createHash('sha256').update(externalSecret).digest('hex').substring(0, 16);
      console.log(`  EXTERNAL_JWT_SECRET hash (first 16 chars): ${hash}`);
    }
    if (jwtSecretFallback) {
      console.log(`  JWT_SECRET: length=${jwtSecretFallback.length}, first_char=${jwtSecretFallback[0]}, last_char=${jwtSecretFallback[jwtSecretFallback.length - 1]}`);
      // Check for potential truncation (common with GitHub secrets and special chars)
      const lastChar = jwtSecretFallback[jwtSecretFallback.length - 1];
      const commonTruncatedChars = ['@', '#', '$', '%', '&', '*', '!'];
      if (commonTruncatedChars.includes(lastChar)) {
        console.warn(`WARNING: JWT_SECRET ends with '${lastChar}' - GitHub secrets may truncate special characters!`);
        console.warn(`  Expected secret might be: 'dash_Portal12@#' (15 chars) but got ${jwtSecretFallback.length} chars`);
        console.warn(`  Solution: Wrap secret in quotes in GitHub secrets or use base64 encoding`);
      }
      // Log raw bytes to detect encoding issues
      const rawBytes = Buffer.from(jwtSecretFallback, 'utf8');
      console.log(`  JWT_SECRET raw bytes length: ${rawBytes.length}, last_byte: 0x${rawBytes[rawBytes.length - 1].toString(16)}`);
      const hash = crypto.createHash('sha256').update(jwtSecretFallback).digest('hex').substring(0, 16);
      console.log(`  JWT_SECRET hash (first 16 chars): ${hash}`);
    }
    if (jwtSecret) {
      const hash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
      console.log(`  Using secret: ${secretSource}, length=${jwtSecret.length}, hash=${hash}`);
    }

    if (!jwtSecret) {
      console.error("JWT_SECRET or EXTERNAL_JWT_SECRET environment variable not set");
      res.status(500).send("Server configuration error");
      return;
    }

    // Validate token using shared secret
    let payload: any;
    try {
      payload = jwt.verify(token, jwtSecret, {
        algorithms: ["HS256"],
        audience: "essaybot",
        issuer: "dash-portal", // Verify issuer matches DashPortal
      });
      console.log(`DEBUG - JWT payload: ${JSON.stringify(payload)}`);
    } catch (error) {
      console.log(`DEBUG - JWT decode error: ${error}`);
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).send("Login expired. Please return to Dash Portal.");
        return;
      } else if (error instanceof jwt.JsonWebTokenError) {
        res
          .status(401)
          .send("Invalid login token. Please return to Dash Portal.");
        return;
      }
      throw error;
    }

    // Extract user information
    const userId = payload.id; // MongoDB ObjectId as string
    const userEmail = payload.email; // User's email
    const service = payload.service; // Should be "essaybot"

    console.log(
      `DEBUG - Extracted: user_id=${userId}, email=${userEmail}, service=${service}`
    );

    // Validate this is for EssayBot
    if (service !== "essaybot") {
      res.status(400).send("Invalid service token");
      return;
    }

    // Find user by ID using raw MongoDB query (users are in dash_portal database)
    const db = mongoose.connection.db;
    if (!db) {
      res.status(500).send("Database connection not available");
      return;
    }

    const user = await db.collection("users").findOne({
      _id: new mongoose.Types.ObjectId(userId),
    });

    if (!user) {
      res.status(404).send("User not found");
      return;
    }

    // Update last login in database using raw MongoDB query
    await db
      .collection("users")
      .updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $set: { lastLogin: new Date() } }
      );

    // Generate new JWT token for the session
    const sessionToken = jwt.sign(
      { 
        id: user._id, 
        name: user.name, 
        username: user.username, 
        email: user.email,
        userType: user.userType,
        essaybot_tos_accepted: user.essaybot_tos_accepted || false
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    // Determine environment and set appropriate cookie settings
    const isProduction =
      process.env.NODE_ENV === "production" ||
      process.env.ENVIRONMENT === "production";

    // Set session cookie with environment-appropriate settings
    const cookieOptions: any = {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: "/",
    };

    if (isProduction) {
      cookieOptions.domain = ".dashlab.studio"; // Cross-domain for production
      cookieOptions.secure = true; // HTTPS only in production
    } else {
      cookieOptions.domain = "localhost"; // Cross-subdomain for localhost
      cookieOptions.secure = false; // Allow non-HTTPS for localhost
    }

    res.cookie("essayBotAuthToken", sessionToken, cookieOptions);
    console.log("DEBUG - Cookie options:", isProduction);
    // Redirect to EssayBot dashboard
    const redirectUrl = isProduction
      ? process.env.ESSAYBOT_PRODUCTION_URL || "https://essaybot.dashlab.studio"
      : process.env.ESSAYBOT_CLIENT_URL || "http://localhost:3003";

    // const redirectUrl = "http://localhost:3003";

    console.log("DEBUG - Redirect URL:", redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error(`Authentication error: ${error}`);
    res.status(500).send("Authentication failed. Please try again.");
  }
};
