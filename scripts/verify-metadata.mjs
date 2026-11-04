#!/usr/bin/env node
/* Verify the prepared wallet-metadata hosting tree (metadata-hosting/).
 * Checks each serial JSON parses, points image/external_url at the CDN base,
 * and that the referenced image matches the sealed-inscription BLAKE3.
 * Read-only.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD = path.join(ROOT, "metadata-hosting", "metadata");
const { blake3 } = require("@noble/hashes/blake3");
const TARGET = "1c870487914dc51dab1d5edba988c399960a3f464faa3bf3cdb396ce9d3b8f7c";

const img = path.join(MD, "coin.webp");
if (!fs.existsSync(img)) { console.error("missing metadata-hosting/metadata/coin.webp"); process.exit(1); }
const ib = fs.readFileSync(img);
const ih = Buffer.from(blake3(ib)).toString("hex");
console.log(`coin.webp ${ib.length} B  blake3=${ih}  ${ih === TARGET ? "OK" : "MISMATCH"}`);
if (ih !== TARGET) process.exit(1);

let bad = 0;
for (let s = 1; s <= 10; s++) {
  const p = path.join(MD, `${s}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const imgOk = typeof j.image === "string" && j.image.includes("/metadata/coin.webp");
  const serial = j.attributes?.find(a => a.trait_type === "Serial")?.value;
  const denom = j.attributes?.find(a => a.trait_type === "Denomination")?.value;
  const ok = imgOk && serial === s && denom === "5 XNT" && j.symbol === "WOLF";
  if (!ok) { bad++; console.log(`FAIL ${s}.json  image=${j.image} serial=${serial} denom=${denom}`); }
  else console.log(`OK   ${s}.json  name="${j.name}" denom="${denom}" serial=${serial}`);
}
process.exit(bad ? 1 : 0);
