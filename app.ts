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
