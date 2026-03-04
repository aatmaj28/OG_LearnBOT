// Top-level error handlers to catch any unhandled exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
  // Don't exit immediately - let PM2 handle it, but log everything
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Load environment variables FIRST before any imports
// This ensures S3Client and other services initialize with correct env vars
import dotenv from "dotenv";
dotenv.config(); // Always load .env first
if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.local", override: true }); // Override with .env.local in development
}

console.log('📝 Environment loaded, starting imports...');

// Now import other modules (they can safely use process.env)
import cluster from "cluster";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { connectDB } from "./config/db";
import routes from "./routes/routes";
import cookieParser from "cookie-parser";
import cors from "cors";
import { globalErrorHandler } from "./middleware/errorHandler";
import { queueService } from "./services/queueService";
import { redisService } from "./services/redisService";
import { websocketService } from "./services/websocketService";

console.log('✅ All modules imported successfully');

// Use Node.js cluster module for multi-instance support
const NUM_WORKERS = process.env.INSTANCES ? parseInt(process.env.INSTANCES) : (process.env.NODE_ENV === 'production' ? 4 : 1);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT;
console.log("Using PORT:", PORT);

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parse form data

app.use(cookieParser());

// Configure cross-domain cookie settings based on environment
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.ENVIRONMENT === "production";

// Configure CORS with credentials for cross-domain cookies
app.use(
  cors({
    origin: [
      process.env.DASH_PORTAL_CLIENT_URL || "http://localhost:3000", // dash-portal client
      process.env.ESSAYBOT_CLIENT_URL || "http://localhost:3003", // essaybot client
      process.env.DASH_PORTAL_PRODUCTION_URL || "https://dashlab.studio", // dash-portal production
      process.env.ESSAYBOT_PRODUCTION_URL || "https://essaybot.dashlab.studio", // essaybot production
      // Add UAT domains explicitly
      "https://uat.dashlab.studio",
      "https://uat.essaybot.dashlab.studio",
    ],
    credentials: true,
  })
);

// Set default cookie parser options for cross-domain support
const allowedHeaders = [
  "Content-Type",
  "Authorization",
  "Accept",
  "Origin",
  "X-Requested-With",
  "X-CSRFToken",
  "X-Frame-Options",
  "X-XSRF-TOKEN",
  "x-client-timestamp",
  "x-request-hash",
].join(", ");

if (isProduction) {
  // Production: Enable cross-domain cookies with secure settings
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", allowedHeaders);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    );
    next();
  });
} else {
  // Development: Allow non-secure cookies for localhost
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", allowedHeaders);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    );
    next();
  });
}

app.use("/api", routes);

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Express.js server is running",
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// Global error handler (must be last)
app.use(globalErrorHandler);

// Connect to database (non-blocking)
connectDB().catch((error) => {
  console.error("Failed to connect to database:", error);
  // Database connection failure will be handled by the global error handler
});

// Initialize async services (RabbitMQ, Redis, WebSocket)
async function initializeServices() {
  try {
    console.log('🚀 Initializing async services...');
    
    // Connect to RabbitMQ and Redis
    await Promise.all([
      queueService.connect(),
      redisService.connect()
    ]);
    
    // Initialize WebSocket service
    await websocketService.initialize(httpServer);
    
    console.log(' All async services initialized successfully');
  } catch (error: any) {
    console.error('Failed to initialize async services:', error.message);
    console.log('Continuing in synchronous mode (fallback)');
  }
}

// Start server with Node.js cluster support
async function startServer(): Promise<void> {
  if (!PORT) {
    console.error('❌ PORT environment variable is not set');
    process.exit(1);
  }

  // If this is the master process and we want clustering, fork workers
  // Use isMaster for older Node.js versions, isPrimary for Node 16+
  const isMaster = (cluster as any).isPrimary || (cluster as any).isMaster;
  if (isMaster && NUM_WORKERS > 1) {
    console.log(`🔄 Master process ${process.pid} is starting ${NUM_WORKERS} workers...`);
    
    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
      const worker = cluster.fork();
      console.log(`  👷 Worker ${worker.process.pid} started`);
    }

    // Handle worker exits - restart them
    cluster.on('exit', (worker, code, signal) => {
      console.log(`⚠️ Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);
      console.log(`  🔄 Starting a new worker...`);
      const newWorker = cluster.fork();
      console.log(`  👷 New worker ${newWorker.process.pid} started`);
    });

    return; // Master process doesn't start the server
  }

  // Worker process (or single instance) - start the actual server
  const workerId = cluster.worker ? `Worker-${cluster.worker.id}` : 'Single';
  console.log(`🚀 ${workerId} starting server on port ${PORT} (PID: ${process.pid})...`);

  httpServer.listen(PORT, async () => {
    console.log(`✅ ${workerId} server is running on http://localhost:${PORT} (PID: ${process.pid})`);
    
    try {
      // Initialize async services after server starts
      await initializeServices();
      console.log(`✅ ${workerId} startup completed successfully`);
    } catch (initError: any) {
      console.error(`❌ ${workerId} error initializing services:`, initError);
      console.error('Stack:', initError?.stack);
      // Continue running even if services fail to initialize
    }
  }).on('error', (err: NodeJS.ErrnoException) => {
    console.error(`❌ ${workerId} HTTP Server error:`, err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Another process may be running.`);
      console.error(`   Try: lsof -ti:${PORT} | xargs kill -9`);
    }
    // Exit with error code, PM2 will restart
    process.exit(1);
  });
}

// Start server with comprehensive error handling
try {
  startServer().catch((startupError: any) => {
    console.error('❌ FATAL ERROR during server startup:', startupError);
    console.error('Stack:', startupError?.stack);
    process.exit(1);
  });
} catch (startupError: any) {
  console.error('❌ FATAL ERROR during server startup:', startupError);
  console.error('Stack:', startupError?.stack);
  process.exit(1);
}
