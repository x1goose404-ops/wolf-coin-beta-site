// Wolf Coin BETA — ADDED adversarial tests (extends the reviewed suite in wolf_nft.rs).
//
// Same harness/style as programs/wolf_nft/tests/wolf_nft.rs; loads the SBPF v1 build:
//   cargo build-sbf --arch v1 --manifest-path programs/wolf_nft/Cargo.toml
//   cargo test --manifest-path programs/wolf_nft/Cargo.toml --test wolf_nft_beta
//
// These tests target the specific properties the BETA website relies on:
//   double mint · double redeem · unauthorized redeem · serial reuse · insufficient funds ·
//   wrong network/program · failed-tx rollback · prior-owner-after-transfer ·
//   ON-CHAIN collateral accounting (frontend checks are NOT trusted).
//
// NOTE: they use the BETA collateral of 5 XNT (5_000_000_000 lamports) to match the live config.
use {
    litesvm::LiteSVM,
    solana_address::{address, Address},
    solana_instruction::{account_meta::AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_message::Message,
    solana_signer::Signer,
    solana_transaction::Transaction,
    solana_transaction_error::TransactionError,
    std::path::PathBuf,
};

const PROGRAM_ID: Address = address!("L3MrpyJhTLrJv57c2BcFH3vBbrrCnsakfwn6wHvzTz5");
const TOKEN_ID: Address = address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_ID: Address = address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_ID: Address = address!("11111111111111111111111111111111");
const TM_ID: Address = address!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const COLLATERAL: u64 = 5_000_000_000; // 5 XNT (beta)

const D_INIT: [u8; 8] = [189, 181, 20, 17, 174, 57, 249, 59];
const D_MINT: [u8; 8] = [146, 170, 74, 221, 167, 172, 132, 213];
const D_REDEEM: [u8; 8] = [184, 12, 86, 149, 70, 196, 97, 225];

fn so_path() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("../../target/deploy/wolf_nft.so");
    p
}
fn registry_pda() -> Address { Address::find_program_address(&[b"registry"], &PROGRAM_ID).0 }
fn claim_pda(s: u32) -> Address { Address::find_program_address(&[b"claim", &s.to_le_bytes()], &PROGRAM_ID).0 }
fn vault_pda(s: u32) -> Address { Address::find_program_address(&[b"vault", &s.to_le_bytes()], &PROGRAM_ID).0 }
fn ata(owner: &Address, mint: &Address) -> Address {
    Address::find_program_address(&[owner.as_ref(), TOKEN_ID.as_ref(), mint.as_ref()], &ATA_ID).0
}
fn meta_pda(mint: &Address) -> Address { Address::find_program_address(&[b"metadata", TM_ID.as_ref(), mint.as_ref()], &TM_ID).0 }
fn edition_pda(mint: &Address) -> Address { Address::find_program_address(&[b"metadata", TM_ID.as_ref(), mint.as_ref(), b"edition"], &TM_ID).0 }

struct Env { svm: LiteSVM, payer: Keypair }
fn setup() -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(PROGRAM_ID, so_path()).expect("load .so — run `cargo build-sbf --arch v1` first");
    let mut tm = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    tm.push("../../fixtures/mpl_token_metadata.so");
    svm.add_program_from_file(TM_ID, tm).expect("load metaplex program");
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey().into(), 1_000_000_000_000).unwrap();
    Env { svm, payer }
}
fn send(env: &mut Env, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), TransactionError> {
    env.svm.expire_blockhash();
    let bh = env.svm.latest_blockhash();
    let payer_pk: Address = payer.pubkey().into();
    let msg = Message::new_with_blockhash(ixs, Some(&payer_pk), &bh);
    let mut all: Vec<&Keypair> = vec![payer];
    for s in extra { if s.pubkey() != payer.pubkey() { all.push(s); } }
    let tx = Transaction::new(&all, msg, bh);
    match env.svm.send_transaction(tx) { Ok(_) => Ok(()), Err(e) => Err(e.err) }
}
fn lamports(env: &LiteSVM, a: &Address) -> u64 { env.get_account(a).map(|x| x.lamports).unwrap_or(0) }
fn token_amount(env: &LiteSVM, a: &Address) -> u64 {
    match env.get_account(a) { Some(acct) if acct.data.len() >= 72 => u64::from_le_bytes(acct.data[64..72].try_into().unwrap()), _ => 0 }
}
fn registry(env: &LiteSVM) -> Option<(u32 /*minted*/, u32 /*redeemed*/, u64 /*used*/, u64 /*collateral*/)> {
    env.get_account(&registry_pda()).map(|a| {
        let d = a.data;
        (u32::from_le_bytes(d[48..52].try_into().unwrap()),
         u32::from_le_bytes(d[52..56].try_into().unwrap()),
         u64::from_le_bytes(d[56..64].try_into().unwrap()),
         u64::from_le_bytes(d[40..48].try_into().unwrap()))
    })
}

fn ix_init(payer: &Address, collateral: u64) -> Instruction {
    let mut d = D_INIT.to_vec(); d.extend_from_slice(&collateral.to_le_bytes());
    Instruction { program_id: PROGRAM_ID, accounts: vec![
        AccountMeta::new(registry_pda(), false), AccountMeta::new(*payer, true), AccountMeta::new_readonly(SYSTEM_ID, false),
    ], data: d }
}
fn ix_mint(payer: &Address, s: u32, mint: &Address, holder_ata: &Address) -> Instruction {
    let mut d = D_MINT.to_vec(); d.extend_from_slice(&s.to_le_bytes());
    Instruction { program_id: PROGRAM_ID, accounts: vec![
        AccountMeta::new(registry_pda(), false),
        AccountMeta::new(*mint, true),
        AccountMeta::new(*holder_ata, false),
        AccountMeta::new(vault_pda(s), false),
        AccountMeta::new(claim_pda(s), false),
        AccountMeta::new(meta_pda(mint), false),
        AccountMeta::new(edition_pda(mint), false),
        AccountMeta::new_readonly(TM_ID, false),
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(TOKEN_ID, false),
        AccountMeta::new_readonly(ATA_ID, false),
        AccountMeta::new_readonly(SYSTEM_ID, false),
    ], data: d }
}
fn ix_mint_to(payer: &Address, s: u32, mint: &Address, holder_ata: &Address, program: &Address) -> Instruction {
    let mut ix = ix_mint(payer, s, mint, holder_ata); ix.program_id = *program; ix
}
fn ix_redeem(holder: &Address, s: u32, mint: &Address, holder_ata: &Address) -> Instruction {
    let mut d = D_REDEEM.to_vec(); d.extend_from_slice(&s.to_le_bytes());
    Instruction { program_id: PROGRAM_ID, accounts: vec![
        AccountMeta::new(registry_pda(), false),
        AccountMeta::new(claim_pda(s), false),
        AccountMeta::new(vault_pda(s), false),
        AccountMeta::new(*mint, false),
        AccountMeta::new(*holder_ata, false),
        AccountMeta::new(*holder, true),
        AccountMeta::new_readonly(TOKEN_ID, false),
        AccountMeta::new_readonly(SYSTEM_ID, false),
    ], data: d }
}
fn ix_token_transfer(src: &Address, dst: &Address, owner: &Address, amount: u64) -> Instruction {
    let mut d = vec![3u8]; d.extend_from_slice(&amount.to_le_bytes());
    Instruction { program_id: TOKEN_ID, accounts: vec![
        AccountMeta::new(*src, false), AccountMeta::new(*dst, false), AccountMeta::new_readonly(*owner, true),
    ], data: d }
}
fn ix_create_ata(payer: &Address, owner: &Address, mint: &Address) -> Instruction {
    Instruction { program_id: ATA_ID, accounts: vec![
        AccountMeta::new(*payer, true), AccountMeta::new(ata(owner, mint), false),
        AccountMeta::new_readonly(*owner, false), AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(SYSTEM_ID, false), AccountMeta::new_readonly(TOKEN_ID, false),
    ], data: vec![] }
}
fn setup_registry(env: &mut Env) {
    let p = env.payer.insecure_clone();
    send(env, &[ix_init(&p.pubkey().into(), COLLATERAL)], &p, &[]).expect("init registry");
}
fn mint_serial(env: &mut Env, serial: u32) -> (Keypair, Address) {
    let holder = env.payer.insecure_clone();
    let mint = Keypair::new();
    let holder_ata = ata(&holder.pubkey().into(), &mint.pubkey().into());
    send(env, &[ix_mint(&holder.pubkey().into(), serial, &mint.pubkey().into(), &holder_ata)], &holder, &[&mint]).expect("mint");
    (mint, holder_ata)
}

// b01 — DOUBLE MINT of the same serial is rejected and leaves state unchanged.
#[test]
fn b01_double_mint_same_serial_rejected() {
    let mut env = setup(); setup_registry(&mut env);
    let (_m1, _a1) = mint_serial(&mut env, 5);
    let before = registry(&env.svm).unwrap();
    let payer = env.payer.insecure_clone();
    let payer_pk: Address = payer.pubkey().into();
    let m2 = Keypair::new();
    let a2 = ata(&payer_pk, &m2.pubkey().into());
    let r = send(&mut env, &[ix_mint(&payer_pk, 5, &m2.pubkey().into(), &a2)], &payer, &[&m2]);
    assert!(r.is_err(), "second mint of serial 5 must fail");
    let after = registry(&env.svm).unwrap();
    assert_eq!(before.0, after.0, "minted counter unchanged");
    assert_eq!(lamports(&env.svm, &vault_pda(5)), COLLATERAL, "vault unchanged");
    assert!(env.svm.get_account(&m2.pubkey().into()).is_none(), "no second mint created");
}

// b02 — two DISTINCT serials mint independently; each locks EXACTLY the collateral.
#[test]
fn b02_distinct_serials_lock_exact_collateral() {
    let mut env = setup(); setup_registry(&mut env);
    let (_m5, _a5) = mint_serial(&mut env, 5);
    let (_m6, _a6) = mint_serial(&mut env, 6);
    assert_eq!(lamports(&env.svm, &vault_pda(5)), COLLATERAL);
    assert_eq!(lamports(&env.svm, &vault_pda(6)), COLLATERAL);
    let (minted, _red, used, coll) = registry(&env.svm).unwrap();
    assert_eq!(minted, 2, "two mints counted");
    assert_eq!(coll, COLLATERAL, "registry collateral == 5 XNT");
    assert_eq!(used & (1 << 5), 1 << 5, "serial 5 used");
    assert_eq!(used & (1 << 6), 1 << 6, "serial 6 used");
    assert_eq!(used & (1 << 7), 0, "serial 7 untouched");
}

// b03 — INSUFFICIENT FUNDS: a payer that cannot cover the 5 XNT collateral fails atomically.
#[test]
fn b03_insufficient_funds_mint_fails_atomically() {
    let mut env = setup(); setup_registry(&mut env);
    let poor = Keypair::new();
    env.svm.airdrop(&poor.pubkey().into(), 1_000_000_000).unwrap(); // 1 XNT < 5 XNT
    let m = Keypair::new();
    let a = ata(&poor.pubkey().into(), &m.pubkey().into());
    let r = send(&mut env, &[ix_mint(&poor.pubkey().into(), 3, &m.pubkey().into(), &a)], &poor, &[&m]);
    assert!(r.is_err(), "mint must fail without enough lamports");
    assert_eq!(lamports(&env.svm, &vault_pda(3)), 0, "no collateral locked");
    assert!(env.svm.get_account(&claim_pda(3)).is_none(), "no claim created");
    let (minted, _r, used, _c) = registry(&env.svm).unwrap();
    assert_eq!(minted, 0, "minted counter stays 0");
    assert_eq!(used, 0, "serial bitmap stays empty");
}

// b04 — DOUBLE REDEEM is rejected (claim closed on first redeem).
#[test]
fn b04_double_redeem_rejected() {
    let mut env = setup(); setup_registry(&mut env);
    let (mint, holder_ata) = mint_serial(&mut env, 7);
    let holder = env.payer.insecure_clone();
    send(&mut env, &[ix_redeem(&holder.pubkey().into(), 7, &mint.pubkey().into(), &holder_ata)], &holder, &[]).unwrap();
    let r = send(&mut env, &[ix_redeem(&holder.pubkey().into(), 7, &mint.pubkey().into(), &holder_ata)], &holder, &[]);
    assert!(r.is_err(), "second redeem must fail");
    assert_eq!(lamports(&env.svm, &vault_pda(7)), 0, "vault already emptied");
    let (_m, red, _u, _c) = registry(&env.svm).unwrap();
    assert_eq!(red, 1, "redeemed counter == 1 (not 2)");
}

// b05 — UNAUTHORIZED REDEEM: a stranger without the NFT cannot release the vault.
#[test]
fn b05_unauthorized_redeem_rejected() {
    let mut env = setup(); setup_registry(&mut env);
    let (mint, holder_ata) = mint_serial(&mut env, 5);
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey().into(), 2_000_000_000).unwrap();
    let r = send(&mut env, &[ix_redeem(&stranger.pubkey().into(), 5, &mint.pubkey().into(), &holder_ata)], &stranger, &[]);
    assert!(r.is_err(), "stranger redeem must fail");
    assert_eq!(lamports(&env.svm, &vault_pda(5)), COLLATERAL, "vault untouched");
    assert_eq!(token_amount(&env.svm, &holder_ata), 1, "NFT still held");
}

// b06 — SERIAL REUSE after redeem stays blocked (serial permanently retired).
#[test]
fn b06_serial_reuse_after_redeem_rejected() {
    let mut env = setup(); setup_registry(&mut env);
    let (mint, holder_ata) = mint_serial(&mut env, 7);
    let holder = env.payer.insecure_clone();
    send(&mut env, &[ix_redeem(&holder.pubkey().into(), 7, &mint.pubkey().into(), &holder_ata)], &holder, &[]).unwrap();
    let m2 = Keypair::new();
    let a2 = ata(&holder.pubkey().into(), &m2.pubkey().into());
    let r = send(&mut env, &[ix_mint(&holder.pubkey().into(), 7, &m2.pubkey().into(), &a2)], &holder, &[&m2]);
    assert!(r.is_err(), "retired serial cannot be re-minted");
}

// b07 — PRIOR OWNER cannot redeem after transferring the NFT away.
#[test]
fn b07_prior_owner_cannot_redeem_after_transfer() {
    let mut env = setup(); setup_registry(&mut env);
    let (mint, holder_ata) = mint_serial(&mut env, 5);
    let holder = env.payer.insecure_clone();
    let bob = Keypair::new(); env.svm.airdrop(&bob.pubkey().into(), 2_000_000_000).unwrap();
    let bob_ata = ata(&bob.pubkey().into(), &mint.pubkey().into());
    send(&mut env, &[ix_create_ata(&holder.pubkey().into(), &bob.pubkey().into(), &mint.pubkey().into())], &holder, &[]).unwrap();
    send(&mut env, &[ix_token_transfer(&holder_ata, &bob_ata, &holder.pubkey().into(), 1)], &holder, &[]).unwrap();
    let r = send(&mut env, &[ix_redeem(&holder.pubkey().into(), 5, &mint.pubkey().into(), &holder_ata)], &holder, &[]);
    assert!(r.is_err(), "old owner cannot redeem");
    assert_eq!(lamports(&env.svm, &vault_pda(5)), COLLATERAL, "vault intact");
    // the NEW holder can
    let r2 = send(&mut env, &[ix_redeem(&bob.pubkey().into(), 5, &mint.pubkey().into(), &bob_ata)], &bob, &[]);
    assert!(r2.is_ok(), "new holder redeems");
    assert_eq!(lamports(&env.svm, &vault_pda(5)), 0, "vault released");
}

// b08 — ON-CHAIN COLLATERAL ACCOUNTING: redeem returns EXACTLY the locked collateral.
#[test]
fn b08_redeem_returns_exact_collateral() {
    let mut env = setup(); setup_registry(&mut env);
    let (mint, holder_ata) = mint_serial(&mut env, 6);
    let holder = env.payer.insecure_clone();
    assert_eq!(lamports(&env.svm, &vault_pda(6)), COLLATERAL, "mint locked exactly 5 XNT");
    let before = lamports(&env.svm, &holder.pubkey().into());
    send(&mut env, &[ix_redeem(&holder.pubkey().into(), 6, &mint.pubkey().into(), &holder_ata)], &holder, &[]).unwrap();
    let after = lamports(&env.svm, &holder.pubkey().into());
    let delta = after.saturating_sub(before) as i128 - COLLATERAL as i128;
    // The vault returns EXACTLY 5 XNT. The only other movement is the refundable
    // claim-rent deposit being returned to the holder and the tiny tx fee paid.
    assert!(after >= before + COLLATERAL - 20_000, "returns at least ~5 XNT (fee only)");
    assert!(delta <= 2_000_000, "no more than the claim-rent refund above the collateral, got delta={delta}");
    assert_eq!(lamports(&env.svm, &vault_pda(6)), 0, "vault fully drained");
}

// b09 — mint never over-locks: extra payer lamports are not swept into the vault.
#[test]
fn b09_mint_locks_exactly_collateral_not_more() {
    let mut env = setup(); setup_registry(&mut env);
    let (_m, _a) = mint_serial(&mut env, 8);
    assert_eq!(lamports(&env.svm, &vault_pda(8)), COLLATERAL, "vault == collateral exactly");
}

// b10 — WRONG NETWORK/PROGRAM: the instruction only works against the deployed program id.
#[test]
fn b10_wrong_program_id_rejected() {
    let mut env = setup(); setup_registry(&mut env);
    let wrong = Address::new_unique();
    let payer = env.payer.insecure_clone();
    let payer_pk: Address = payer.pubkey().into();
    let m = Keypair::new();
    let a = ata(&payer_pk, &m.pubkey().into());
    let r = send(&mut env, &[ix_mint_to(&payer_pk, 5, &m.pubkey().into(), &a, &wrong)], &payer, &[&m]);
    assert!(r.is_err(), "sending to an unloaded program id must fail");
    assert!(env.svm.get_account(&PROGRAM_ID).map(|a| a.executable).unwrap_or(false), "real program is executable");
    assert!(env.svm.get_account(&wrong).is_none(), "wrong program id is absent");
}

// b11 — FAILED-TX ROLLBACK on the MINT path: a later failing instruction reverts the whole mint.
#[test]
fn b11_failed_mint_tx_rolls_back() {
    let mut env = setup(); setup_registry(&mut env);
    let holder = env.payer.insecure_clone();
    let m = Keypair::new();
    let a = ata(&holder.pubkey().into(), &m.pubkey().into());
    // [mint_coin(5), system transfer of u64::MAX (always fails)]
    let bad = Instruction { program_id: SYSTEM_ID, accounts: vec![
        AccountMeta::new(holder.pubkey().into(), true), AccountMeta::new(Address::new_unique(), false),
    ], data: { let mut d = vec![2u8, 0, 0, 0]; d.extend_from_slice(&u64::MAX.to_le_bytes()); d } };
    let r = send(&mut env, &[ix_mint(&holder.pubkey().into(), 5, &m.pubkey().into(), &a), bad], &holder, &[&m]);
    assert!(r.is_err(), "composed tx fails");
    assert_eq!(lamports(&env.svm, &vault_pda(5)), 0, "collateral not locked (rolled back)");
    assert!(env.svm.get_account(&claim_pda(5)).is_none(), "claim not created (rolled back)");
    assert_eq!(token_amount(&env.svm, &a), 0, "no NFT minted (rolled back)");
    let (minted, _r, used, _c) = registry(&env.svm).unwrap();
    assert_eq!(minted, 0, "counter unchanged");
    assert_eq!(used, 0, "serial bitmap unchanged");
}

// b12 — NO ADMIN WITHDRAWAL SURFACE: an unknown instruction selector is rejected.
#[test]
fn b12_no_hidden_admin_instruction() {
    let mut env = setup(); setup_registry(&mut env);
    let holder = env.payer.insecure_clone();
    let bogus = Instruction { program_id: PROGRAM_ID, accounts: vec![
        AccountMeta::new(registry_pda(), false), AccountMeta::new(holder.pubkey().into(), true),
        AccountMeta::new_readonly(SYSTEM_ID, false),
    ], data: vec![9, 9, 9, 9, 9, 9, 9, 9] };
    let r = send(&mut env, &[bogus], &holder, &[]);
    assert!(r.is_err(), "unknown discriminator must be rejected (no admin path)");
    let (minted, redeemed, _u, _c) = registry(&env.svm).unwrap();
    assert_eq!((minted, redeemed), (0, 0), "no state change");
}

// b13 — initialize_registry is one-shot (PDA already exists) and rejects zero collateral.
#[test]
fn b13_registry_single_init_and_nonzero_collateral() {
    let mut env = setup();
    let p = env.payer.insecure_clone();
    // zero collateral rejected
    let rz = send(&mut env, &[ix_init(&p.pubkey().into(), 0)], &p, &[]);
    assert!(rz.is_err(), "collateral must be > 0");
    // valid init
    send(&mut env, &[ix_init(&p.pubkey().into(), COLLATERAL)], &p, &[]).unwrap();
    assert_eq!(registry(&env.svm).unwrap().3, COLLATERAL, "collateral stored == 5 XNT");
    // re-init rejected
    let r2 = send(&mut env, &[ix_init(&p.pubkey().into(), COLLATERAL)], &p, &[]);
    assert!(r2.is_err(), "registry cannot be re-initialized");
}
