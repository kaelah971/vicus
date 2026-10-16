# Fast Build State — WAVE 3 (COMPLETE, checkpointing)

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
- [x] Wave 3 Slice 1: Stellar-first Home + Discover — DONE
- [x] 2. Companies / Issuers / Representations + Compare — DONE
- [x] 3. Asset Circles — DONE
- [x] 4. Conviction / Theses — DONE
- [x] 5. Personalized Activity — DONE
- [x] 6. Earn / Use Discovery — DONE
- [x] 6b. /use Asset-First UX Fix — DONE
- [x] 6c. Rewards Nav Fix — DONE
- [x] 6d. Mobile-First UI Simplification — DONE
- [x] 6e. Hero Animation Restore — DONE (prior session, preserved uncommitted)
- [x] 6f. Mobile Visual UX Correction — DONE (this invocation)
- [x] 7. IA + Mobile Polish — DONE

## Completed (Wave 3 Slice 7)
- IA: mobile 5-destination nav (Discover/Use/Circles/Activity/You), desktop adds secondary Missions/Lab/Spaces/Rewards; new read-only /circles directory; profile links Positions/Watch/Activity/Contacts; circle tabs include Conviction; active states correct per page
- Dedupe: circle page people reads merged into the social summary (one membership read); gated states audited deliberate; all internal links resolve (42 routes)
- Responsive/static: no fixed-width/table constructs in Wave-3 surfaces; a11y spot-check clean (labeled controls, pressed states); device render pass still owed (no browser tooling here)
- Verification: wave3-ia:verify PASS; ALL 43 package.json :verify scripts exit 0 in single runs; lint 0 errors; tsc clean; build green; migration 0027 registered + applied; secret/artifact scan clean

## Completed (Wave 3 Slice 6f — Mobile Visual UX Correction)
- Removed all decorative chain dots (EcoChip dot, filter-button dots, mission browser dots); toned chain labels remain, truthful state text kept quietly
- Discover mobile header rebuilt: search + 5 category shortcuts + one Filters disclosure (chains/status/toggles inside); removed count strip, class rail, collections strip, result bar; calm STELLAR / BEYOND STELLAR headings
- /use rebuilt as visual cards: asset medallion header, icon action rows with one-line state + CTA, prose behind Why disclosures, campaigns intact
- CircleCard foot trimmed to Watching/Role-check only; dropped dead useCounts prop + per-circle capability fetch (perf win)
- Defined missing watch-grid/watch-card/watch-row styles; mobile rail/card gaps widened; bottom-nav overlap already covered by existing padding
- Verification: utility-discovery/stellar-home/asset-actions(12)/positions/campaign-funding(16) PASS, tsc clean, lint 0 errors (3 pre-existing), build green, diff-check clean; local render confirms zero dots/counts, grouped /use, all routes 200

## Completed (Wave 3 Slice 6)
- Earn/Use Discovery V1: /use with On Stellar / Beyond Stellar sections + intent chips (Access/Send/Borrow/Earn/Redeem/Exit/Rewards/Other); every opportunity derives from engine actions or live campaigns; execution states labeled LIVE/CONNECTED/OFFICIAL/PERMISSIONED/GATED
- Private holding flags (boolean only) for signed-in owners; no balances/APY/TVL/winners anywhere; circle + discover entry links; no new tables
- Verification: utility-discovery:verify PASS, full targeted set (11 suites) PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 3 Slice 5)
- Personalized Activity V1: /activity with Needs-Attention (expiring own theses, ending-soon + claimable campaigns) + relevance-ranked What Changed (community, theses, campaigns); relevance from watched/held-Stellar/followed/participated/own signals, no event table, deterministic order (relevance/recency/Stellar-parity/id)
- Every item carries its reason label; holdings personalize silently and never surface; no Watch transaction state duplicated
- Incidental finding: app clock runs ~300ms behind DB now() — verifier backdates campaign starts instead of weakening the product window check
- Verification: personalized-activity:verify PASS, asset-circles/conviction/community/social/campaign-funding(16)/positions/watch-center/representations/stellar-home PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 3 Slice 4)
- Conviction V1: additive migration 0027 (theses table, applied); paper theses with claim/timeframe/confidence/evidence; Circle- or subject-bound (exactly one); evidence restricted to active bound-circle posts + registry sources
- Existence-only Stellar position linking (live balance check, nothing numeric persisted); agent labels rejected (shape render-only, no fake agents); author-only resolve-with-note/withdraw; deterministic expiry from closesAt
- UI: circle Conviction section + /conviction list/publish + /conviction/[id] detail + subject conviction block + profile open/total counts (no accuracy scoring)
- Verification: conviction:verify PASS, asset-circles/community/social/representations/positions/agent-api/stellar-home PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 3 Slice 3)
- Circle-social read model (lib/circles-social): following/contributors/verified/watching groups + per-author signals (questions/insights/sources/answers/helpful/approved) + verified participants (mission/campaign/role, handles only)
- Circle page People section grouped with distinction copy; verified-participant tiles; contributor signal lines; community/campaigns/missions/lifecycle already native
- Public profile already showed Watching/Contributions/Verified with no-wallet copy — asserted, not duplicated
- Verification: asset-circles:verify PASS, community/social/contacts/campaign-funding(16)/stellar-home/representations/asset-actions(12)/positions PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 3 Slice 2)
- Subject layer as config (no migration): apple (AAPLx+AAPLc, no fake Stellar leg), franklin-templeton (BENJI), wisdomtree (5 funds); membership resolves live from registry
- Routes /subjects/[slug], /issuers/[slug] (redirect into subjects), /compare (stacked rows, any two slugs; AAPLx-vs-AAPLc + BENJI-vs-WTGXX entry links)
- Every representation field + compare row derived from registry/lifecycle/engine; unknown identifiers marked, never fabricated; no scores/prices/winners
- Circle pages link View company/issuer where applicable
- Verification: representations:verify PASS, stellar-home/stellar-assets/classification/lifecycle/asset-actions(12)/external-assets/broader-access/lending PASS, tsc clean, lint 0 errors, diff--check clean

## Completed (Wave 3 Slice 1)
- Discover restructured: Stellar home layer first (featured + rail), Beyond Stellar below (compact rail); chain stays an optional filter, never required
- Thematic collections (funds/fixed-income/equities/stable/can-use-now/active-campaigns) from taxonomy + engine + campaign truth; empty collections omitted
- Cards: registry issuer + top engine actions on home layer; landing copy Stellar-first; circle detail already lifecycle+engine+campaign complete
- Verification: stellar-home:verify PASS, stellar-assets/classification/lifecycle/asset-actions(12)/external-assets/campaign-funding(16) PASS, tsc clean, lint 0 errors, diff--check clean
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

## Mobile UI Recovery — Slice 1: Mobile header + navigation (2026-10-16)
- GitHub About fixed to canonical positioning; website set to https://explorevicus.vercel.app; topics preserved; no stale vicus-topaz links in tracked docs.
- Diagnosed sub-450px screenshot clipping as old-headless-Edge viewport flooring (proven: breakpoints only at 340/480/…, identical markup fits at 460+; committed Oct-13 production frame shows the same tooling pattern). No grid/layout defect in app CSS.
- Shipped (CSS only, globals.css + vicus-system.css): text-size-adjust 100% (Telegram/in-app webview inflation), x-pills scroll end-padding + scroll-padding, v-page-head mobile rhythm tightening (≤760px), ≤400px icon-only menu trigger (accessible label kept) + header compaction.
- Preserved: Personal/Projects menu grouping, spoke sheet (dvh, safe-area, focus/Escape), bottom nav (env safe-area + 96px clearance), disconnected wallet states.
- Verification: build green; screenshots at 460/500/760 clean; ≤430px captures limited by headless flooring (noted, not a product signal).
- Next slices: P1.1 official logos/cards; first-visit onboarding; P1.3 trusted prices/charts; tokenized-stock coverage review; remaining responsive QA.
