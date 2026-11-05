// Read-only RPC simulation of a REDEEM instruction against the LIVE reviewed program.
// No signing/sending. Confirms the discriminator + account layout are recognised.
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
const RPC="https://rpc.mainnet.x1.xyz";
const PROGRAM_ID=new PublicKey("L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5");
const ATA_ID=new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const D_REDEEM=Uint8Array.from([184,12,86,149,70,196,97,225]);
const u32le=(n)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n>>>0,true);return b;};
const concat=(...as)=>{const o=new Uint8Array(as.reduce((s,a)=>s+a.length,0));let p=0;for(const a of as){o.set(a,p);p+=a.length;}return o;};
const pda=(seeds)=>PublicKey.findProgramAddressSync(seeds,PROGRAM_ID)[0];
const conn=new Connection(RPC,"confirmed");
const holder=new PublicKey("2ovF3vdxQNkv2xFc1zoDQgwdTgyxeTeAbg6rgnFgXDeM");
const mint=new PublicKey("So11111111111111111111111111111111111111112");
const serial=1;
const ix=new TransactionInstruction({programId:PROGRAM_ID,keys:[
 {pubkey:pda([Buffer.from("registry")]),isSigner:false,isWritable:true},
 {pubkey:pda([Buffer.from("claim"),Buffer.from(u32le(serial))]),isSigner:false,isWritable:true},
 {pubkey:pda([Buffer.from("vault"),Buffer.from(u32le(serial))]),isSigner:false,isWritable:true},
 {pubkey:mint,isSigner:false,isWritable:true},
 {pubkey:getAssociatedTokenAddressSync(mint,holder,false,TOKEN_PROGRAM_ID,ATA_ID),isSigner:false,isWritable:true},
 {pubkey:holder,isSigner:true,isWritable:true},
 {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
 {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
],data:concat(D_REDEEM,u32le(serial))});
const tx=new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ix);
tx.feePayer=holder; tx.recentBlockhash=(await conn.getLatestBlockhash("confirmed")).blockhash;
const sim=await conn.simulateTransaction(tx);
console.log("err:",JSON.stringify(sim.value.err));
console.log((sim.value.logs||[]).slice(0,5).join("\n"));
