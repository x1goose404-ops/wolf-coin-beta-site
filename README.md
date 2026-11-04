# Wolf Coin BETA — website

Static, mobile-friendly **mint / transfer / redeem** client for the **reviewed** Wolf Coin program on **X1**.
**EXPERIMENTAL · NOT AUDITED.** Backing is **REAL XNT** on mainnet — read the warnings.

- **Program:** `wolf_nft` → `L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5` (reused unchanged; not rebuilt)
- **Collection:** 10 serials `BETA-0001`…`BETA-0010`, each backed by **5 XNT** locked on-chain
- **Artwork:** the **sealed X1 Vault inscription** `5F1GrsYDZusa5y6QkFb3syevDKiaQVkVBRGJCn7mwMuG`
  (BLAKE3 `1c870487…`), bundled locally → **no `x1vault.com` dependency at runtime**
- **Safety:** default **preview mode** — every action is dry-run via RPC simulation; nothing is signed/sent

## What's here

```
index.html styles.css config.js         static shell + runtime config (no build needed to edit config)
src/app.js src/beta-core.js             client (bundles @solana/web3.js + @solana/spl-token)
scripts/                                build · verify-art · verify-metadata · gen-metadata · serve
assets/                                 wolf art (sealed inscription) + hero + placeholder
metadata-hosting/                       prepared wallet-metadata content for the CDN uri (off-chain)
contract-tests/                         added LiteSVM tests + evidence (canonical copy lives in the program repo)
tests/                                  node unit tests (pure helpers)
docs/                                   env/deploy + dependencies/security
vercel.json                             Vercel config (headers incl. CSP)
```

## Run locally

```sh
npm install                 # @solana/web3.js, @solana/spl-token, esbuild
npm run verify-art          # canonically checks the artwork == sealed inscription BLAKE3
npm run build               # -> dist/ (bundles JS, copies static, re-verifies artwork)
npm run serve               # http://localhost:8080
npm run test:unit           # pure-helper unit tests
```

Screenshot of the served build: `shots/site.png` (desktop), `shots/site-mobile.png` (390px).

## The three flows

1. **MINT** — connect an X1 wallet → network check → pick a serial → builds `mint_coin(serial)`,
   which atomically mints a 1-of-1 NFT and locks **exactly 5 XNT** in the per-serial vault PDA.
2. **TRANSFER** — select an owned coin → validated recipient → builds an SPL transfer.
   Ownership **is** the redemption right; transferring moves both together.
3. **REDEEM** — select an owned coin → confirm the permanent burn → builds `redeem(serial)`, which
   burns the NFT and returns **exactly 5 XNT** atomically, retiring the serial forever.

Ownership/collateral are verified **on-chain** (the contract is authoritative; the UI checks are advisory).
The site never asks for a seed phrase or private key.

## Build the contract & run the tests

Reuses the reviewed program + tests at `../wolf-nft-mission010` (identical to repo `x1goose404-ops/wolf-coin-simple`):

```sh
cd ../wolf-nft-mission010
cargo build-sbf --arch v1 --manifest-path programs/wolf_nft/Cargo.toml   # LiteSVM needs the v1 build
cargo test      --manifest-path programs/wolf_nft/Cargo.toml             # 12 existing + 13 added = 25/25
```

Evidence: `contract-tests/TEST-EVIDENCE.txt`. Program source is **unchanged** (sha256
`14ee01a1ef0d57087ffd81ca033b166c6b9b9003aff697ffa1b1a3076882d5e7`).

## Deploy (preview only — no production/mainnet action authorized here)

Vercel: import the repo; `vercel.json` sets `buildCommand: npm run build`, `outputDirectory: dist`,
and strict security headers. See `docs/ENV-AND-DEPLOY.md`. **Do not enable live mode without a separate,
explicit authorization** (real XNT).

## Safety / approvals

Never commit keys. This project performs **no** mainnet deploy/spend/mint/transfer/redeem. Enabling live
mode, publishing to GitHub, or updating the metadata CDN are separate actions that need human approval.
See `docs/DEPENDENCIES-AND-SECURITY.md`.
