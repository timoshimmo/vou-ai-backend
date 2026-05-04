import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import express from "express";
import mongoose from "mongoose";
import { createServer as createViteServer } from "vite";
import app from "./app";

dotenv.config();

const PORT = 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/vou-ai";

// Connect to MongoDB
mongoose.set('strictQuery', false);
mongoose.connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    console.log("Tip: Ensure MONGODB_URI is set correctly in your secrets.");
  });

async function startServer() {
  console.log(`[INFO] Starting server. NODE_ENV: ${process.env.NODE_ENV}`);
  const projectRoot = path.resolve(__dirname, '..');
  console.log(`[INFO] Project root (derived from __dirname): ${projectRoot}`);
  console.log(`[INFO] process.cwd(): ${process.cwd()}`);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: projectRoot,
      logLevel: 'info'
    });
    
    // Add Vite's middleware
    app.use(vite.middlewares);
    
    // Fallback navigation for SPA in dev mode
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const url = req.originalUrl;
        const template = await vite.transformIndexHtml(url, 
          await fs.readFile(path.join(projectRoot, 'index.html'), 'utf-8')
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        console.error(`Vite transformation error: ${e.stack}`);
        next(e);
      }
    });

    console.log("Vite middleware and fallback navigation registered.");
  } else {
    console.log("Starting in PRODUCTION mode...");
    const distPath = path.join(projectRoot, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Running on http://localhost:${PORT}`);
  });
}

startServer();

// For ESM compatibility if someone imports this
export default startServer;
