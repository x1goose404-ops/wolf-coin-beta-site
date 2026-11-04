# Contract tests (added)

The **canonical, runnable** home of these tests is the reviewed program repo:

```
projects/wolf-nft-mission010/programs/wolf_nft/tests/wolf_nft_beta.rs
```

Run them there (they reuse the program's LiteSVM harness + vendored Metaplex fixture):

```sh
cd projects/wolf-nft-mission010
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"   # for cargo-build-sbf
cargo build-sbf --arch v1 --manifest-path programs/wolf_nft/Cargo.toml     # LiteSVM loads the v1 build
cargo test      --manifest-path programs/wolf_nft/Cargo.toml
# -> tests/wolf_nft.rs        12/12 (reviewed, unchanged)
# -> tests/wolf_nft_beta.rs   13/13 (ADDED)
# total 25/25
```

This folder keeps a **copy** (`wolf_nft_beta.rs`) and the captured run (`TEST-EVIDENCE.txt`) for the
deliverable. See `programs/wolf_nft/tests/wolf_nft_beta.rs` for the authoritative file.

## Coverage map (task ask → test)

| Requirement | Test |
|---|---|
| double mint | `b01_double_mint_same_serial_rejected` |
| double redeem | `b04_double_redeem_rejected` (+ existing `t07`) |
| unauthorized redeem | `b05_unauthorized_redeem_rejected` (+ existing `t08`) |
| serial reuse | `b06_serial_reuse_after_redeem_rejected` (+ existing `t11`) |
| insufficient funds | `b03_insufficient_funds_mint_fails_atomically` |
| wrong network / program | `b10_wrong_program_id_rejected` |
| failed-tx rollback | `b11_failed_mint_tx_rolls_back` (+ existing `t09`) |
| prior owner cannot redeem after transfer | `b07_prior_owner_cannot_redeem_after_transfer` (+ existing `t04`) |
| **on-chain collateral accounting** | `b02`, `b08`, `b09` |
| no hidden admin path | `b12_no_hidden_admin_instruction`, `b13_registry_single_init_and_nonzero_collateral` |

Note: "wrong network" is fundamentally a **UI/config** concern (there is no network inside LiteSVM); the
Rust side proves the instruction is bound to the deployed program id, and the UI side is unit-tested in
`tests/beta-core.test.mjs` (`classifyNetwork`).
