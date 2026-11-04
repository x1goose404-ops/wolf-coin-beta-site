#!/usr/bin/env node
/* Tiny zero-dependency static server for the built site (./dist).
 * Usage: node scripts/serve.mjs [port]   (default 8080)
 * Local dev/preview only. No backend, no secrets.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8"
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" }); return res.end("404");
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`serving ./dist on http://localhost:${PORT}`));
