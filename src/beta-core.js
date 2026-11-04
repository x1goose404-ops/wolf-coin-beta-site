/* Wolf Coin BETA — pure, DOM-free helpers (unit-tested in tests/beta-core.test.mjs). */
import { PublicKey } from "@solana/web3.js";

export const u32le = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
export const u64le = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
export const concat = (...as) => { const n = as.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of as) { o.set(a, p); p += a.length; } return o; };
export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");

/** Registry `used` bitmap: bit `s` set == serial `s` already minted. */
export const serialUsed = (usedBitmap, s) => (BigInt(usedBitmap) & (1n << BigInt(s))) !== 0n;

export function serialLabel(n) { return "BETA-" + String(n).padStart(4, "0"); }

/** Validate a recipient address for TRANSFER (never asks for keys). */
export function validateRecipient(recipientStr, selfStr) {
  const s = String(recipientStr || "").trim();
  if (!s) return { ok: false, error: "Enter a recipient address." };
  let pk;
  try { pk = new PublicKey(s); } catch { return { ok: false, error: "Not a valid X1 address." }; }
  if (pk.toBase58() !== s) return { ok: false, error: "Address is not in canonical base58 form." };
  if (selfStr && pk.toBase58() === selfStr) return { ok: false, error: "Recipient is your own wallet." };
  return { ok: true, pubkey: pk };
}

/** Collateral accounting check (mirror of the on-chain invariant; the contract is authoritative). */
export function collateralMatches(vaultLamports, registryCollateralLamports) {
  return Number(vaultLamports) === Number(registryCollateralLamports) && Number(registryCollateralLamports) > 0;
}

/** Wrong-network / wrong-cluster check for the UI. */
export function classifyNetwork({ clusterKey, rpcReachable, programFound, programExecutable }) {
  const notes = [];
  let ok = true;
  if (!rpcReachable) { ok = false; notes.push(`RPC for ${clusterKey} unreachable`); }
  if (!programFound) { ok = false; notes.push(`program not found on ${clusterKey} (beta not deployed here?)`); }
  else if (!programExecutable) { ok = false; notes.push("program account is not executable"); }
  if (ok) notes.push(`${clusterKey} reachable · program present`);
  return { ok, notes };
}
