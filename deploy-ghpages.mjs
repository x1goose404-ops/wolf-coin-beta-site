// Deploy the built site to the public GitHub Pages repo in ONE atomic commit via the
// GitHub REST API (git/ blobs+tree+commit+ref). Needed because this host's git has no
// https transport. Uses a token from `gh auth token`; the token is never printed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OWNER = "x1goose404-ops";
const REPO = "wolf-coin-beta-site";
const BRANCH = "master";
const ROOT = process.cwd();
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
if (!token) throw new Error("no gh token");
const H = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "wolf-beta-deploy" };
const api = async (method, p, body) => {
  const res = await fetch(`https://api.github.com${p}`, { method, headers: { ...H, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${txt.slice(0, 400)}`);
  return txt ? JSON.parse(txt) : null;
};

// files that make up the served site at the repo root (blob path -> local path)
const FILES = [
  ["index.html", "dist/index.html"],
  ["app.bundle.js", "dist/app.bundle.js"],
  ["styles.css", "dist/styles.css"],
  ["config.js", "dist/config.js"],
  ["favicon.svg", "dist/favicon.svg"],
  ["robots.txt", "dist/robots.txt"],
  ["assets/coin.png", "dist/assets/coin.png"],
  ["assets/wolf-coin.webp", "dist/assets/wolf-coin.webp"],
  ["assets/wolf-coin-hero.webp", "dist/assets/wolf-coin-hero.webp"],
  // keep the source in sync too (parity with the deployed shell)
  ["index.html", "index.html"],
  ["src/app.js", "src/app.js"],
  ["src/beta-core.js", "src/beta-core.js"],
];
// de-dup by blob path (last wins)
const byPath = new Map();
for (const [p, local] of FILES) byPath.set(p, local);

const ref = await api("GET", `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
const parentSha = ref.object.sha;
const commit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
const baseTree = commit.tree.sha;

const tree = [];
for (const [p, local] of byPath) {
  const buf = fs.readFileSync(path.join(ROOT, local));
  const blob = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, { content: buf.toString("base64"), encoding: "base64" });
  tree.push({ path: p, mode: "100644", type: "blob", sha: blob.sha });
  console.log(`blob ${blob.sha.slice(0, 8)}  ${p}  (${buf.length} bytes)`);
}
const newTree = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTree, tree });
const newCommit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
  message: "deploy: add built app.bundle.js (site was 404-ing on the bundle) + wallet re-scan/retry hardening + live-banner fix",
  tree: newTree.sha,
  parents: [parentSha],
});
await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false });
console.log("deployed commit:", newCommit.sha);
console.log("tree:", newTree.sha, "base:", baseTree);
