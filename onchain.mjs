import { Connection, PublicKey } from "@solana/web3.js";
const RPC="https://rpc.mainnet.x1.xyz";
const PROGRAM="L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5";
const conn=new Connection(RPC,"confirmed");
const pk=new PublicKey(PROGRAM);
const info=await conn.getAccountInfo(pk);
console.log("program exists:", !!info, "executable:", info?.executable, "owner:", info?.owner?.toBase58(), "lamports:", info?.lamports, "dataLen:", info?.data?.length);
const reg=PublicKey.findProgramAddressSync([Buffer.from("registry")],pk)[0];
console.log("registry PDA:", reg.toBase58());
const r=await conn.getAccountInfo(reg,"confirmed");
console.log("registry exists:", !!r, "lamports:", r?.lamports, "dataLen:", r?.data?.length);
if(r){
 const b=Buffer.from(r.data);
 console.log("authority:", new PublicKey(b.subarray(8,40)).toBase58());
 console.log("collateralLamports:", b.readBigUInt64LE(40).toString(), "=", Number(b.readBigUInt64LE(40))/1e9, "XNT");
 console.log("minted:", b.readUInt32LE(48), "redeemed:", b.readUInt32LE(52));
 console.log("usedBitmap:", b.readBigUInt64LE(56).toString());
 console.log("bump:", b[64]);
}
for (const s of [1,2,3,4,5,6,7,8,9,10]) {
 const claim=PublicKey.findProgramAddressSync([Buffer.from("claim"),Buffer.from(new Uint8Array([s,0,0,0]))],pk)[0];
 const vault=PublicKey.findProgramAddressSync([Buffer.from("vault"),Buffer.from(new Uint8Array([s,0,0,0]))],pk)[0];
 const c=await conn.getAccountInfo(claim,"confirmed");
 const v=await conn.getAccountInfo(vault,"confirmed");
 console.log(`serial ${s}: claim=${c?("yes len="+c.data.length):"none"} vault=${v?v.lamports:"none"}`);
}
