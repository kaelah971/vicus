# Vicus Manual E2E Runbook (Wave 2 complete)

Human wallet signatures required everywhere value moves. The agent prepares
and verifies; it never signs. Funded wallets needed: Stellar Testnet USDC
(via friendbot + a funded distributor), Stellar Mainnet USDC + a supported
tokenized asset for same-network send, Solana Mainnet USDC for Jupiter flows,
a Base wallet for Morpho read checks.

## A. Stellar same-network Send — PENDING HUMAN

- SETUP: Freighter on Mainnet funded with USDC; a saved contact with a Stellar endpoint.
- ACTION: `/send` → recipient → amount → Review → **Sign in Freighter**.
- EXPECTED: Horizon confirms; Vicus receipt shows tx + ledger; reload resumes.
- PASS: sender/recipient/asset/amount exact; duplicate submit safe.

## B. Cross-chain Send to @handle — PENDING HUMAN

- SETUP: Stellar Testnet wallet with USDC; recipient with Base/Sepolia endpoint.
- ACTION: `/send?mode=cross-chain` → @handle → Base → amount → Review →
  **burn-sign in Freighter** → wait attestation → Check status.
- EXPECTED: burn tx → attestation → forwarding → delivered; reload recovers.
- PASS: no reburn on refresh; completed receipt immutable; Testnet labeled.

## C. AAPLx Access — PENDING HUMAN

- SETUP: Solana wallet with ≥25 USDC; `/acquire/aaplx-on-solana` shows route.
- ACTION: `/swap/aaplx-on-solana` → amount → Get quote → acknowledge eligibility →
  **sign swap** → Vicus verifies deltas.
- VERIFY BEFORE SIGNING: wallet, ≥25 USDC, fresh quote, mint
  `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`, acknowledgement checked.
- PASS: USDC delta == spend, AAPLx ≥ min, confirmed tx, durable order,
  Position Center shows live AAPLx, reload resumes. Live quote proven
  2026-10-13 (25 USDC → 7.297164 AAPLx, 0% impact).

## D. TSLAx Access — PENDING HUMAN (may share C funds)

- Same flow on `/swap/tslax-on-solana`; mint
  `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`. Minimum proof without a
  second swap: live quote + per-asset routing + no AAPLx contamination
  (quote proven 2026-10-13: 25 USDC → 6.659698 TSLAx, 0% impact).

## E. AAPLx Exit — PENDING HUMAN (+ explicit approval to spend C balance)

- ACTION: `/exit/aaplx-on-solana` → amount → quote → **sign** → verify.
- PASS: exact AAPLx spend, USDC received, receipt reload-safe, Position
  Center updates from chain, Watch shows completed exit + gated Return Home.

## F. AAPLc / Morpho lending — PROVEN READ-ONLY (no signature needed)

- `/circles/aaplc-on-base` Borrow resolves to Morpho market
  `0x26d6…` (verified live 2026-10-13: ~$487 liquidity, 3% utilization).
- Optional human flow in the Morpho app; Position Center re-read proves it.

## G. Campaign E2E — PENDING HUMAN (needs Testnet funding)

- Project: create → copy treasury → send Testnet USDC → submit funding hash →
  server verifies → activate. User: matching proof → claim → payout →
  Horizon verify. PASS: budget math exact, duplicates rejected, receipt durable.

## H. Tokenization Lab — PENDING HUMAN (needs Testnet issuer)

- One issuance: trustline + issuer send + Horizon balance proof; issuer
  secret stays server-only; Testnet labeled everywhere.
