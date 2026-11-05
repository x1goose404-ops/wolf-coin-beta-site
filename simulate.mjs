// Read-only RPC simulation of a MINT instruction against the LIVE reviewed program.
// No signing, no sending, no spend. Proves the 8-byte discriminators + account order
// in src/app.js match the deployed program.
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const RPC = "https://rpc.mainnet.x1.xyz";
const PROGRAM_ID = new PublicKey("L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5");
const TM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const ATA_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const D = { init: Uint8Array.from([189,181,20,17,174,57,249,59]), mint: Uint8Array.from([146,170,74,221,167,172,132,213]), redeem: Uint8Array.from([184,12,86,149,70,196,97,225]) };
const u32le = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const concat = (...as) => { const o = new Uint8Array(as.reduce((s,a)=>s+a.length,0)); let p=0; for (const a of as){o.set(a,p);p+=a.length;} return o; };
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const registryPda = () => pda([Buffer.from("registry")]);
const claimPda = (s) => pda([Buffer.from("claim"), Buffer.from(u32le(s))]);
const vaultPda = (s) => pda([Buffer.from("vault"), Buffer.from(u32le(s))]);
const metaPda = (m) => PublicKey.findProgramAddressSync([Buffer.from("metadata"), TM_ID.toBuffer(), m.toBuffer()], TM_ID)[0];
const editionPda = (m) => PublicKey.findProgramAddressSync([Buffer.from("metadata"), TM_ID.toBuffer(), m.toBuffer(), Buffer.from("edition")], TM_ID)[0];
const ata = (o, m) => getAssociatedTokenAddressSync(m, o, false, TOKEN_PROGRAM_ID, ATA_ID);

const conn = new Connection(RPC, "confirmed");
const payer = new PublicKey("2ovF3vdxQNkv2xFc1zoDQgwdTgyxeTeAbg6rgnFgXDeM"); // existing funded account (registry authority) — sim only, never signs/sends
const mint = Keypair.generate();                   // mint keypair (not used for signing in sim)
const serial = 1;
const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: registryPda(), isSigner: false, isWritable: true },
    { pubkey: mint.publicKey, isSigner: true, isWritable: true },
    { pubkey: ata(payer, mint.publicKey), isSigner: false, isWritable: true },
    { pubkey: vaultPda(serial), isSigner: false, isWritable: true },
    { pubkey: claimPda(serial), isSigner: false, isWritable: true },
    { pubkey: metaPda(mint.publicKey), isSigner: false, isWritable: true },
    { pubkey: editionPda(mint.publicKey), isSigner: false, isWritable: true },
    { pubkey: TM_ID, isSigner: false, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ATA_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: concat(D.mint, u32le(serial)),
});
const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ix);
tx.feePayer = payer;
tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
const sim = await conn.simulateTransaction(tx);
console.log("err:", JSON.stringify(sim.value.err));
console.log("unitsConsumed:", sim.value.unitsConsumed);
console.log("--- logs ---");
console.log((sim.value.logs || []).join("\n"));
