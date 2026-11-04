/* Wolf Coin BETA — client. Static site; no backend; never asks for seed/keys.
 *
 * Reuses the REVIEWED on-chain program (id in config.js) unchanged. This file
 * only *builds and (in live mode) sends* transactions to that program. In the
 * default preview mode (cfg.live === false) every action is dry-run via RPC
 * `simulateTransaction` — nothing is signed-and-sent.
 */
import { Buffer } from "buffer";
import {
  Connection, PublicKey, Transaction, TransactionInstruction,
  SystemProgram, ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL
} from "@solana/web3.js";
// @solana/web3.js expects a global Buffer in the browser; provide it from the bundled polyfill.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { u32le, u64le, concat, serialUsed, validateRecipient, classifyNetwork, collateralMatches } from "./beta-core.js";

const CFG = window.WOLF_BETA;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ------------------------------------------------------------------ encodings */
const D = {
  init:   Uint8Array.from([189, 181, 20, 17, 174, 57, 249, 59]),
  mint:   Uint8Array.from([146, 170, 74, 221, 167, 172, 132, 213]),
  redeem: Uint8Array.from([184, 12, 86, 149, 70, 196, 97, 225]),
};
const PROGRAM_ID = new PublicKey(CFG.programId);
const TM_ID = new PublicKey(CFG.tokenMetadataProgramId);
const ATA_ID = new PublicKey(CFG.associatedTokenProgramId);

const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const registryPda = () => pda([Buffer.from("registry")]);
const claimPda = (s) => pda([Buffer.from("claim"), Buffer.from(u32le(s))]);
const vaultPda = (s) => pda([Buffer.from("vault"), Buffer.from(u32le(s))]);
const metaPda = (mint) => PublicKey.findProgramAddressSync([Buffer.from("metadata"), TM_ID.toBuffer(), mint.toBuffer()], TM_ID)[0];
const editionPda = (mint) => PublicKey.findProgramAddressSync([Buffer.from("metadata"), TM_ID.toBuffer(), mint.toBuffer(), Buffer.from("edition")], TM_ID)[0];
const ata = (owner, mint) => getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ATA_ID);

/* ------------------------------------------------------------------ instructions */
function ixMint(payer, serial, mint) {
  const holderAta = ata(payer, mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: registryPda(), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: true, isWritable: true },
      { pubkey: holderAta, isSigner: false, isWritable: true },
      { pubkey: vaultPda(serial), isSigner: false, isWritable: true },
      { pubkey: claimPda(serial), isSigner: false, isWritable: true },
      { pubkey: metaPda(mint), isSigner: false, isWritable: true },
      { pubkey: editionPda(mint), isSigner: false, isWritable: true },
      { pubkey: TM_ID, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ATA_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(D.mint, u32le(serial)),
  });
}
function ixRedeem(holder, serial, mint) {
  const holderAta = ata(holder, mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: registryPda(), isSigner: false, isWritable: true },
      { pubkey: claimPda(serial), isSigner: false, isWritable: true },
      { pubkey: vaultPda(serial), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: holderAta, isSigner: false, isWritable: true },
      { pubkey: holder, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(D.redeem, u32le(serial)),
  });
}
function ixTransferIxs(from, to, mint) {
  const src = ata(from, mint), dst = ata(to, mint);
  const ixs = [];
  ixs.push(createAssociatedTokenAccountIdempotentInstruction(from, dst, to, mint, TOKEN_PROGRAM_ID, ATA_ID));
  ixs.push(createTransferInstruction(src, dst, from, 1, [], TOKEN_PROGRAM_ID));
  return ixs;
}

/* ------------------------------------------------------------------ decoders */
function decodeRegistry(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    authority: new PublicKey(data.slice(8, 40)),
    collateralLamports: Number(dv.getBigUint64(40, true)),
    minted: dv.getUint32(48, true),
    redeemed: dv.getUint32(52, true),
    used: dv.getBigUint64(56, true),
    bump: data[64],
  };
}
function decodeClaim(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { serial: dv.getUint32(8, true), mint: new PublicKey(data.slice(12, 44)), bump: data[44] };
}
function decodeTokenAccount(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { mint: new PublicKey(data.slice(0, 32)), owner: new PublicKey(data.slice(32, 64)), amount: Number(dv.getBigUint64(64, true)) };
}
/* ------------------------------------------------------------------ app state */
const app = {
  clusterKey: CFG.defaultCluster,
  connection: null,
  provider: null,
  wallet: null,             // PublicKey
  registry: null,           // decoded
  coins: [],                // { serial, used, claim, vaultLamports, owned, mint }
  busy: false,
};

const cfgCluster = () => CFG.clusters[app.clusterKey];
const explorerTx = (sig) => `${cfgCluster().explorer}/tx/${sig}`;
const explorerAddr = (a) => `${cfgCluster().explorer}/address/${a}`;
const short = (s, n = 4) => (typeof s === "string" ? `${s.slice(0, n)}…${s.slice(-n)}` : "");

/* ------------------------------------------------------------------ wallet */
function detectProvider() {
  if (window.x1?.connect) return window.x1;
  if (window.solana?.connect) return window.solana;
  if (window.phantom?.solana?.connect) return window.phantom.solana;
  if (window.solflare?.connect) return window.solflare;
  if (window.backpack?.connect) return window.backpack;
  return null;
}
function providerName() {
  const p = app.provider;
  if (!p) return "wallet";
  if (p.isX1) return "X1 Wallet";
  if (p.isPhantom) return "Phantom";
  if (p.isSolflare) return "Solflare";
  if (p.isBackpack) return "Backpack";
  return p.name || "wallet";
}

async function connectWallet() {
  const p = detectProvider();
  if (!p) {
    toast("No X1-compatible wallet found. Install X1 Wallet (or a wallet-standard provider) and reload.", "warn");
    return;
  }
  app.provider = p;
  try {
    const res = await p.connect();
    const pk = res?.publicKey || p.publicKey;
    if (!pk) throw new Error("wallet returned no public key");
    app.wallet = new PublicKey(pk);
    render();
    toast(`Connected ${providerName()}: ${short(app.wallet.toBase58(), 6)}`, "ok");
    await verifyNetwork();
    await refreshChainState();
  } catch (e) {
    toast(`Connect failed: ${e.message || e}`, "err");
  }
}
async function disconnectWallet() {
  try { await app.provider?.disconnect?.(); } catch { /* ignore */ }
  app.provider = null; app.wallet = null; app.coins = []; render();
}

/** Network check: right cluster + program actually present. */
async function verifyNetwork() {
  const c = cfgCluster();
  let rpcReachable = true;
  try { await app.connection.getHealth(); } catch { rpcReachable = false; }
  const prog = await app.connection.getAccountInfo(PROGRAM_ID).catch(() => null);
  const net = classifyNetwork({
    clusterKey: c.label, rpcReachable, programFound: !!prog, programExecutable: prog ? prog.executable : false,
  });
  app.net = net;
  if (!net.ok) toast(net.notes.join(" · "), "warn");
  render();
}

/* ------------------------------------------------------------------ chain state */
async function refreshChainState() {
  if (app.busy) return;
  app.busy = true; render();
  try {
    app.connection = app.connection || new Connection(cfgCluster().rpc, "confirmed");
    const regInfo = await app.connection.getAccountInfo(registryPda(), "confirmed");
    app.registry = regInfo ? decodeRegistry(Uint8Array.from(regInfo.data)) : null;

    const coins = [];
    const owner = app.wallet || null;
    for (let s = CFG.serialFirstName; s < CFG.serialFirstName + CFG.maxSupply; s++) {
      const claimInfo = await app.connection.getAccountInfo(claimPda(s), "confirmed");
      let coin = { serial: s, label: CFG.serialLabel(s), used: app.registry ? serialUsed(app.registry.used, s) : null, claim: null, vaultLamports: 0, owned: false, mint: null };
      if (claimInfo) {
        coin.claim = decodeClaim(Uint8Array.from(claimInfo.data));
        coin.mint = coin.claim.mint;
        const v = await app.connection.getAccountInfo(vaultPda(s), "confirmed");
        coin.vaultLamports = v ? v.lamports : 0;
        if (owner && coin.mint) {
          const ta = await app.connection.getAccountInfo(ata(owner, coin.mint), "confirmed");
          if (ta) { const d = decodeTokenAccount(Uint8Array.from(ta.data)); coin.owned = d.owner.equals(owner) && d.amount === 1; }
        }
      }
      coins.push(coin);
    }
    app.coins = coins;
  } catch (e) {
    toast(`State read failed: ${e.message || e}`, "err");
  } finally {
    app.busy = false; render();
  }
}

/* ------------------------------------------------------------------ tx pipeline */
async function withTx(ixs, signers, actionLabel) {
  const from = app.wallet;
  if (!from) { toast("Connect a wallet first.", "warn"); return; }
  const conn = app.connection || new Connection(cfgCluster().rpc, "confirmed");
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs);
  tx.feePayer = from;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  if (signers?.length) tx.partialSign(...signers);

  // ---- PREVIEW MODE: simulate only (never sends) ----
  if (!CFG.live) {
    try {
      const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
      const err = sim.value.err;
      const logs = (sim.value.logs || []).slice(-6).join("\n");
      if (err) throw new Error(`simulation failed: ${JSON.stringify(err)}\n${logs}`);
      toast(`${actionLabel}: DRY-RUN OK (simulated, not sent). ${cfgCluster().realValue ? "⚠ real XNT network — nothing was spent." : ""}`, "ok");
      log(`${actionLabel} dry-run simulated OK (units=${sim.value.unitsConsumed ?? "?"})`);
    } catch (e) {
      toast(`${actionLabel}: dry-run failed — ${e.message || e}`, "err");
      log(`${actionLabel} dry-run FAILED: ${e.message || e}`);
    }
    return;
  }

  // ---- LIVE MODE: sign + send (only when cfg.live === true) ----
  try {
    let sig;
    if (app.provider.signTransaction) {
      const signed = await app.provider.signTransaction(tx);
      sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
    } else if (app.provider.signAndSendTransaction) {
      const r = await app.provider.signAndSendTransaction(tx);
      sig = typeof r === "string" ? r : r.signature;
    } else {
      throw new Error("wallet cannot sign transactions");
    }
    log(`${actionLabel} sent: <a href="${explorerTx(sig)}" target="_blank" rel="noopener">${sig.slice(0, 12)}…</a>`);
    const conf = await conn.confirmTransaction(sig, "confirmed");
    if (conf.value.err) throw new Error("tx failed on-chain: " + JSON.stringify(conf.value.err));
    toast(`${actionLabel} confirmed ✔ ${short(sig, 6)}`, "ok");
    await refreshChainState();
  } catch (e) {
    toast(`${actionLabel} failed: ${e.message || e}`, "err");
  }
}

/* ------------------------------------------------------------------ flows */
async function doMint(serial) {
  const c = app.coins.find((x) => x.serial === serial);
  if (c?.used) { toast(`Serial ${c.label} is already minted (permanently retired once used).`, "warn"); return; }
  const mintKp = Keypair.generate();
  const ixs = [ixMint(app.wallet, serial, mintKp.publicKey)];
  log(`MINT ${CFG.serialLabel(serial)} → locks ${CFG.collateralXnt} XNT, mints 1-of-1 NFT`);
  await withTx(ixs, [mintKp], `Mint ${CFG.serialLabel(serial)}`);
}
async function doTransfer(serial, recipientStr) {
  const c = app.coins.find((x) => x.serial === serial);
  const v = validateRecipient(recipientStr, app.wallet?.toBase58());
  if (!v.ok) { toast(v.error, "warn"); return; }
  const to = v.pubkey;
  if (!c?.owned) { toast("You do not currently hold this coin (ownership check failed on-chain).", "warn"); return; }
  const ixs = ixTransferIxs(app.wallet, to, c.mint);
  log(`TRANSFER ${c.label} → ${short(to.toBase58(), 6)} (ownership + redemption right move together)`);
  await withTx(ixs, [], `Transfer ${c.label}`);
}
async function doRedeem(serial) {
  const c = app.coins.find((x) => x.serial === serial);
  if (!c?.owned) { toast("You do not currently hold this coin.", "warn"); return; }
  if (!collateralMatches(c.vaultLamports, app.registry?.collateralLamports ?? CFG.collateralLamports)) {
    toast(`Collateral check failed: vault holds ${c.vaultLamports} lamports, expected ${app.registry?.collateralLamports ?? CFG.collateralLamports}.`, "warn");
    return;
  }
  const ixs = [ixRedeem(app.wallet, serial, c.mint)];
  log(`REDEEM ${c.label} → burns the NFT and RETURNS exactly ${CFG.collateralXnt} XNT (serial permanently retired)`);
  await withTx(ixs, [], `Redeem ${c.label}`);
}

/* ------------------------------------------------------------------ render */
function render() {
  const c = cfgCluster();
  const setTxt = (id, v) => { const e = document.getElementById(id); if (e && v) e.textContent = v; };
  setTxt("clusterLabelTop", c.label);
  setTxt("artInscription", CFG.artwork.inscription);
  setTxt("faqInscription", CFG.artwork.inscription);
  setTxt("artHash", CFG.artwork.blake3);
  setTxt("faqHash", CFG.artwork.blake3);
  setTxt("progId", CFG.programId);
  setTxt("progIdFoot", CFG.programId);
  setTxt("metaBase", CFG.metadataBase);
  const exl = document.getElementById("explorerLink"); if (exl) exl.href = c.explorer;
  const reg = app.registry;
  $("#supply").textContent = reg ? `${reg.minted}/${CFG.maxSupply}` : `–/${CFG.maxSupply}`;
  $("#cost").textContent = `${CFG.collateralXnt} XNT`;
  $("#collateral").textContent = reg ? `${(reg.collateralLamports / LAMPORTS_PER_SOL)} XNT` : `${CFG.collateralXnt} XNT`;
  $("#walletPill").textContent = app.wallet ? `${providerName()} · ${short(app.wallet.toBase58(), 4)}` : "not connected";
  $("#connectBtn").textContent = app.wallet ? "Disconnect" : "Connect X1 wallet";
  $("#liveBanner").hidden = CFG.live;
  $("#refreshBtn").disabled = app.busy;

  const netEl = $("#netcheck");
  if (app.net) {
    netEl.hidden = false;
    netEl.className = "netcheck " + (app.net.ok ? "ok" : "bad");
    netEl.innerHTML = (app.net.ok ? "✔ network check passed — " : "⚠ network check — ") + app.net.notes.join(" · ");
  } else netEl.hidden = true;

  $("#grid").innerHTML = (app.coins.length ? app.coins : placeholders()).map((coin) => {
    const state = coin.used === null ? "unknown" : coin.used ? (coin.claim ? "minted" : "retired") : "available";
    const owned = coin.owned ? '<span class="badge own">you own it</span>' : "";
    return `
    <article class="card" data-serial="${coin.serial}">
      <img class="card__art" src="${CFG.artwork.src}" alt="Wolf Coin ${coin.label}" loading="lazy" width="512" height="512">
      <div class="card__body">
        <div class="card__kicker">SERIAL ${coin.label}</div>
        <div class="card__title">Wolf Coin</div>
        <div class="card__meta">
          <span>Backing <b>${CFG.collateralXnt} XNT</b></span>
          <span>State <b class="st-${state}">${state}</b></span>
        </div>
        <div class="card__badges"><span class="badge ${state}">${state}</span>${owned}</div>
        <button class="btn small" data-open="${coin.serial}" ${coin.used === null ? "disabled" : ""}>${coin.used ? "View" : "Mint…"}</button>
      </div>
    </article>`;
  }).join("");

  $$("#grid [data-open]").forEach((b) => b.addEventListener("click", () => openCoin(Number(b.dataset.open))));
  renderLogFromArray();
}

function placeholders() {
  return Array.from({ length: CFG.maxSupply }, (_, i) => ({ serial: CFG.serialFirstName + i, label: CFG.serialLabel(CFG.serialFirstName + i), used: null, claim: null, vaultLamports: 0, owned: false }));
}

function openCoin(serial) {
  const c = app.coins.find((x) => x.serial === serial) || placeholders().find((x) => x.serial === serial);
  $("#drawerTitle").textContent = `Wolf Coin ${c.label}`;
  const rows = [
    ["Serial", c.label],
    ["Backing", `${CFG.collateralXnt} XNT (locked in vault PDA)`],
    ["Vault balance", `${(c.vaultLamports / LAMPORTS_PER_SOL).toFixed(9)} XNT`],
    ["State", c.used === null ? "connect to load" : c.used ? (c.claim ? "minted" : "retired") : "available"],
    ["Mint", c.mint ? short(c.mint.toBase58(), 6) : "—"],
    ["You hold it", c.owned ? "yes" : c.used ? "no" : "—"],
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join("");

  const canMint = !c.used && app.wallet && app.registry;
  const canHold = c.owned;
  $("#drawerBody").innerHTML = `
    <img class="drawer__art" src="${CFG.artwork.src}" alt="Wolf Coin ${c.label}" width="512" height="512">
    <div class="muted small">Ownership is enforced <b>on-chain</b> — these buttons only build the transaction the reviewed program checks.</div>
    <div class="kvlist">${rows}</div>
    <div class="actions">
      <button class="btn primary" id="actMint" ${canMint ? "" : "disabled"}>Mint (lock ${CFG.collateralXnt} XNT)</button>
      <div class="field">
        <input id="recipient" placeholder="Recipient X1 address" autocomplete="off" spellcheck="false" ${canHold ? "" : "disabled"} />
        <button class="btn" id="actTransfer" ${canHold ? "" : "disabled"}>Transfer</button>
      </div>
      <button class="btn danger" id="actRedeem" ${canHold ? "" : "disabled"}>Redeem — burns NFT, returns ${CFG.collateralXnt} XNT</button>
    </div>
    <div class="warn small">Redeem <b>permanently burns</b> the NFT and retires ${c.label}. Transfer sends the coin <b>and</b> the right to redeem it.</div>`;
  $("#drawer").hidden = false;
  $("#actMint")?.addEventListener("click", () => withConfirm(`Mint ${c.label}`, `Mint ${c.label} and lock exactly ${CFG.collateralXnt} XNT?`, () => doMint(c.serial)));
  $("#actTransfer")?.addEventListener("click", () => withConfirm(`Transfer ${c.label}`, `Send ${c.label} to ${$("#recipient").value || "(recipient)"}? The new holder gains the redemption right.`, () => doTransfer(c.serial, $("#recipient").value)));
  $("#actRedeem")?.addEventListener("click", () => withConfirm(`Redeem ${c.label}`, `PERMANENTLY burn ${c.label} and return ${CFG.collateralXnt} XNT? This cannot be undone.`, () => doRedeem(c.serial)));
}
function closeDrawer() { $("#drawer").hidden = true; }

let confirmResolve = null;
function withConfirm(title, body, onYes) {
  $("#confirmTitle").textContent = title;
  $("#confirmBody").textContent = body;
  $("#confirm").hidden = false;
  confirmResolve = { onYes };
}
function wireConfirm() {
  $("#confirmNo").addEventListener("click", () => { $("#confirm").hidden = true; confirmResolve = null; });
  $("#confirmYes").addEventListener("click", async () => { const r = confirmResolve; $("#confirm").hidden = true; confirmResolve = null; if (r) { $("#drawer").hidden = true; await r.onYes(); } });
}

/* ------------------------------------------------------------------ log + toast */
const LOG = [];
function log(html) { LOG.unshift(`<b>${new Date().toLocaleTimeString()}</b> ${html}`); if (LOG.length > 80) LOG.pop(); renderLogFromArray(); }
function renderLogFromArray() { const el = $("#log"); if (el) el.innerHTML = LOG.map((l) => `<div class="l">${l}</div>`).join(""); }
let toastTimer = null;
function toast(msg, kind = "ok") {
  const el = $("#toast");
  el.className = "toast " + kind;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, kind === "err" ? 9000 : 5000);
}

/* ------------------------------------------------------------------ wiring */
function init() {
  app.connection = new Connection(cfgCluster().rpc, "confirmed");
  wireConfirm();
  $("#connectBtn").addEventListener("click", () => (app.wallet ? disconnectWallet() : connectWallet()));
  $("#startBtn").addEventListener("click", () => $("#collection").scrollIntoView({ behavior: "smooth" }));
  $("#refreshBtn").addEventListener("click", () => { if (!app.wallet) { toast("Connect a wallet to load holdings.", "warn"); return; } refreshChainState(); });
  $("#closeDrawer").addEventListener("click", closeDrawer);
  $("#drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") closeDrawer(); });
  $("#clusterSelect").addEventListener("change", (e) => {
    app.clusterKey = e.target.value;
    app.connection = new Connection(cfgCluster().rpc, "confirmed");
    app.registry = null; app.coins = []; app.net = null;
    toast(`Switched to ${cfgCluster().label}.`, "warn");
    render(); if (app.wallet) verifyNetwork().then(refreshChainState);
  });
  $("#clusterSelect").value = app.clusterKey;
  $("#artInscription").textContent = CFG.artwork.inscription;
  $("#artHash").textContent = CFG.artwork.blake3;
  log(`Wolf Coin BETA loaded · program ${short(CFG.programId, 6)} · ${CFG.maxSupply} serials · ${CFG.collateralXnt} XNT backing · ${cfgCluster().label}.`);
  render();
  // auto-load public state (no wallet needed for supply)
  refreshChainState();
}
document.addEventListener("DOMContentLoaded", init);
