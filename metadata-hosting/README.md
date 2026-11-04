# Wallet metadata hosting (off-chain)

The reviewed program **hardcodes** the on-chain Metaplex metadata `uri` to:

```
https://cdn.jsdelivr.net/gh/x1goose404-ops/wolfcoin-metadata@v1/metadata/<serial>.json
```

so a wallet renders whatever that CDN serves. This folder is the **prepared** content for
that repo: ten serial JSONs plus `coin.webp` = the **sealed X1 Vault inscription** artwork
(BLAKE3 `1c870487…`).

## Why this exists
The website itself does **not** depend on the Vault gateway (`x1vault.com`): it bundles the
exact inscribed bytes. But the **wallet** reads art from the on-chain `uri`, which points at
the CDN above. To make wallets show the real wolf art, this content must be published to that
repo/tag (off-chain, no program change).

## Publish (needs owner approval — off-chain write)
```sh
# from a checkout of x1goose404-ops/wolfcoin-metadata
cp -r <this folder>/metadata/*  metadata/
git add metadata && git commit -m "beta: wolf-art metadata (5 XNT)"
git tag -f v1 && git push origin master --force-with-lease && git push -f origin v1
```
Notes / dependencies (see `docs/DEPENDENCIES-AND-SECURITY.md`):
- `@v1` is a **tag**; the program's URI base is tag-pinned, so publishing requires **moving `v1`**
  (only safe *before* any real mint) **or** minting with a program whose base is a new tag (not allowed here).
- jsdelivr caches tag refs; allow time / purge.
- Verify after publish: `curl -sI <BASE>coin.webp` returns `200 image/webp`, and the bytes' BLAKE3
  equals `1c870487914dc51dab1d5edba988c399960a3f464faa3bf3cdb396ce9d3b8f7c`.
