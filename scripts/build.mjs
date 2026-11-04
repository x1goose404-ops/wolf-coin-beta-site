#!/usr/bin/env node
/* Build the Wolf Coin BETA static site into ./dist (no framework, no backend).
 * - bundles src/app.js (+ @solana/web3.js, @solana/spl-token) with esbuild
 * - copies the static shell (index.html, styles.css, config.js, assets/)
 * - FAILS if the bundled artwork does not match the sealed-inscription BLAKE3
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// --- artwork integrity gate (must match the on-chain SEALED inscription content hash) ---
const EXPECT_BLAKE3 = "1c870487914dc51dab1d5edba988c399960a3f464faa3bf3cdb396ce9d3b8f7c";
const INSCRIPTION = "5F1GrsYDZusa5y6QkFb3syevDKiaQVkVBRGJCn7mwMuG";
const { blake3 } = require("@noble/hashes/blake3");
const art = fs.readFileSync(path.join(ROOT, "assets", "wolf-coin.webp"));
const artHash = Buffer.from(blake3(art)).toString("hex");
if (artHash !== EXPECT_BLAKE3) {
  console.error(`ARTWORK MISMATCH\n  want ${EXPECT_BLAKE3}\n  got  ${artHash}`);
  process.exit(1);
}
console.log(`artwork OK  blake3=${artHash}  (${art.length} bytes, sealed inscription ${INSCRIPTION})`);

// --- clean + bundle ---
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, "src", "app.js")],
  outfile: path.join(DIST, "app.bundle.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info"
});

for (const f of ["index.html", "styles.css", "config.js", "favicon.svg", "robots.txt"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, f));
}
copyDir(path.join(ROOT, "assets"), path.join(DIST, "assets"));

console.log("built ->", DIST);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
