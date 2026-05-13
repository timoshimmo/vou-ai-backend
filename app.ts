import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import measurementRoutes from "./routes/measurements";
import tryonRoutes from "./routes/tryons";

// Load configuration
dotenv.config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/vou-ai";

// Helper to mask credentials in MongoDB URIs
function getMaskedMongodbUri(uri: string): string {
  if (!uri) return "Undefined/Empty";
  try {
    const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@(.+)$/);
    if (match) {
      const [_, scheme, user, pwd, rest] = match;
      return `${scheme}${user}:******@${rest}`;
    }
    return uri;
  } catch (e) {
    return "Error parsing URI";
  }
}

// Robust database connection runner with connection caching (Serverless & container optimal)
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

let cached: MongooseCache = (global as any).mongoose || { conn: null, promise: null };
if (!(global as any).mongoose) {
  (global as any).mongoose = cached;
}

const connectToDatabase = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Disable buffering globally to fail fast instead of hanging
      serverSelectionTimeoutMS: 5000, // Speed up failure reporting (5s)
      socketTimeoutMS: 30000,
    };
    
    mongoose.set('strictQuery', false);
    // Disable buffering globally so that queries fail instantly if connection is not ready
    mongoose.set('bufferCommands', false);
    
    console.log(`[DATABASE] Initiating cached MongoDB connection to: ${getMaskedMongodbUri(MONGODB_URI)}`);
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      console.log("[DATABASE] Successfully connected to MongoDB.");
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // Clear failing promise to retry fresh next time
    throw e;
  }

  return cached.conn;
};

// Initial database connection effort on boot
connectToDatabase().catch(err => {
  console.error("[DATABASE] Initial MongoDB connection error on server boot:", err);
});

// Middleware to diagnose DB connectivity issues before running queries
const dbConnectionMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // Attempt/await connection with 5-second threshold
    await Promise.race([
      connectToDatabase(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("MongoDB connection timeout (5000ms)")), 5000))
    ]);

    if (!mongoose.connection.readyState || mongoose.connection.readyState !== 1) {
      throw new Error(`Mongoose connection is inactive (readyState: ${mongoose.connection.readyState})`);
    }

    next();
  } catch (error: any) {
    console.error(`[DATABASE ERROR] ${req.method} ${req.url} blocked:`, error);

    const isLocalhost = MONGODB_URI.includes("localhost") || MONGODB_URI.includes("127.0.0.1");
    const maskedUri = getMaskedMongodbUri(MONGODB_URI);

    let diagnosis = "Unreachable database server. Please check environment variables and database status.";
    let suggestion = "Configure MONGODB_URI and verify MongoDB is active.";

    if (isLocalhost) {
      diagnosis = `The backend is attempting to connect to a local MongoDB instance (${maskedUri}).`;
      suggestion = "1) If deploying to a remote host (e.g. Vercel), there is no local database service. You MUST add a 'MONGODB_URI' environment variable in your host settings pointing to a remote cluster (like MongoDB Atlas).\n2) If debugging locally, make sure your local MongoDB daemon is running (typically using 'mongod' or through Docker/local service manager).";
    } else {
      diagnosis = `The backend is trying to connect to a cloud MongoDB host (${maskedUri}) but the request timed out or was rejected.`;
      suggestion = "1) ATLAS IP WHITELIST: The most common cause is that MongoDB Atlas Network Access is not configured to allow connections from your server's location. Since hosts like Vercel have dynamic/changing IPs, you MUST add '0.0.0.0/0' (allow access from anywhere) in Atlas Network Access settings.\n2) CREDENTIALS: Double-check that your DB username and password are correct and special characters are URL-encoded.\n3) CLUSTER STATE: Verify your MongoDB Atlas cluster isn't currently paused or suspended.";
    }

    res.status(503).json({
      error: "Database Unreachable",
      message: `Database connection could not be established: ${error.message}`,
      connectionState: mongoose.connection.readyState,
      uri: maskedUri,
      diagnosis,
      suggestion,
      timestamp: new Date().toISOString()
    });
  }
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Debug root route
app.get("/debug-ping", (req, res) => {
  res.send("Express is alive!");
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[BACKEND] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// API Ping
app.get("/api/ping", (req, res) => {
  res.json({ pong: true, time: new Date().toISOString() });
});

// Health check
app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({ status: "ok", database: dbStatus });
});

// API Routes
app.use("/api/auth", dbConnectionMiddleware, authRoutes);
app.use("/api/measurements", dbConnectionMiddleware, authenticateToken, measurementRoutes);
app.use("/api/tryons", dbConnectionMiddleware, authenticateToken, tryonRoutes);

// API 404
app.all("/api/*", (req, res) => {
  console.warn(`[404] API endpoint not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: `API endpoint ${req.method} ${req.url} not found` });
});

export default app;

/*
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import authRoutes from "./routes/auth";
import measurementRoutes from "./routes/measurements";
import tryonRoutes from "./routes/tryons";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/vou-ai";

// Ensure MongoDB is connected
if (mongoose.connection.readyState === 0) {
  mongoose.set('strictQuery', false);
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("[DATABASE] Connected to MongoDB via backend/app.ts"))
    .catch(err => {
      console.error("[DATABASE] MongoDB connection error in backend/app.ts:", err);
    });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[BACKEND] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// API Ping
app.get("/api/ping", (req, res) => {
  res.json({ pong: true, time: new Date().toISOString() });
});

// Health check
app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({ status: "ok", database: dbStatus });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/measurements", authenticateToken, measurementRoutes);
app.use("/api/tryons", authenticateToken, tryonRoutes);

// API 404
app.all("/api/*", (req, res) => {
  console.warn(`[404] API endpoint not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: `API endpoint ${req.method} ${req.url} not found` });
});

export default app;
*/