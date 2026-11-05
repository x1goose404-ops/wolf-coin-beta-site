// Read-only simulation of the TRANSFER pipeline (create-idempotent-ATA + SPL transfer 1)
// using EXACTLY the instruction builders from src/app.js, against real on-chain accounts.
// No signing, no sending, no spend. Uses raw base64 to avoid the jsonParsed quirk.
import { Connection, PublicKey, Transaction, ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
const RPC="https://rpc.mainnet.x1.xyz";
const ATA_ID=new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const conn=new Connection(RPC,"confirmed");
const from=new PublicKey("2ovF3vdxQNkv2xFc1zoDQgwdTgyxeTeAbg6rgnFgXDeM");
const list=await conn.getTokenAccountsByOwner(from,{programId:TOKEN_PROGRAM_ID},{encoding:"base64"});
const parse=(a)=>{const raw=Array.isArray(a.account.data)?a.account.data[0]:a.account.data;const d=Buffer.isBuffer(raw)?raw:Buffer.from(raw,"base64");return {ta:a.pubkey,mint:new PublicKey(d.subarray(0,32)),amount:d.readBigUInt64LE(64)};};
const toks=list.value.map(parse).filter(t=>t.amount>0n);
console.log("authority SPL accounts with balance:", toks.length);
toks.slice(0,8).forEach(t=>console.log("  mint",t.mint.toBase58(),"amount",t.amount.toString()));
if(!toks.length){console.log("no tokens to exercise transfer with");process.exit(0);}
const pick=toks.find(t=>t.amount===1n)||toks[0];
const to=Keypair.generate().publicKey;
const src=getAssociatedTokenAddressSync(pick.mint,from,false,TOKEN_PROGRAM_ID,ATA_ID);
const dst=getAssociatedTokenAddressSync(pick.mint,to,false,TOKEN_PROGRAM_ID,ATA_ID);
const ixs=[
 createAssociatedTokenAccountIdempotentInstruction(from,dst,to,pick.mint,TOKEN_PROGRAM_ID,ATA_ID),
 createTransferInstruction(src,dst,from,1,[],TOKEN_PROGRAM_ID),
];
const tx=new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),...ixs);
tx.feePayer=from; tx.recentBlockhash=(await conn.getLatestBlockhash("confirmed")).blockhash;
const sim=await conn.simulateTransaction(tx);
console.log("TRANSFER sim err:",JSON.stringify(sim.value.err),"units:",sim.value.unitsConsumed);
console.log((sim.value.logs||[]).slice(0,6).join("\n"));
