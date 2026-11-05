/* Wolf Coin BETA — runtime configuration (loaded before app.bundle.js).
 *
 * This file is deployment-tunable WITHOUT rebuilding the bundle. Override any
 * value after deploying (or via Vercel env vars expanded at build time by
 * scripts/build.mjs) — see .env.example and docs/ENV-AND-DEPLOY.md.
 *
 * No secrets belong here. RPC endpoints are public.
 */
window.WOLF_BETA = {
  // ---- on-chain identity (REVIEWED program — do not change without re-review) ----
  programId: "L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5",
  tokenMetadataProgramId: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  tokenProgramId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  associatedTokenProgramId: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",

  // ---- clusters ----
  clusters: {
    mainnet: {
      label: "X1 mainnet",
      rpc: "https://rpc.mainnet.x1.xyz",
      ws: "wss://rpc.mainnet.x1.xyz",
      explorer: "https://explorer.mainnet.x1.xyz",
      realValue: true
    },
    testnet: {
      label: "X1 testnet",
      rpc: "https://rpc.testnet.x1.xyz",
      ws: "wss://rpc.testnet.x1.xyz",
      explorer: "https://explorer.testnet.x1.xyz",
      realValue: false
    }
  },
  defaultCluster: "mainnet",

  // ---- the beta collection ----
  maxSupply: 10,
  serialFirstName: 1,
  collateralXnt: 5,
  // 1 XNT == 1e9 lamports (same unit as Solana/X1 SOL-equivalent)
  collateralLamports: 5_000_000_000,
  serialLabel: function (n) { return "BETA-" + String(n).padStart(4, "0"); },

  // ---- artwork (the SEALED X1 Vault inscription, bundled + BLAKE3-verified) ----
  artwork: {
    src: "assets/wolf-coin.webp",
    heroSrc: "assets/wolf-coin-hero.webp",
    blake3: "1c870487914dc51dab1d5edba988c399960a3f464faa3bf3cdb396ce9d3b8f7c",
    size: 316818,
    mime: "image/webp",
    inscription: "5F1GrsYDZusa5y6QkFb3syevDKiaQVkVBRGJCn7mwMuG"
  },

  // ---- safety ----
  // live=false => every action is SIMULATED via RPC simulateTransaction only.
  // Nothing is signed-and-sent. Set to true only for an authorized live beta
  // (fresh user authorization + funds) — see docs/ENV-AND-DEPLOY.md.
  live: true,

  // ---- optional wallet-art hosting (the on-chain Metaplex uri points here; the
  // program's URI base is hardcoded, so wallet-side art depends on this repo/CDN) ----
  metadataBase: "https://cdn.jsdelivr.net/gh/x1goose404-ops/wolfcoin-metadata@v1/metadata/"
};
