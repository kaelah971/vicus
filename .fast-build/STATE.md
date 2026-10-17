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

## Mobile UI Recovery — Slice 2: P1.1 Premium Asset Cards (2026-10-16)
- Diagnosed sub-450px old-headless screenshot clipping as tooling artifact (proven: identical markup measures exact at 390px via ffmpeg pixel analysis; Playwright mobile emulation shows innerWidth == scrollWidth at 360/375/390/430/1440). Switched verification to Playwright + system Edge (playwright-core devDependency, msedge channel) with DOM metrics per capture.
- Rebuilt AssetTile: ticker + category chip row (Equity/Fund/Stable/Asset), name shown only when ≠ ticker (kills "USDC USDC" duplication), single issuer · network line, compact logo stage (104→64px, logos ≤44px), refined monogram disc, per-variant top accents, data-variant hook.
- Truth fixes in asset-visuals.ts: issuer-first attribution (Backed/Coinbase, no underlying-company issuance claims); TSLAx/BENJI documented ticker fallbacks retained.
- Registry category flows ExploreBrowser → tiles; BENJI monogram + issuer line now reads designed; WisdomTree funds differentiated by ticker + Equity/Fund chips.
- Verification: stellar-home:verify PASS (new P1.1 group 10), tsc clean, lint 0 errors, build green; Playwright screenshots 360/375/390/430/1440 with zero page overflow; ≤400px icon-only menu verified live in DOM.
- Mobile header slice (prior): text-size-adjust, pills end-padding, page-head rhythm, ≤400px compaction — all preserved and re-verified.

## Mobile UI Recovery — Slice 3: First-Visit Interest Onboarding (2026-10-16)
- Dialog on first /discover visit (exact headline + supporting copy): 4 multi-select interest cards mapped ONLY to real registry categories (stocks→equity_fund, stables→stablecoin, funds→treasury_fund, bonds→fixed_income; all verified non-empty), brand/glyph visuals from local files, adaptive CTA (Explore all assets / Explore my interests), Skip, Escape, backdrop-skip, focus heading, safe-area sheet + centered desktop.
- Personalization = ordering boost only (Stellar-first preserved, explicit ?class= wins, search applies catalogue-wide, nothing hidden, Compass untouched, no suitability inference).
- Persistence: device-local localStorage (vicus.onboarded.v1/vicus.interests.v1), sanitized keys, storage-failure tolerant, no flicker (mount-closed), ?asset= deep links never interrupted, visible Interests edit button with count.
- Verification: stellar-home group-11 green; tsc/lint clean; 18/18 Playwright interactions (open/select/adapt/continue/storage/reload/edit/escape/deep-link/skip); viewports 360/375/390/430/1440 with innerWidth == scrollWidth; dialog in-viewport everywhere.

## Mobile UI Recovery — Slice 4: P1.3 Verified Prices & Charts (2026-10-16)
- Model: src/lib/prices/ (types + server sources). Four types kept distinct (token_market/underlying_reference/indicative_quote/issuer_nav); validateEvidence guards UNKNOWN (available needs finite value+currency+source+both timestamps; unavailable carries no value/type).
- Feeds: Jupiter live 25-USDC indicative quotes for AAPLx/TSLAx (USDC-denominated, never market/USD/executable); issuer NAV reference $1 for BENJI (Franklin Templeton) + WTGXX (WisdomTree), reviewed 2026-10-12, never live. No other feeds wired.
- Honest absences: AAPLc/NVDAc venue_gated (Aerodrome reverts); Stellar orderbooks XLM-denominated with no verified XLM→USD conversion (USDC/XLM book live ~5.43, depth only); stables never assumed at $1; no historical series anywhere → charts stay in "never decorative" absence state.
- UX: PriceBlock (client, fetches /api/v1/prices) in preview sheet + circle overview Price section; value+currency, type label, source link, relative updated time, Live/Reference/Unavailable badge. Tiles untouched (P1.1 hierarchy, no mobile crowding). Server cache 60s, 10s timeout, failures → provider_error (stale never re-stamped fresh), no keys in browser.
- Verification: prices:verify green (model/matrix/stub-routing/live-probe/wiring groups; live Jupiter AAPLx ~346-347 USDC consistent with prior 0.073/25 evidence); stellar-home:verify still green; tsc clean; lint 0 errors (3 pre-existing warnings); build green; Playwright+Edge 360/375/390/430/1440 zero overflow, correct quote/NAV/absence states in sheet + circle page.
- Ship: commit cbad145, pushed main, Vercel Ready, alias explorevicus.vercel.app moved; live API verified (AAPLx available ~347.6 USDC live; NVDAc unavailable venue_gated).
- Preserved: pre-existing .gitignore modification + untracked design-reference/ untouched. P1.2 stays open; P6.2 untouched; no trading.

## UI Correction — Curated Baskets Polish (2026-10-16, commit 255c895)
- New scoped `bsk-*` card system for basket pages (detail + index + personal): brand logo stage via new `BrandMark` (reads asset-visuals; owner files flow through automatically), prominent weight pill, issuer · network subline, category chip + state row, Eligibility disclosure (kills ellipsis truncation), routes line, spaced source/open footer. Provenance shows source domain with exact official href (fixes +43/+62px mobile overflow from raw URLs).
- Truth preserved: discovery-only copy, model, weights, eligibility, source hrefs, issuer-first attribution (Backed/Coinbase/Franklin Templeton/WisdomTree text beside company marks). Position Center `pos-hold` styles untouched.
- PART 1 LOGOS — BLOCKED: no owner-supplied Apple/Tesla/NVIDIA files exist anywhere accessible (repo, Desktop, Downloads, /tmp searched). Nothing substituted. Drop-in path ready: add exact files under `public/assets/brands/` + set `localSrc` in `src/lib/asset-visuals.ts` (Tesla entry already shaped for this; stellar-home:verify enforces mapped files exist). Current: Apple official nav mark live, NVIDIA official brand PNG live, Tesla/BENJI honest monogram fallback.
- Verification: baskets:verify green; tsc clean; lint 0 errors; build green; Playwright+Edge 390/1440 on all 4 curated baskets + index, zero overflow; live HTML confirms bsk cards + apple.svg serving.
- Ship: pushed main, Vercel Ready, alias moved, live 200s verified. No milestone changed (P1.2 still open).

## UI Correction — Owner Logo Wiring (2026-10-16, commit e3d0278)
- Owner pack (vicus-owner-logo-assets.zip) extracted 1:1 to public/assets/brands/{apple,tesla,nvidia}-owner.jpeg; zip transport container removed. No substitutes, redraws, or fetched variants.
- Mapping: apple-owner → AAPLx/AAPLc, tesla-owner → TSLAx, nvidia-owner → NVDAc; all light stages (dark-on-white JPEGs sit on intentional white tiles); issuers untouched (Backed/Coinbase). BENJI is now the sole ticker fallback.
- Presentation: object-fit:contain on tile/sheet/basket/onboarding imagery + stage-matching radii; proportions never cropped. BrandMark/AssetTile/AssetSheet/basket cards pick the files up via asset-visuals with no logic changes.
- Verification: stellar-home/baskets/prices verifiers green; tsc clean; lint 0 errors; build green; Playwright+Edge 390/1440 (discover, 3 sheets, apple basket): 0 broken images, 0 overflow; card-level screenshots confirm crisp marks + issuer hierarchy.
- Ship: pushed main, Vercel Ready, alias moved; live serves all three owner files on Discover sheets + basket 200. No milestone changed.

## Mobile UI Recovery — Slice 5: P1.2 Mobile UX + Progressive Disclosure (2026-10-16, commit 32b7397)
- Audit: 24 page captures (Discover/Use/Positions/Baskets/2 baskets/Circle × 360/375/390/430) + short-height 360×600, 768, 1440 — zero page overflow and zero wide elements everywhere via DOM metrics.
- Confirmed defect fixed (1): sheet hero scrolled away on expanded/long sheets, stranding identity + close. Fix is CSS-only — `.v-sheet-hero` sticky with sheet-bg fill (6 insertions). Verified: hero pinned + close reachable after expansion at 360px.
- Non-defects documented: tile-tap no-op and slow router transitions reproduce ONLY on the local dev server (stale HMR session since 10-13); production opens sheets, closes via Escape/X/backdrop/back, and navigates correctly. Next dev overlay "Issue" pill is tooling, not product. Proposed About-disclosure reverted after catalogue data proved all summaries < 220 chars (would have been dead code).
- Interactions green on production: tile-tap open, sheet ~66% viewport fit, action expand, Escape/X/backdrop close, onboarding (4 cards, adaptive CTA, persist, no-repeat), search 16→1, bottom-nav, hamburger menu + Escape, 4 circle tabs, keyboard focus, price + absence states.
- Verification: stellar-home/baskets/prices verifiers green; tsc clean; lint 0 errors (3 pre-existing warnings); build green (stale Turbopack font-cache failure cleared via .next/cache removal — environmental, not code).
- Ship: pushed main, Vercel Ready, alias moved, live 200s. Roadmap v2.18: P1.2 Complete, P1 phase closed (P1.1+P1.2+P1.3 live). 43 IDs intact. No milestone beyond P1 touched; no trading.

## Research Slice — Tokenized-Stock Coverage + Stellar Trading Feasibility (2026-10-16)
- Stellar sweep (Horizon, 8 codes): NO verified stock representation. stellarnasdaq AAPL (586 holders, domain dead, XLM-only book at ~$0.0001, zero USDC trades); indus TSLA (7,557 holders, domain dead, 50.75M-unit dust asks); NVDA/SPY/QQQ clones all empty USD books + dust XLM trades; DSTOQ dead; NVDAC nonexistent. All UNVERIFIED/REJECTED, none listed.
- Existing four: AAPLx/TSLAx QUOTE-AVAILABLE + IMPLEMENTED-UNWITNESSED (fresh Jupiter quote ~344.75 USDC via prices:verify green); AAPLc/NVDAc venue-gated, flag still off. Attribution grep clean — no UI change.
- Stellar DEX: mechanism ready (books/path payments live), market absent; genuine future listing would need auth/eligibility plumbing. No integration proposed.
- Artifact: docs/Tokenized_Stock_Coverage.md (matrix, evidence, rejected routes, next slice = P0.4 witnessed AAPLx settlement, owner-dependent). Trading NOT shipped.
- Ship: docs-only (artifact + STATE + roadmap workstream bullet, 43 IDs intact). No deploy needed. Verify: prices:verify green; diff--check clean.

## P6.2 Drops Anti-Abuse Controls (2026-10-16/17, commit f5405da)
- Reused: proof validation (ownership/status/circle/window), idempotent completion insert, budget reservation + caps, quiz duplicate guard, pending-only review transitions, wallet-bound claims, contested-settlement receipts. No second engine.
- New: migration 0029 `abuse_rate_limits` (applied); `src/lib/abuse/rate-limit.ts` DB-backed quotas keyed on user id (mission-submit 20/hr, campaign/reward-claim 30/hr; 429 pre-side-effect, retry-safe); cross-campaign proof-reuse guard (`proof-reused` 409, same-campaign resume preserved); review-queue shared-evidence flag (advisory count, reviewer decides — doc links legitimately shared).
- Gap reported, not invented: NO review SLA exists anywhere (no policy found) — queue + decision records + authz are the workflow; SLA needs an owner decision.
- Verification: NEW `abuse:verify` green (limiter unit, 3-path enforcement, counting exhaustion, legit/idempotent/reuse, forged/wrong/expired, reviewer auth + persistence, duplicate flag, isolation, single settlement); regressions green: drops, campaign-funding 16/16, rewards, missions, auth, receipts; tsc clean; lint 0 errors; build green. Fixed own fallout: removed `server-only` from rate-limit (broke non-shimmed verifiers).
- Ship: pushed main, Vercel Ready, alias moved, live 200s; prod table confirmed present. P6.3/P6.4 remain; P6 NOT complete.

## P6.3 Verified Loyalty Progress (2026-10-17, commit a778874)
- Reused: getUserContributions + live mission.points (no new tables/writes/balances). XP = approved submissions only, one event each; pending/rejected earn nothing; revocation drops XP live (derived read model).
- New: src/lib/loyalty/ (pure rules: Explorer 0/Contributor 100/Advocate 250/Steward 500, UTC-day streaks with yesterday-alive rule, deterministic ordering) + service + LoyaltyCard (level/XP, progressbar, level rail, recent approved, pending note, recognition-only disclaimer, honest zero + error states) on profile/me and profile/demo.
- Verification: NEW loyalty:verify green (13 groups: zero/single/dup-day/consecutive/broken/lapsed/yesterday-alive/UTC-midnight/boundaries/garbage/ordering/table-monotonic/service isolation + revocation + unknown-user); regressions: abuse/drops/campaign-funding/rewards/missions/auth/receipts green; tsc clean; lint 0 errors; build green. Populated card visually QA'd via transient fixture (route + rows removed after).
- Delivery rules (owner-required, permanent): AGENTS.md shipping policy appended (README-per-feature, real screenshots mobile+desktop, interaction testing, honest states, roadmap/state sync, production proof); README synced to v2.20 (prices/loyalty/abuse/baskets/onboarding/owner logos, 1 fallback, no SLA); 7 production gallery shots + manifest.
- Ship: pushed main, Vercel Ready, alias moved, live (demo loyalty serving). P6.4 remains; P6 NOT complete.

## P6.4 Authorized-Provider Asset Drops (2026-10-17, commit 7e45274)
- Policy: src/lib/drops/providers.ts — fail-closed allowlist (EMPTY: zero connected providers), full evidence validation (expiry/revocation/asset/issuer/network/eligibility/evidence), UNKNOWN never eligible, env/client inputs authorize nothing. Single source: campaign issuer constant imported, not duplicated.
- Gates wired into both settlement entries (XLM prepare + Testnet-USDC prepare) as defense-in-depth; existing flows pass unchanged. Rewards page states the policy in product copy.
- Verification: NEW drop-providers:verify green (approved-fixture pass, 9 rejection reasons exact, env-spoof rejected, copy complete); regressions green: drops, campaign-funding 16/16, abuse, loyalty, rewards, missions, auth, receipts; tsc clean; lint 0 errors; build green; rewards 390/1440 zero overflow.
- No approved provider found (none exists) — documented as the limitation, not a blocker. No migration. No screenshots (one-line copy; gallery 1 day old).
- Ship: pushed main, Vercel Ready, alias moved, live 200s. Roadmap v2.21: P6.4 COMPLETE + P6 PHASE CLOSED (P6.1–P6.4 live). 43 IDs intact.

## P7.1 Evidence-Backed Contribution Reputation (2026-10-17)
- Read model only (no tables/writes/scores): src/lib/reputation/ — verified (approved submissions keyed by submission id; paid completions keyed by id + deduped by proof, earliest wins) vs authored (theses with open/resolved/withdrawn/expired states, active posts/answers; moderated excluded; votes never credit). Loyalty XP untouched.
- ReputationCard (verified + authored sections, circles line, disclaimers, honest empties) on profile/me (private) + public profile + demo (public-safe: no pending/notes/wallets/rewards/balances/contacts). Premium on 390/1440; populated state QA'd via transient fixtures (removed after).
- Verification: NEW reputation:verify green (dedupe, garbage, thesis states, ordering, service fixtures incl. revocation/isolation/public-private/no-leak); regressions: conviction/loyalty/asset-circles/social/community/missions/campaign-funding/abuse green; tsc clean; lint 0 errors; build green. Real finding: Neon clock ~300ms ahead of app clock breaks same-instant campaign windows — verifier backdates windows (product impact nil, documented).
- Delivery: README synced (feature row + v2.22 + limitations), 2 production gallery shots + manifest, roadmap v2.22 + log, P7.2 next. No migration.
- Ship: code c418d9a + P7.1 docs commit (this session), pushed; Vercel Ready; alias verified serving reputation on demo. P7.2/P7.3 remain.
