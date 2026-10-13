# Fast Build State — SECOND WAVE (COMPLETE, uncommitted)

## Product
- Name: Vicus (Stellar-first tokenized-asset utility)
- Baseline: main @ 568263b (capstone 6/6 checkpointed)

## Wave 2 Slice 1: Project-Funded Activation Campaigns — DONE
- EXIT proof kind added (CAMPAIGN_TARGET_ACTIONS + validateProof + listEligibleProofs)
- Swap proof binding tightened to actionKind='swap' (exit receipts can no longer masquerade)
- Campaign window enforced both ends (endsAt now rejects late proofs, all kinds)
- Studio exposes Exit option; claim/reserve/payout path already kind-generic
- ONCHAIN_ACTIVATION needs no new kind (approved onchain submissions claim via mission kind)
- Verification: campaign-funding:verify 16/16 green (new exit + masquerade + window groups)

## Targeted regression (this slice)
- campaign-funding (16), reward, activation, send (10), external-utility (16),
  exit, asset-actions (12), org, spaces, mission — all PASS
- tsc clean, lint 0 errors (3 pre-existing warnings), diff--check clean

## Planned next slices
- [x] 2. Position Center — DONE (Wave 2 Slice 2)
- [x] 3. Lending/Collateral Discovery + Adapter — DONE
- [x] 4. Return-to-Stellar — GATED with documented Circle-docs evidence
- [x] 5. Broader Executable Access — DONE
- [x] 6. Manual E2E / Production Readiness — DONE (readiness docs, live read-only evidence, full 36-verifier regression green; wallet-signature flows PENDING HUMAN)

## Completed (Wave 2 Slice 5)
- Research: TSLAx live Jupiter quote re-verified (25 USDC → 0.066 TSLAx, 0% impact); NVDAc Aerodrome V2 volatile+stable quotes both revert (gated, no repeat of AAPLc mistake); Stellar access stays issuer-official (existing capability data, no Vicus-execution claims)
- Generalized Jupiter adapter to config-driven SWAP_TARGETS registry (AAPLx+TSLAx); order rows pin target mint server-side; refresh/prepare/confirm resolve target from row with fail-closed tamper/kind checks; exit stays AAPLx-only
- Routes: solana-usdc-to-tslax executable (+stellar gated); base-usdc-to-nvdac gated with reason; engine ACCESS/SWAP registry-driven; /acquire + /swap slug-driven; SwapRunner per-asset; agent-api labels per-asset
- Verification: broader-access:verify PASS, generalized-access/external-utility(16)/external-assets/asset-actions(12)/positions/lifecycle/lending/exit/return-stellar PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 2 Slice 3)
- Research: Stellar (permissioned funds incompatible with permissionless lending, no exact market), Solana (Kamino API probed, no enumerable xStock reserve evidence), Base/Morpho GraphQL (WINNER)
- Winner: AAPLc collateral → USDC borrows on Base Morpho Blue market 0x26d6… (LLTV 62.5%, live liquidity, Morpho deployment verified onchain via owner())
- Adapter: lib/lending (pinned config + live market/position reads, CONNECTED mode, no execution); engine BORROW on aaplc-on-base only; Position Center lendingPosition from protocol state (health only when reported)
- Verification: lending:verify PASS, positions/asset-actions(12)/external-assets/external-utility(16)/lifecycle/generalized-access/campaign-funding(16) PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 2 Slice 2)
- Position Center V1: /positions with Stellar (session wallet → Horizon → DB code+issuer registry), Solana (connected wallet → known mints), Base (connected wallet → balanceOf); read-only, no persistence, no prices/P&L/risk; engine parity on all cards; profile Positions link
- Verification: positions:verify PASS, asset-actions/stellar-assets/external-assets/external-utility/generalized-access/watch-center/auth all PASS, tsc clean, lint 0 errors, diff--check clean

## Working tree
- Wave 2 Slice 6 (this invocation): docs/production-readiness.md, docs/manual-e2e.md, docs/demo-proof-manifest.md, acquire-page NVDAc-404 fix, gated-history fix in AccessRoutesRunner
- Full Wave 2 regression: all 36 package.json verifiers PASS in single runs, lint/tsc/build/diff-check green, safety scan clean
- Live evidence 2026-10-13: AAPLx + TSLAx Jupiter quotes at 0 impact; Morpho AAPLc market live; NVDAc Aerodrome reverts
- Wallet-signature E2Es (A–E, G–H) PENDING HUMAN; Morpho read-only flow PROVEN; nothing committed/pushed/deployed
