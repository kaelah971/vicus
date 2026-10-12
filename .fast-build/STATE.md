# Fast Build State

## Product
- Name: Vicus (Stellar-first tokenized-asset utility)
- Outcome: Pre-deploy capstone — 6 bounded V1s, then checkpoint→deploy
- Primary demo path: discover AAPLx → fund/swap → exit → watch

## Existing capabilities
- USDC→AAPLx Jupiter swap: working (service + API + SwapRunner + verifier)
- Stellar-USDC access router (AAPLc): working, execution gated (no Mainnet liquidity/CCTP)
- Asset Action Engine + adapters: working (send/move/access/swap)
- Contacts/send, CCTP Access, campaigns, spaces: pre-existing, preserved

## Remaining MVP gaps (capstone slices)
- [x] Slice 1: Exit Router V1 (AAPLx→Solana USDC)
- [x] Slice 2: Generalized Access V1 (Solana USDC→AAPLx as explicit route)
- [x] Slice 3: External Asset Expansion V1 (TSLAx Solana + NVDAc Base; ETH/BNB skipped)
- [x] Slice 4: Agent API V1 (read-only wrapper + skill doc)
- [x] Slice 5: Cross-chain Send to @handle V1 (Base+Ethereum testnet via CCTP; Solana gated)
- [x] Slice 6: Watch Center V1 (/watch read screen) + FULL REGRESSION
- [ ] Slice 6: Watch Center V1 (/watch read screen)

## Current slice
- CAPSTONE 6/6 COMPLETE (this invocation)

## Completed (Slice 6)
- Watch Center V1: /watch (WATCHING/ACTIVE/NEEDS ATTENTION/COMPLETED) over watches + swaps + exits + access orders + CCTP + sends; read-only aggregator src/lib/watch-center/service.ts, no migration, no balances/P&L/risk; profile Watch Center entry link
- Verification: watch-center:verify PASS; full regression: all verifiers green except db:verify (legacy fresh-seed count check vs lived-in dev DB — counts-only mismatch, all config checks true) and one transient reward:verify race (green on 2 bounded retries); lint 0 errors, tsc clean, build green (/watch live), diff--check clean; safety scan clean

## Completed (Slice 5)
- Cross-chain Send V1: Stellar-testnet USDC → CCTP → recipient Base/Ethereum endpoint; wrapper over createAccessTransfer + resolveRecipient + refreshAccessTransfer; no migration (handle reverse-lookup), no new bridge
- Supported: base + ethereum (Access-executable); solana → destination-coming-soon; all UI labeled Testnet; sender wallet from session, destination server-resolved (no client address field)
- Duplicate-safe (intent reuse), reload resume, completed immutable; /send?mode=cross-chain with human-first UX; same-network Send + engine untouched
- Verification: crosschain-send:verify PASS, access/send/contacts/asset-actions/agent-api all PASS, tsc clean, lint 0 errors (3 pre-existing warnings), diff--check clean

## Completed (Slice 4)
- Agent API V1: GET /api/v1/assets (+filters), GET /api/v1/assets/:slug (+lifecycle), GET /api/v1/assets/:slug/actions (engine truth), POST /api/v1/quote (access+exit, server-owned, stateless), GET /api/v1/orders/:id (owner-scoped envelope); no prepare/signing endpoint
- Skill: skills/vicus/SKILL.md with signature boundary + examples
- Verification: agent-api:verify PASS, asset-actions/generalized-access/external-utility/exit/external-assets all PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Slice 3)
- Added tslax-on-solana (Backed xStock; mint XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB; Jupiter-verified + live 25-USDC quote) and nvdac-on-base (Coinbase B20; 0xb20000000000000000000078ee7ce2fE4908108C; base.org-mapped + onchain symbol/decimals read)
- Official/guide actions only (access+redeem); lifecycle access/hold/use/exit (no earn); idempotent seed; classification lists updated 15→17
- Skipped ETH (BUIDL recall failed onchain validation — odd-length address, securitize page blocked) and BNB (no source-backed candidate)
- Verification: external-assets:verify PASS, classification PASS, asset-actions PASS (12), lifecycle PASS, generalized-access PASS, external-utility PASS (16), exit PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Slice 2)
- AccessRoute model (sourceNetwork/sourceAsset/targetNetwork/targetAsset/adapter): solana-USDC→AAPLx executable via jupiter-swap; stellar-USDC→AAPLx + stellar-USDC→AAPLc truthfully gated
- Engine: AAPLx ACCESS (available → /acquire/aaplx-on-solana); canonical order now access/swap/exit; AAPLc still gated
- /acquire/aaplx-on-solana: Fund-with cards (Solana Available w/ live wallet balance, Stellar gated w/ reason) + recent executions; execution reuses /swap adapter
- Funding gate: checkOrderFunding (server-resolved wallet) + POST orders/[id]/funding; client balance via live RPC; no migration
- During slice: restored accidental overwrite of tracked CCTP access-runner.tsx (verified clean); updated external-utility group-15 assertion to access-first ordering
- Verification: generalized-access:verify PASS, external-utility:verify PASS (16), exit:verify PASS, asset-actions:verify PASS (12), tsc clean, lint 0 errors, diff--check clean

## Completed (Slice 1)
- AAPLx→Jupiter→Solana USDC reverse route; reuses external_utility_orders (actionKind=exit, no migration)
- Files: lib/external-utility/{config,service} (+exitAdapter, create/refresh/prepare/confirm), lib/asset-actions/{config (+exit kind),service (+adapter)}, app/api/external-utility/exit/** (5 routes), app/exit/[slug], components/exit-runner.tsx, scripts/verify-exit.ts, package.json (exit:verify)
- Verification: exit:verify PASS, external-utility:verify PASS, asset-actions:verify PASS, tsc clean, lint 0 errors, diff--check clean

## Blockers
- None for Slice 1. Slice 5 depends on Access CCTP testnet boundary (expect TESTNET-only label).

## Verification
- Slice 1: npm run exit:verify / external-utility:verify / asset-actions:verify + tsc + lint (all green)

## Next action
- CHECKPOINT THE FULL CAPSTONE (manual E2Es, env review, deploy)
