# Environment & deployment

**Static site. No backend. No server-side secrets.** Default mode is **preview** (simulation only).

## Modes

| Mode | `config.js live` | What buttons do |
|---|---|---|
| Preview (default) | `false` | Build the tx → RPC `simulateTransaction` → report. **Nothing signed or sent.** |
| Live beta | `true` | Sign with the wallet → `sendRawTransaction` → confirm → explorer link. **Real XNT.** |

Live mode requires a **separate, explicit human authorization** (real value moves) *and* that the program
be deployed where the config points. Do not flip it on the public site by default.

## Runtime config (`config.js`) — deployment-tunable without rebuild

- `programId`, `clusters.{mainnet,testnet}` (rpc / explorer), `defaultCluster`
- `maxSupply` (10), `collateralXnt` (5), `collateralLamports` (5_000_000_000)
- `artwork` (bundled sealed-inscription art + BLAKE3 + inscription id)
- `metadataBase` (must equal the reviewed program's hardcoded wallet `uri` base)
- `live` (preview/live gate)

No secrets belong here. RPC endpoints are public.

## Local preview

```sh
npm install
npm run verify-art && npm run build
npm run serve        # http://localhost:8080
```

## Vercel

`vercel.json` sets `buildCommand: npm run build`, `outputDirectory: dist`, `installCommand: npm install`,
`cleanUrls`, and strict headers (incl. a CSP whose `connect-src` allows only the X1 mainnet/testnet RPC+WS).

Steps (deployment itself needs Vercel account access — **not performed here**):
1. Push this repo to GitHub (owner approval required — it is a publish action).
2. In Vercel: **New Project → import repo → Deploy** (config is read from `vercel.json`).
3. Preview URL first; verify headers, then the flows in **preview mode**.
4. Only after the beta program is deployed + authorized, set `live:true` for the real beta.

### Env vars
None required at runtime. Optional knobs are documented in `.env.example`:
`X1_RPC_MAINNET`, `X1_RPC_TESTNET`, `WOLF_LIVE`, `WOLF_METADATA_BASE`. **Never** put keys/seeds in env.

## CSP note
The default CSP is `script-src 'self'; style-src 'self'` — the app ships as a bundled `app.bundle.js`
(no inline scripts/handlers) precisely so this can stay strict.

## Dependencies
`@solana/web3.js 1.99.0`, `@solana/spl-token 0.4.15` (bundled), `esbuild 0.28.2` (dev).
`buffer` is polyfilled into `globalThis` at bundle init (web3.js needs it in the browser).
