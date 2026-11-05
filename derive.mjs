import { PublicKey } from "@solana/web3.js";
const P = new PublicKey("L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5");
const reg = PublicKey.findProgramAddressSync([Buffer.from("registry")], P)[0];
for (const s of [1]) {
  const b = Uint8Array.of(s,0,0,0);
  console.log("claim"+s, PublicKey.findProgramAddressSync([Buffer.from("claim"), b], P)[0].toBase58());
  console.log("vault"+s, PublicKey.findProgramAddressSync([Buffer.from("vault"), b], P)[0].toBase58());
}
console.log("registry", reg.toBase58());
