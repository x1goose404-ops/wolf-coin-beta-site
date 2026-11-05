/* Wolf Coin BETA — unit tests for pure helpers (node --test). No chain, no browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { u32le, u64le, serialUsed, serialLabel, validateRecipient, collateralMatches, classifyNetwork, base58encode } from "../src/beta-core.js";
import { PublicKey, Keypair } from "@solana/web3.js";

test("serial labels are BETA-0001..BETA-0010", () => {
  assert.equal(serialLabel(1), "BETA-0001");
  assert.equal(serialLabel(10), "BETA-0010");
  assert.equal(serialLabel(7), "BETA-0007");
});

test("u32le / u64le encode little-endian", () => {
  assert.deepEqual(Array.from(u32le(1)), [1, 0, 0, 0]);
  assert.deepEqual(Array.from(u32le(258)), [2, 1, 0, 0]);
  assert.deepEqual(Array.from(u64le(5_000_000_000)), [0, 242, 5, 42, 1, 0, 0, 0]); // 5e9 = 0x12A05F200 LE
});

test("used bitmap decodes per-serial flags", () => {
  const used = (1n << 5n) | (1n << 7n);
  assert.equal(serialUsed(used, 5), true);
  assert.equal(serialUsed(used, 7), true);
  assert.equal(serialUsed(used, 6), false);
  assert.equal(serialUsed(0n, 1), false);
});

test("recipient validation rejects junk, non-canonical and self", () => {
  const SELF = "11111111111111111111111111111112"; // any canonical-looking key
  assert.equal(validateRecipient("", SELF).ok, false);
  assert.equal(validateRecipient("not-an-address", SELF).ok, false);
  assert.equal(validateRecipient(SELF, SELF).ok, false);
  assert.match(validateRecipient(SELF, SELF).error, /own wallet/);
  const good = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  assert.equal(validateRecipient(good, SELF).ok, true);
  assert.equal(validateRecipient(good, SELF).pubkey.toBase58(), good);
});

test("collateral accounting check matches the on-chain invariant", () => {
  assert.equal(collateralMatches(5_000_000_000, 5_000_000_000), true);
  assert.equal(collateralMatches(0, 5_000_000_000), false);
  assert.equal(collateralMatches(5_000_000_001, 5_000_000_000), false);
  assert.equal(collateralMatches(0, 0), false);
});

test("wrong-network classification", () => {
  assert.equal(classifyNetwork({ clusterKey: "mainnet", rpcReachable: true, programFound: false }).ok, false);
  assert.equal(classifyNetwork({ clusterKey: "testnet", rpcReachable: false, programFound: true }).ok, false);
  assert.equal(classifyNetwork({ clusterKey: "mainnet", rpcReachable: true, programFound: true, programExecutable: false }).ok, false);
  const ok = classifyNetwork({ clusterKey: "mainnet", rpcReachable: true, programFound: true, programExecutable: true });
  assert.equal(ok.ok, true);
  assert.match(ok.notes.join(" "), /program present/);
});

test("base58encode matches PublicKey.toBase58 (wallet-standard signature bytes)", () => {
  assert.equal(base58encode(new Uint8Array([])), "");
  for (let i = 0; i < 25; i++) {
    const kp = Keypair.generate();
    assert.equal(base58encode(kp.publicKey.toBytes()), kp.publicKey.toBase58());
  }
  // leading zero bytes must map to leading '1's
  const z = new Uint8Array(32); z[31] = 5;
  assert.equal(base58encode(z), new PublicKey(z).toBase58());
  assert.equal(base58encode(z), "1".repeat(31) + "6");
});
