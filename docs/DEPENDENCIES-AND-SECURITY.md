# Dependencies, artwork method & remaining security issues

## 1. How the artwork is served (method chosen + why)

The wolf art is the **sealed X1 Vault inscription** `5F1GrsYDZusa5y6QkFb3syevDKiaQVkVBRGJCn7mwMuG`
(content hash BLAKE3 `1c870487914dc51dab1d5edba988c399960a3f464faa3bf3cdb396ce9d3b8f7c`, 316,818 bytes,
`image/webp`). Three ways to show it:

| Method | Vault-gateway dependency | Wallet-compatible | Verdict |
|---|---|---|---|
| `https://x1vault.com/meta/<inscription>` at runtime | **yes** | n/a | rejected (third-party gateway, may rate-limit/change/misbehave) |
| **Bundle the exact inscribed bytes in the site** | **no** | site: yes | **chosen for the website** (BLAKE3-verified in `verify-art.mjs`) |
| Publish the art to the CDN the on-chain `uri` points at | no (uses jsdelivr/GitHub) | **wallet: yes** | **prepared** in `metadata-hosting/` (see §3) |

**Website = self-contained.** `scripts/verify-art.mjs` (and the build gate) prove the bundled bytes hash
to the on-chain content hash, so the gallery renders the real art with **no gateway call**.

## 2. Remaining dependency (wallet side)

The **reviewed program hardcodes** the Metaplex metadata `uri` base to
`https://cdn.jsdelivr.net/gh/x1goose404-ops/wolfcoin-metadata@v1/metadata/<serial>.json`.
A wallet renders art/metadata from *that* host, not from this site. So:

- **Remaining dependency: jsdelivr CDN + the `x1goose404-ops/wolfcoin-metadata` repo (tag `v1`).**
- To make wallets show the real wolf art, publish `metadata-hosting/` there (off-chain; **owner approval**).
  `@v1` is tag-pinned, so this means **moving the `v1` tag** — only safe **before any real mint**, or by
  deploying a program whose base is a new tag (**not allowed here**).
- Unavoidable without a program change. Flagged, not hidden.

### Also incorrect on the current CDN (pre-existing, off-chain)
The live `metadata/1..10.json` say `Denomination = "1 XNT"` while the art says **5 XNT** and the beta
collateral is **5 XNT**. `metadata-hosting/` fixes this (5 XNT). Until published, wallet metadata is
inconsistent with the beta — **do not mint for real with the stale metadata**.

## 3. Deployment status (as of this work)

- Program **not deployed on X1 mainnet**: `getAccountInfo(L3MrpyJh…)` → `null`; registry PDA → `null`.
- No mainnet deploy / mint / transfer / redeem / spend performed.
- Program **source unchanged** (sha256 `14ee01a1…`); production binary `e75bb7de…` (v3) restored after tests.
- Website: built locally, served, screenshotted. **Not published** (GitHub push = publish → needs approval).

## 4. Security issues & limits (honest list)

1. **Real-XNT risk.** Beta backing is real. Wrong-address transfers / lost keys / accidental burns are
   permanent. The UI warns; it cannot undo.
2. **Accidental external burn strands collateral** (by design — no recovery in the program). The site's
   Redeem is the safe burn path.
3. **Bundle literally contains @solana/web3.js** (~0.8 MB). Acceptable for beta; minify/gzip later.
4. **Wallet signing path is not live-tested** (no funded X1 wallet used here). The code supports
   `signTransaction` (preferred, needed for the mint keypair) and falls back to `signAndSendTransaction`.
   **Must be validated with a real wallet before the live beta.**
5. **No DAS/marketplace indexing claim.** Wallet rendering is asserted via Metaplex metadata standard;
   verified structurally on-chain, **not** yet in a real wallet (needs the gated beta mint).
6. **CSP `connect-src` is an allowlist** of the official X1 RPCs; self-hosted RPCs require updating it.
7. **Preview mode is a UX safety net, not a security boundary** — a user can always sign directly in a
   wallet. The contract is the boundary, and the tests show it holds.
8. Not third-party audited.

## 5. What the tests prove (contract-level, no frontend trust)

Run: `cargo test` in the program repo → **25/25** (`contract-tests/TEST-EVIDENCE.txt`). Key invariants:
collateral is locked/released **exactly** (`b02`,`b08`,`b09`); double mint/redeem, serial reuse, unauthorized
redeem, insufficient funds, wrong program id and failed-tx rollback all **fail atomically**; a prior owner
**cannot** redeem after transfer while the **new holder can** (`b07`); no hidden admin instruction exists (`b12`).
