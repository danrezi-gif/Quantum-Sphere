import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { handleSSE, startSession, stopSession, resetSession } from "./quantum";

const app = express();
const PORT = 5001;

app.use(express.json());

// Quantum routes
app.get("/api/quantum/stream", handleSSE);
app.post("/api/quantum/start", (_req, res) => { startSession(); res.json({ ok: true }); });
app.post("/api/quantum/stop", (_req, res) => { stopSession(); res.json({ ok: true }); });
app.post("/api/quantum/reset", (_req, res) => { resetSession(); res.json({ ok: true }); });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  // Serve pre-built static files
  const staticPath = path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
} else {
  // Development: create Vite dev server as middleware
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.resolve(__dirname, "..", "vite.config.ts"),
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`[quantum-sphere] http://localhost:${PORT}`);
});
