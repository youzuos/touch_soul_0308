import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CRITICAL: Cloud Run requires listening on 0.0.0.0 and the exact PORT env var
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// API routes
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

async function startServer() {
  console.log(`[STARTUP] Initializing server...`);
  console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[STARTUP] PORT: ${PORT}`);
  console.log(`[STARTUP] Current Directory: ${__dirname}`);
  
  if (process.env.NODE_ENV !== "production") {
    console.log("[STARTUP] Starting in DEVELOPMENT mode with Vite middleware...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[STARTUP] Vite middleware loaded successfully.");
    } catch (err) {
      console.error("[STARTUP ERROR] Failed to load Vite middleware, falling back to static:", err);
      serveStatic();
    }
  } else {
    console.log("[STARTUP] Starting in PRODUCTION mode...");
    serveStatic();
  }

  function serveStatic() {
    const distPath = path.join(__dirname, "dist");
    console.log(`[STARTUP] Checking for static files at: ${distPath}`);
    if (fs.existsSync(distPath)) {
      console.log(`[STARTUP] Success: 'dist' directory found. Serving static files.`);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.error("[CRITICAL ERROR] 'dist' directory not found at " + distPath);
      console.error("[CRITICAL ERROR] Make sure 'npm run build' was executed successfully before starting the server.");
      app.get("*", (req, res) => {
        res.status(500).send("Application build missing. Please check server logs.");
      });
    }
  }

  app.listen(Number(PORT), HOST, () => {
    console.log(`[STARTUP] Server is successfully listening on http://${HOST}:${PORT}`);
    const used = process.memoryUsage();
    console.log(`[STARTUP] Memory usage: ${Math.round(used.rss / 1024 / 1024)} MB`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
