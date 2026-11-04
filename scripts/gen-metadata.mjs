#!/usr/bin/env node
/* Generate the wallet-facing metadata tree (metadata-hosting/metadata/*.json + coin.webp).
 * This is the art the WALLET renders: the reviewed program hardcodes the on-chain
 * metadata `uri` base to a CDN (config.metadataBase), so the JSON + image here must
 * live in that repo/tag. The image is the SEALED inscription artwork (BLAKE3-verified).
 * Off-chain only; touches no chain.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://cdn.jsdelivr.net/gh/x1goose404-ops/wolfcoin-metadata@v1/metadata/";
const OUT = path.join(ROOT, "metadata-hosting", "metadata");
fs.mkdirSync(OUT, { recursive: true });

// image = the sealed inscription artwork
const srcImg = path.join(ROOT, "assets", "wolf-coin.webp");
fs.copyFileSync(srcImg, path.join(OUT, "coin.webp"));
const { blake3 } = require("@noble/hashes/blake3");
const h = Buffer.from(blake3(fs.readFileSync(path.join(OUT, "coin.webp")))).toString("hex");
if (h !== "1c870487914dc51dab1d5edba988c399960a3f464faa3bf3cdb396ce9d3b8f7c") {
  throw new Error("coin.webp does not match the sealed inscription hash: " + h);
}

for (let s = 1; s <= 10; s++) {
  const j = {
    name: `Wolf Coin #${s}`,
    symbol: "WOLF",
    description: "Wolf Coin BETA — a collectible X1 NFT backed by exactly 5 XNT locked on-chain. Mint it. Own it. Transfer it. Redeem it. EXPERIMENTAL / NOT AUDITED.",
    image: BASE + "coin.webp",
    external_url: "https://wolfcoin.x1/",
    attributes: [
      { trait_type: "Denomination", value: "5 XNT" },
      { trait_type: "Serial", value: s },
      { trait_type: "Backing", value: "On-chain vault" },
      { trait_type: "Edition", value: "BETA TEST EDITION" }
    ]
  };
  fs.writeFileSync(path.join(OUT, `${s}.json`), JSON.stringify(j, null, 2) + "\n");
}
console.log(`wrote ${OUT}/1..10.json + coin.webp (blake3 ${h})`);
