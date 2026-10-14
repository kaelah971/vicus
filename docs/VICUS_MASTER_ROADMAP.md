# VICUS MASTER ROADMAP V2 — Canonical Product & Engineering Roadmap

**Status:** Canonical / Active
**Version:** v2.2 (P2.1 shipped; structure, milestones and acceptance criteria unchanged from v2.0)
**Date:** 2026-10-14
**Branch:** `main`
**Scope:** Documentation only — no feature code changed in this session.
**Positioning:** Where tokenized assets become usable.
**Vision:** Discover. Understand. Use. Earn. Belong.
**Identity:** Stellar-first operating layer for tokenized assets.

> This is the single authoritative roadmap. Slice docs, PRD drafts, brand docs, and ad-hoc notes are historical inputs, not execution authority. When in conflict, this document wins.
>
> Product-truth rule: never present code presence as production readiness. Every claim below separates **shipped / implemented-awaiting-E2E / connected-external / testnet-verified / permissioned-or-gated / partial / not-started / blocked**.

---

## Table of contents

- [A. Executive product vision](#a-executive-product-vision)
- [B. Product principles and differentiation](#b-product-principles-and-differentiation)
- [C. Current implementation inventory](#c-current-implementation-inventory)
- [D. Unified P0–P11 phase roadmap](#d-unified-p0p11-phase-roadmap)
- [E. Milestones and acceptance criteria index](#e-milestones-and-acceptance-criteria-index)
- [F. Dependencies and execution order](#f-dependencies-and-execution-order)
- [G. Three planned product releases](#g-three-planned-product-releases)
- [H. Risks, blockers and external requirements](#h-risks-blockers-and-external-requirements)
- [I. Verification and proof standards](#i-verification-and-proof-standards)
- [J. Current active milestone](#j-current-active-milestone)
- [K. Status and update conventions](#k-status-and-update-conventions)
- [Appendix 1 — Key reused modules](#appendix-1--key-reused-modules)
- [Appendix 2 — Historical Testnet proof](#appendix-2--historical-testnet-proof)
- [Appendix 3 — Source map](#appendix-3--source-map)

---

## A. Executive product vision

Vicus solves one concrete failure: a tokenized asset can be technically real and practically unusable.

The same company (e.g. Apple) appears as different products on different chains, from different issuers, with different eligibility rules. Wallets move value but do not explain. Dashboards display tokens but do not act. Communities live elsewhere.

Vicus puts four things in one experience:

1. **Discover** — one catalogue of what exists, Stellar first.
2. **Understand** — what each representation is, who issues it, what it entitles, what restricts it.
3. **Use** — route each capability to its real execution path or official flow. Gated stays gated. Empty stays empty.
4. **Belong / Earn** — participate around the asset (missions, campaigns, circles, conviction) with verifiable settlement where funded.

Stellar is home: identity (Freighter signed-message sessions), verification (Horizon role checks), settlement (Testnet XLM rewards with durable receipts), Send, and Tokenization Lab. Connected ecosystems (Solana, Base, Ethereum) extend discovery and utility through external providers — execution happens in the user's wallet, Vicus routes and verifies.

Vicus does not invent prices, balances, quotes, liquidity, transactions, ownership, issuer authorization, participation, returns, or funded balances.

### What "usable" means in V2

| Journey step | V2 meaning |
|---|---|
| Discover | Visual catalogue, Stellar home layer above connected ecosystems, real issuer marks |
| Understand | Issuer / network / asset class / lifecycle / eligibility, representation comparison (e.g. `/subjects/apple`) |
| Access | Real routes only: verified Stellar execution, wallet-signed external routes, honest gating |
| Hold | Connected holdings re-read from chain, not cached claims |
| Use | Send / Earn / Borrow / Redeem routed per asset capability |
| Send | Native Stellar Send + CCTP cross-chain where actually available |
| Earn | Funded missions/campaigns/drops with idempotent claims and budget math |
| Exit | Real exit routes with verification, plus honest Return-to-Stellar boundaries |
| Belong | Circles, conviction, spaces with real signals and truthful empty states |

---

## B. Product principles and differentiation

### Principles (binding)

1. **Repository truth first.** Start from `git status`, migrations, services, verifiers, and E2E evidence — not from prose.
2. **No fabricated finance.** No invented prices, charts, balances, holdings, quotes, liquidity, transactions, receipts, ownership, authorization, participation, returns, or funded balances.
3. **Explicit state labels.** Every financial surface states one of: Testnet / Mainnet / connected-external / permissioned / gated / historical-proof.
4. **Wallet signs, agent prepares.** Vicus never signs for the user. Human wallet signatures are required everywhere value moves.
5. **Server derives, browser requests.** Amounts, assets, networks, destinations, points, and review outcomes are server-derived. Browser payloads cannot choose them.
6. **One domain, one name.** Do not duplicate domain logic under different product names. Compass extends the Action Engine. Drops extends campaigns/reward claims. Portfolio extends Position Center. Routes extends routers/CCTP. Studio extends Spaces/Host. Proof unifies receipts.
7. **Thin vertical slices.** One bounded user-visible path per milestone. Reuse existing modules. No speculative refactors.
8. **Proof over presence.** Code existing ≠ shipped ≠ verified ≠ production-enabled. Verifiers + targeted E2E gates decide.
9. **Fail closed.** Unknown liquidity, missing quotes, inactive destinations, and unfunded distributors produce honest gated/empty states, not optimistic UI.
10. **Mainnet money stays gated.** No Mainnet financial feature is enabled by writing this document. Flags and allowlists remain off by default.

### Differentiation

| Others do | Vicus does |
|---|---|
| List tokens | Explain representations: issuer, network, contract, eligibility, restrictions |
| Show a price | Show only real feeds where they exist; otherwise disclose absence |
| Generic "Buy" button | Per-asset Action Engine with available / gated explanations and source-backed alternatives |
| Claim community | Evidence-backed participation, verified-holding roles, truthful empty states |
| Points without settlement | Funded campaigns with budget math, idempotent claims, durable receipts, explorer links |
| Cross-chain promises | Route discovery with honest availability, real quotes/fees, signing, tracking, recovery |

---

## C. Current implementation inventory

Audited from working tree on `main` at v2 creation. Preserves pre-existing working-tree state (CRLF `.gitignore` modification + untracked `design-reference/` — both untouched by this document).

Status legend: **Shipped** = live in product with evidence · **Implemented** = code + verifier, awaiting real E2E · **Connected** = external provider route, wallet-signed · **Testnet-verified** = proven on Testnet · **Gated** = intentionally non-executable with honest UX · **Partial** = incomplete · **Not started** = roadmap only · **Blocked** = needs external/legal/funding/human action.

### C.1 Foundation capabilities

| Capability | Status | Evidence | Remaining gaps | Reuse in V2 |
|---|---|---|---|---|
| Stellar Asset Universe (discover, home-layer ordering, issuer marks) | **Shipped** | Production `/discover`, README walkthrough, `docs/screenshots/` | Premium logos/cards/mobile polish → P1 | `src/lib/stellar/`, `src/lib/data/`, `src/app/discover/` |
| Discover + representation comparison (`/subjects/apple`, `/compare`) | **Shipped** | AAPLx vs AAPLc comparison, “no verified Stellar representation” disclosure | Price/chart only where real feeds exist → P1 | `src/app/subjects/`, `src/app/compare/`, `src/components/asset-tile.tsx`, `src/components/asset-sheet.tsx` |
| Asset Action Engine (per-asset available/gated actions) | **Shipped (UI + routing) + P2.1 Compass live; execution per-route varies** | `/use`, action sheets, `asset-actions:verify` (13 groups incl. P2.1 fixtures), eligibility explanations in sheet payloads (live) | Compass alternatives/surface → P2.2/P2.3; swap/lending completion → P3 | `src/lib/asset-actions/` |
| Stellar Send + wallet auth (Freighter, signed-message sessions) | **Implemented, awaiting real E2E** | `send:verify`, `auth:verify`, `/send`, manual E2E §A PENDING HUMAN | Human-signed Mainnet Send + reload/dedupe proof → P0 (transfer-form UI redesigned + live 2026-10-14 via `45cca5c`; money E2E still pending) | `src/lib/send/`, `src/lib/auth/`, `src/components/send-runner.tsx`, `src/components/wallet-auth.tsx` |
| Freighter / SEP-53 sessions | **Shipped** | `docs/Vicus_Slice_5A_Auth.md`, `auth:verify` | Browser/wallet matrix E2E → P0 | `src/app/api/auth/` |
| Tokenization Lab (define/trust/issue/verify) | **Implemented, Testnet-only, awaiting real E2E** | `lab:verify`, `/lab`, manual E2E §H PENDING HUMAN | Funded Testnet issuer + one witnessed issuance → P0/P3 | `src/lib/lab/`, `src/components/lab-runner.tsx` |
| Rewards / mission settlement (native XLM) | **Implemented, Testnet-only, funding-gated; one historical Testnet settlement verified** | `reward:verify`, `docs/Vicus_Slice_5B_Rewards.md`, Appendix 2 | Funded distributor + claim E2E → P0; Drops hardening → P6 | `src/lib/rewards/`, `src/lib/missions/`, `src/lib/campaigns/` |
| External AAPLx/TSLAx access (Solana/Jupiter) | **Connected (quote-proven), execution awaiting human signature** | Live quotes 2026-10-13 (25 USDC → 7.297164 AAPLx, 6.659698 TSLAx), `external-assets:verify`, `broader-access:verify` | Human-signed swap + delta verification → P0 | `src/lib/external-utility/`, `src/app/swap/`, `src/components/swap-runner.tsx` |
| Asset Exit Router (AAPLx exit) | **Implemented, awaiting human signature** | `exit:verify`, `/exit`, manual E2E §E PENDING HUMAN | Human-signed exit + receipt → P0 | `src/lib/asset-access/`, `src/components/exit-runner.tsx` |
| CCTP access + cross-chain transfers | **Implemented, restricted (Testnet)** | `crosschain-send:verify`, manual E2E §B PENDING HUMAN, gated Mainnet CCTP | Burn-sign → attestation → delivered E2E → P0; inbound Stellar + Routes → P9 | `src/lib/crosschain-send/`, `src/components/crosschain-send-runner.tsx` |
| Position Center (connected positions) | **Implemented, awaiting chain re-read proof** | `positions:verify`, `/positions`, `src/lib/positions/` | Live holding + exit-update proof → P0/P4 (Center UI redesigned + live 2026-10-14 via `9b02ec9`; unified receipts/states still pending) | `src/lib/positions/`, `src/components/connected-positions.tsx` |
| Watch + Activity (watchlist, personalized activity) | **Shipped / Implemented** | `watch:verify`, `watch-center:verify`, `personalized-activity:verify` | Portfolio-grade history → P4 | `src/lib/watch-center/`, `src/app/watch/` |
| Circles, community, Conviction | **Shipped (social) / Implemented (conviction)** | `social:verify`, `community:verify`, `asset-circles:verify`, `conviction:verify` | Evidence-backed reputation, holding roles → P7 | `src/lib/circles-social/`, `src/lib/conviction/`, `src/lib/community/` |
| Missions + project-funded campaigns | **Implemented, funding-gated** | `mission:verify`, `campaign-funding:verify`, manual E2E §G PENDING HUMAN | Funded Testnet campaign fund+claim E2E → P0; Drops → P6 | `src/lib/missions/`, `src/lib/campaigns/` |
| Spaces, Host, Studio infrastructure | **Implemented** | `spaces:verify`, `orgs:verify`, `/spaces`, `/host`, `/admin` | Issuer onboarding + analytics → P8 | `src/app/spaces/`, `src/app/host/`, `src/app/admin/`, `src/lib/organizations/` |
| Agent API / Skill (`/api/v1/*`) | **Implemented** | `agent-api:verify`, `src/lib/agent-api/`, `src/app/api/v1/{assets,orders,quote}` | Compass/Proof/Campaign/Registry APIs → P11 | `src/lib/agent-api/` |

### C.2 What is proven vs pending (Wave 2 close-out)

Proven live reads (agent-executed, no signature — from `docs/demo-proof-manifest.md`):

- AAPLx quote, Solana Mainnet, 2026-10-13: 25 USDC → 7.297164 AAPLx, 0% impact.
- TSLAx quote, Solana Mainnet, 2026-10-13: 25 USDC → 6.659698 TSLAx, 0% impact.
- Morpho AAPLc market `0x26d6…`, Base, 2026-10-13: ~$487 liquidity, 3% utilization, LLTV 62.5%.
- NVDAc Aerodrome quotes revert on Base Mainnet → honest gating proven.

Pending human-signature flows (all in `docs/manual-e2e.md` §§A–E,G,H):

Stellar Send · cross-chain Send · AAPLx access · TSLAx access · AAPLx exit · campaign fund+claim · Lab issuance.

Historical settlement (NOT current Mainnet enablement):

0.1 native XLM, Stellar Testnet, ledger 5066878, tx `36798e6e184e1c031236d47940dbf6e894447bce260cb918c8c1a2e6985b78fc` — independently verified on Horizon Testnet. See Appendix 2.

### C.3 Config and deploy truth (P0.1-corrected 2026-10-14; values never printed)

Scopes: **(A)** local dev (`.env.local` holds 11 keys incl. `VICUS_APP_URL` — values never inspected) · **(B)** live Vercel preview `explorevicus.vercel.app` (project `vicus`) serving browse + honest gates · **(C)** Neon QA database, historically migrated · **(D)** future financial-production. Blockers below refer to **(D)** unless noted.

(D) blockers (all open): (D) `DATABASE_URL` + migrations `0000→0027` (28 files) not run in (D) · `VICUS_APP_URL=https://…` + `VICUS_HOME_DOMAIN` to verify for (D) · reward-distributor + Lab-issuer keys PRESENT in (A, funding unknown), campaign-secret keys NOT PRESENT in (A) — (D) needs dedicated funded treasury keys + explicit caps · `VICUS_ENABLE_MAINNET_REWARDS` must remain unset · (D) `db:verify` + manual E2E.

Safe by construction: Mainnet CCTP off (code-constant `false`) · AAPLc execution gated · Return-to-Stellar gated · Solana Send destination gated · TSLAx/NVDAc limited to verified routes.

---

## D. Unified P0–P11 phase roadmap

Every phase follows the executable template: Problem · User outcome · Reuse · Complete · Remaining · Milestones · Dependencies · Acceptance · Verification · Blockers/risks · Status.

Milestone IDs are stable. Statuses at v2.2 sync (2026-10-14): `Complete` (P0.1, P2.1), `Planned` (everything else). Two shipped UI slices (Position Center `9b02ec9`, Send form `45cca5c`) and the P2.1 engine slice (`7b8ebb3`) are recorded as evidence; money-movement milestones stay Planned until witnessed E2E.

---

### P0 — PRODUCT RELIABILITY

**Problem:** Core money-moving and auth flows are implemented but await witnessed E2E; production config is unset; truthful states must hold under failure (reload, resubmit, recovery).
**User outcome:** Wallet connect, Stellar Send, rewards, external access/exit, and CCTP either work end-to-end with receipts or say exactly why not — and survive reloads.
**Reuse:** `src/lib/auth/`, `src/lib/send/`, `src/lib/rewards/`, `src/lib/crosschain-send/`, `src/lib/external-utility/`, `src/lib/positions/`, `src/lib/lab/`, `src/lib/campaigns/`, all `scripts/verify-*.ts`, `docs/manual-e2e.md`, `docs/production-readiness.md`.
**Complete:** All services + verifiers listed in §C; historical Testnet reward; live external quotes.
**Remaining:** Human-signed E2E for every §C.2 pending flow; production config; recoverability proof; honest production-state copy.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P0.1 | Existing functionality & E2E gap inventory (read-only, separate Pi session) | Truthful list: working flows / implemented-unverified / config blockers / wallet-browser issues / missing providers-quotes / reusable modules / smallest slice recommendation | Deliverable doc reviewed against repo truth; no code changes | Complete 2026-10-14 (inventory + route-triage delivered; P0.2a evidence kept with P0.2) |
| P0.2 | Wallet/auth + Stellar Send E2E | Freighter connect → challenge → SEP-53 verify → session; Mainnet Send review → sign → Horizon confirm → receipt with tx+ledger; reload resumes; duplicate submit safe | `auth:verify`, `send:verify`, manual E2E §A witnessed + explorer link + durable receipt | Planned — P0.2a triage done 2026-10-14 (suspect routes all 200, `auth:verify` pass, owner checklist issued); human-signed Mainnet Send + receipt still outstanding. Send form UI shipped live via `45cca5c` (visual only, not E2E). |
| P0.3 | Rewards + campaign funding E2E (Testnet) | Funded Testnet distributor; mission approve → claim → payout → Horizon verify; campaign create → fund → activate → claim with exact budget math, duplicates rejected | `reward:verify`, `campaign-funding:verify`, `mission:verify`, manual E2E §§G–H + explorer links | Planned |
| P0.4 | External access/exit + CCTP + recoverability | AAPLx/TSLAx swap with delta checks; AAPLx exit; Testnet CCTP burn → attestation → delivered with no reburn on refresh; completed receipts immutable; Testnet labeled everywhere | `external-utility:verify`, `exit:verify`, `crosschain-send:verify`, `positions:verify`, manual E2E §§B–E | Planned |

**Dependencies:** None (first priority). Needs funded Testnet wallets/distributors + human signers.
**External blockers/risks:** Human-signer availability; Testnet funding (Friendbot/distributor); Solana/Mainnet wallet balances; Jupiter/horizon RPC outages (fail-closed, retryable).
**Status:** In progress (P0.1 complete 2026-10-14; P0.2a triage done — routes healthy, `auth:verify` pass; P0.2–P0.4 planned and owner-blocked; Position Center UI live via `9b02ec9`, Send form UI live via `45cca5c` — both visual only, money E2E still pending).

---

### P1 — PREMIUM ASSET EXPERIENCE

**Problem:** Catalogue works but asset cards, logos, mobile UX, and price/chart presentation are not yet premium or uniformly trustworthy.
**User outcome:** Official locally curated logos, cleaner stock/fund/stablecoin cards, cleaner mobile UX, progressive disclosure, prices/charts only where real feeds exist.
**Reuse:** `src/lib/asset-visuals.ts`, `src/components/asset-tile.tsx`, `asset-sheet.tsx`, `asset-tabs.tsx`, `src/app/discover/`, `public/`, `docs/DESIGN.md`.
**Complete:** Discover catalogue, preview sheets, overview tabs, mobile grid/sheet, README walkthrough frames.
**Remaining:** Logo curation pipeline; card redesign; mobile polish; feed-backed price/chart components with absence states.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P1.1 | Official logo + card system | Locally curated logos for covered assets; stock/fund/stablecoin card variants; no hotlinked/unlicensed marks | Visual review on `/discover` desktop+mobile; asset-coverage checklist | Planned |
| P1.2 | Mobile UX + progressive disclosure pass | No clipping on target viewports; disclosures collapse long prose; action grids intact at ⅔-viewport sheets | Device-viewport checklist + screenshots | Planned |
| P1.3 | Trustworthy price/chart presentation | Prices/charts render only with real feeds + timestamps + source labels; otherwise explicit “no verified feed” state; no fabricated series | Feed-absence matrix test (covered vs uncovered assets) | Planned |

**Dependencies:** None blocking; coordinate with P0 so UX changes do not mask reliability states.
**Blockers/risks:** Logo licensing; feed availability/cost; scope creep into invented data (forbidden).
**Status:** Planned.

---

### P2 — VICUS COMPASS

**Problem:** The Action Engine lists what is available/gated per asset but does not personalize to the user's eligibility context or next step.
**User outcome:** Personalized asset actions using the existing Action Engine: eligibility context, available/gated explanations, source-backed alternatives, actionable next steps.
**Reuse:** `src/lib/asset-actions/` (extends, does not fork), `src/lib/stellar/verify-role.ts`, `src/lib/utility-discovery/`, `src/app/use/`, `src/app/api/v1/quote`.
**Complete:** Per-asset available/gated routing, `/use` action-first surface, eligibility notices.
**Remaining:** Eligibility-aware ranking, explanation copy, alternative suggestions, next-step deep links.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P2.1 | Eligibility-context model | Compass consumes wallet session + role checks + asset capabilities to annotate each action (why available/gated) | `asset-actions:verify` + new targeted gate; matrix test across 3+ assets | Complete 2026-10-14 (`7b8ebb3`): `src/lib/asset-actions/eligibility.ts` (pure AVAILABLE/UNAVAILABLE/UNKNOWN model + role/session rules); wired into Discover + `/use` sheet payloads (`eligibilityState`/`eligibilityExplanation`); sheet detail renders the explanation with legacy fallback; `asset-actions:verify` 13/13 incl. USDC/BENJI/AAPLx signed-out/signed-in/role fixtures; tsc/lint/build green; desktop+mobile screenshots; live payload verified (40 explanation fields on production `/use`). No engine fork; signed-out flow preserved. |
| P2.2 | Alternatives + next steps | Gated actions show source-backed alternatives and one concrete next step (e.g. trustline, endpoint, eligibility doc) | Copy/source audit; no invented alternatives | Planned |
| P2.3 | Compass surface in `/use` | Personalized ordering with stable fallback for signed-out users; no balance/ownership claims from signed-message auth alone | E2E: signed-in vs signed-out parity check | Planned |

**Dependencies:** P0 auth/role reliability; Action Engine as-is (extended, not forked — `eligibility.ts` annotates `resolveAssetActions` output). P2.1 complete; P2.2/P2.3 planned.
**Blockers/risks:** Over-inference from role checks (must not claim ownership from auth alone); privacy (no balances to browser).
**Status:** Planned.

---

### P3 — STELLAR-NATIVE UTILITY

**Problem:** Send/Lab/reward workflows exist but are not all witnessed E2E; Stellar swap/lending/yield integrations are unverified; permissioned-asset boundaries need enforcement.
**User outcome:** Complete existing Send/Lab/reward workflows; investigate only verified Stellar swap/lending/yield integrations; permissioned assets stay permissioned.
**Reuse:** `src/lib/send/`, `src/lib/lab/`, `src/lib/rewards/`, `src/lib/lending/`, `src/lib/stellar/`, per-asset allowlists.
**Complete:** Services + verifiers (`send`, `lab`, `lending`, `utility`, `activation`); Testnet-only Lab by construction.
**Remaining:** Witnessed E2E; integration verification (quotes, venues, minimums); allowlist enforcement tests; issuer-boundary copy.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P3.1 | Send/Lab/reward completion | All three witnessed E2E with receipts (links P0.2–P0.3, records completion here for Stellar-utility scope) | Manual E2E §§A,G,H receipts | Planned |
| P3.2 | Stellar swap/yield investigation | Written verdict per candidate venue: routable or not, with quote evidence or honest negative | Quote-evidence log; no unverified venue shipped | Planned |
| P3.3 | Permissioned-asset boundaries | BENJI-class assets require issuer-authorized recipients; unauthorized attempts fail closed with clear copy | Allowlist negative tests | Planned |
| P3.4 | Utility discovery surface | `/use` Earn/Borrow/Redeem reflect verified availability only | `utility-discovery:verify` + surface audit | Planned |

**Dependencies:** P0 reliability; verified Stellar execution pathways.
**Blockers/risks:** Venue liquidity; issuer cooperation for permissioned assets; Testnet/Mainnet confusion (must label).
**Status:** Planned.

---

### P4 — VICUS PORTFOLIO + PROOF

**Problem:** Holdings, action history, and receipts are scattered across Position Center, Watch/Activity, and per-flow receipts without one durable truth.
**User outcome:** Real connected holdings, verified action history, durable receipts, explorer evidence, consistent transaction states, wallet-ownership rules.
**Reuse:** `src/lib/positions/` (extends into Portfolio), `src/lib/watch-center/`, `src/lib/activity/`, reward/campaign receipt models, `src/app/positions/`, `src/app/activity/`.
**Complete:** Position Center chain reads; Watch/Activity surfaces; durable reward/campaign receipts.
**Remaining:** Unified holding truth (chain re-read, not cache); unified receipt model; state machine consistency; ownership rules.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P4.1 | Connected-holdings truth | Holdings re-read from chain on view; stale/cache clearly labeled; no fabricated balances | `positions:verify` + live re-read demo (e.g. post-exit update) | Planned |
| P4.2 | Unified receipt model | Every financial action yields a durable receipt: state, tx hash, ledger, network, explorer link, recovery metadata | Receipt-schema audit across send/reward/campaign/exit/crosschain | Planned |
| P4.3 | Action history + states | Consistent pending/submitted/confirmed/failed states; reload-safe; completed immutable | State-transition tests + reload tests | Planned |
| P4.4 | Wallet-ownership rules | Signed-message auth ≠ ownership; ownership only from chain reads on linked wallets; pasted addresses never create roles | `role:verify` + negative tests | Planned |

**Dependencies:** P0 receipts; P3 execution pathways. Establishes shared truth for P6/P9/P10.
**Blockers/risks:** RPC latency/staleness; multisig nuances; over-caching temptation.
**Status:** Planned.

---

### P5 — VICUS BASKETS V1 (discovery only)

**Problem:** Users cannot save, compare, or follow multi-asset themes (e.g. “Apple representations” or “Stellar money-market funds”) without implying trading.
**User outcome:** Curated themes; create/save/watch baskets; asset weights; issuer/representation context; compositional transparency. **No trading or token issuance in V1.**
**Reuse:** Subjects/compare (`src/app/subjects/`, `src/app/compare/`), Watch (`src/lib/watch-center/`), asset metadata.
**Complete:** Comparison UX precedent; watch primitives; subject pages.
**Remaining:** Basket data model; curation tooling; weight/transparency UI; watch integration.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P5.1 | Basket model + curated themes | Basket = named set with weights, rationale, issuer/representation links; 3+ seeded curated themes | Schema review + seeded list | Planned |
| P5.2 | Create/save/watch baskets | Signed-in users create/save/watch; signed-out browse; no execution affordances in V1 | E2E create→save→watch; negative test: no trade path | Planned |
| P5.3 | Compositional transparency | Every basket shows weights, venue/eligibility notes, “discovery only — not investable” label | Copy audit; legal-safe language | Planned |

**Dependencies:** None for discovery; execution explicitly deferred to P10/P11.
**Blockers/risks:** Implied-advice risk → V1 must never suggest returns or investability. Basket tokens do not exist (see P11).
**Status:** Planned.

---

### P6 — VICUS DROPS

**Problem:** Campaigns/missions can fund and settle, but participation rewards lack anti-abuse, idempotency, budget, and loyalty guarantees at product scale.
**User outcome:** Verified participation rewards, funded campaigns, loyalty progress, anti-abuse, idempotent claims, budget limits, permitted tokenized-asset drops through authorized providers only.
**Reuse:** `src/lib/campaigns/`, `src/lib/rewards/`, `src/lib/missions/`, P4 proof receipts (extends, does not duplicate).
**Complete:** Mission review, campaign funding service, XLM settlement path, durable claims.
**Remaining:** Idempotency hardening; budget caps; anti-abuse (Sybil/duplicate); loyalty model; authorized-provider drops.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P6.1 | Idempotent claims + budget limits | Concurrent/double claims yield one settlement; caps enforced server-side; failed states durable | `campaign-funding:verify` + `reward:verify` + concurrency tests | Planned |
| P6.2 | Anti-abuse controls | Rate limits, eligibility proofs, duplicate-evidence rejection; admin review queue SLA | Abuse-matrix tests | Planned |
| P6.3 | Loyalty progress | Participation streaks/levels derived from verified actions only; no invented participation | Rules audit | Planned |
| P6.4 | Authorized-provider asset drops | Tokenized-asset drops only via authorized providers with issuer approval evidence; otherwise XLM-only | Provider-allowlist test; no permissionless stock-drop path | Planned |

**Dependencies:** P4 proof + real funded campaign controls. Cannot precede honest receipt truth.
**Blockers/risks:** Treasury funding; Sybil attacks; issuer authorization for non-XLM drops; legal review for rewards-as-incentives.
**Status:** Planned.

---

### P7 — CIRCLES + CONVICTION

**Problem:** Social surfaces exist but reputation, discovery quality, and holding-gated roles are not yet evidence-backed or privacy-safe.
**User outcome:** Evidence-backed participation, genuine social discovery, contribution reputation, privacy-safe verified-holding roles, relevant community actions.
**Reuse:** `src/lib/circles-social/`, `src/lib/conviction/`, `src/lib/community/`, `src/lib/social/`, role verifications.
**Complete:** Circles, posts, theses, follows, conviction service, watch signals, empty states.
**Remaining:** Reputation scoring from verified actions; holding-role gating without balance leaks; discovery ranking; moderation.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P7.1 | Contribution reputation | Reputation derived from approved missions, theses, verified participation — never counts invented | `conviction:verify` + rules audit | Planned |
| P7.2 | Privacy-safe holding roles | Verified-holder roles gate channels without exposing balances; pasted addresses never grant roles | `role:verify` + privacy audit (no balances to browser) | Planned |
| P7.3 | Social discovery + community actions | Relevant circles/people/theses surface per asset; per-asset community actions link to real flows | `asset-circles:verify`, `social:verify`, `community:verify` | Planned |

**Dependencies:** P4 ownership rules; P2 eligibility context (shared signals).
**Blockers/risks:** Gaming reputation; privacy regressions; moderation load.
**Status:** Planned.

---

### P8 — VICUS STUDIO

**Problem:** Issuer/project onboarding, asset registration, campaign funding, and analytics run through ad-hoc admin/Spaces tooling without a coherent studio.
**User outcome:** Issuer/project onboarding, source-backed asset registration, project-funded campaigns, mission management, funding verification, analytics and distribution evidence.
**Reuse:** `src/app/spaces/`, `src/app/host/`, `src/app/admin/`, `src/app/organizations/`, `src/lib/organizations/`, `src/lib/campaigns/`, `src/components/campaign-studio.tsx`.
**Complete:** Spaces/Host pages, org studio forms, campaign studio, admin review queue, mission lifecycle.
**Remaining:** Onboarding flow; registration validation (sources required); funding-hash verification UX; analytics surfaces.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P8.1 | Issuer/project onboarding | Staged onboarding: identity → asset docs → eligibility → review; incomplete stays draft | E2E draft→submit→approve | Planned |
| P8.2 | Source-backed asset registration | Every registered asset requires sources (issuer docs, contracts, Horizon records); unsourced rejected | Registration-validation tests | Planned |
| P8.3 | Project-funded campaign management | Create → treasury copy → fund → hash verify → activate → payouts with budget dashboard | `campaign-funding:verify` + manual E2E §G | Planned |
| P8.4 | Analytics + distribution evidence | Views, completions, payouts, distribution proofs per campaign; no invented metrics | Metrics-audit (every number traceable) | Planned |

**Dependencies:** P6 campaign controls (shared); P4 receipts for distribution proof.
**Blockers/risks:** Issuer responsiveness; source quality; funding custody (dedicated treasury keys, never reused).
**Status:** Planned.

---

### P9 — VICUS ROUTES

**Problem:** Cross-chain movement exists as restricted CCTP + external access/exit routes without unified discovery, quoting, tracking, or recovery.
**User outcome:** Actual cross-chain route discovery, honest availability, wallet signing, real quotes/fees, execution tracking, recovery, with CCTP inbound-Stellar dependency explicit.
**Reuse:** `src/lib/crosschain-send/`, `src/lib/access/`, `src/lib/asset-access/`, `src/lib/external-utility/`, existing routers/CCTP (extends).
**Complete:** Testnet CCTP burn→attestation→forwarding; access/exit routers; return-to-Stellar gating.
**Remaining:** Route registry; quote/fee surfacing; tracking/recovery UX; inbound-Stellar unblocking.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P9.1 | Route discovery + honest availability | Registry of real routes with live availability; unavailable routes gated with reasons | Route-matrix test | Planned |
| P9.2 | Quotes/fees + wallet signing | Real quotes/fees shown pre-sign; user signs in wallet; Vicus verifies deltas post-confirm | Quote-freshness + delta tests | Planned |
| P9.3 | Execution tracking + recovery | Burn→attestation→delivered states; reload recovers; no reburn; completed immutable | `crosschain-send:verify` + reload tests | Planned |
| P9.4 | Inbound-Stellar + Return Home | CCTP inbound-Stellar dependency resolved or explicitly gated with forwarder/relay boundary documented | Dependency verdict doc + E2E or honest gate | Planned |

**Dependencies:** Builds on existing router/CCTP work + P4 receipts. Inbound Stellar is the critical path.
**Blockers/risks:** CCTP forwarder/relay availability; attestation latency; fee volatility; Mainnet enablement reviews.
**Status:** Planned.

---

### P10 — VICUS BASKETS V2 (execution)

**Problem:** P5 baskets are discovery-only; users will want eligible multi-asset execution without collapsing into an unlicensed product.
**User outcome:** Eligible multi-asset quote/preview/execution, per-leg authorization, partial-fill handling, verified constituent holdings and receipts.
**Reuse:** P5 basket model, P9 routes, P4 proof, per-leg existing access/exit services.
**Complete:** Nothing executable yet (by design — V1 is discovery only).
**Remaining:** Eligibility engine; quote/preview; per-leg signing; partial-fill logic; constituent receipt aggregation.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P10.1 | Eligibility + quote/preview | Per-leg eligibility + live quotes/fees previewed before any signature; ineligible legs gated with reasons | Eligibility-matrix + quote tests | Planned |
| P10.2 | Per-leg authorization + execution | Each leg signed separately in wallet; no blanket approvals; sequential or batched per venue constraints | Signing-ceremony E2E | Planned |
| P10.3 | Partial fills + constituent proof | Partial fills handled explicitly (retry/skip/refund paths); each constituent holding + receipt verified | Partial-fill simulation + `positions:verify` | Planned |

**Dependencies:** Verified access/route execution (P0/P3/P9) + P4 proof. Legal/eligibility review per venue.
**Blockers/risks:** Venue authorization; US eligibility restrictions; tax/custody implications; complexity of multi-leg failure modes. No basket tokens in this phase.
**Status:** Planned.

---

### P11 — TOKENIZED BASKET VAULTS + ECOSYSTEM

**Problem:** True basket tokens (one share = diversified underlying) require Soroban vaults, custody, audits, and issuer/legal approvals that do not exist today.
**User outcome:** Research and eventually build compliant Soroban-backed vaults: share accounting, issuance/redemption, valuation, custody, audits, approved underlying assets — plus Compass/Proof/Campaign/Registry APIs. **No suggestion that stock-backed basket tokens already exist.**
**Reuse:** Lab issuance precedent (Testnet), P10 eligibility/execution learnings, Agent API (`src/lib/agent-api/`).
**Complete:** None for vaults (research phase). Agent API v1 (`assets/orders/quote`) exists.
**Remaining:** Everything: research, design, legal, custody, audit, build, ecosystem APIs.

| ID | Milestone | Acceptance | Verification | Status |
|---|---|---|---|---|
| P11.1 | Vault research + compliance design | Written research: vault architecture options, custody models, valuation methods, regulatory paths; explicit non-commitment to unapproved underlyings | Design-review doc; legal sign-off required before build | Planned |
| P11.2 | Soroban vault prototype (Testnet only) | Share accounting + issuance/redemption on Testnet with approved test assets; no Mainnet, no stock-backed claims | Testnet E2E + audit-trail | Planned |
| P11.3 | Audit + approved-asset + custody track | Security audit, liquidity/issuer/legal reviews, custody arrangement, approved-underlying allowlist | Audit reports + allowlist; Mainnet only after all gates pass | Planned |
| P11.4 | Ecosystem APIs (Compass/Proof/Campaign/Registry) | Versioned APIs for compass advice, proof receipts, campaign management, asset registry with auth + rate limits | `agent-api:verify` extended; docs + integration test | Planned |

**Dependencies:** Separate security, liquidity, issuer, and legal reviews. Must not start Mainnet vault work before P11.1–P11.3 gates pass.
**Blockers/risks:** Regulatory (securities), custody, audit findings, liquidity, issuer authorization. Highest-risk phase — sequenced last deliberately.
**Status:** Planned (research only until reviews pass).

---

## E. Milestones and acceptance criteria index

43 milestones across 12 phases. Every milestone has acceptance + verification in §D. Summary:

| Phase | IDs | Count | Entry dependency |
|---|---|---|---|
| P0 Reliability | P0.1–P0.4 | 4 | None (first) |
| P1 Premium experience | P1.1–P1.3 | 3 | None (parallel-safe) |
| P2 Compass | P2.1–P2.3 | 3 | Action Engine + P0 auth |
| P3 Stellar utility | P3.1–P3.4 | 4 | P0 pathways |
| P4 Portfolio + Proof | P4.1–P4.4 | 4 | P0 + P3 |
| P5 Baskets V1 | P5.1–P5.3 | 3 | None (discovery) |
| P6 Drops | P6.1–P6.4 | 4 | P4 + funded controls |
| P7 Circles + Conviction | P7.1–P7.3 | 3 | P4 ownership |
| P8 Studio | P8.1–P8.4 | 4 | P6 controls |
| P9 Routes | P9.1–P9.4 | 4 | Router/CCTP + P4 |
| P10 Baskets V2 | P10.1–P10.3 | 3 | P9 + P4 |
| P11 Vaults + Ecosystem | P11.1–P11.4 | 4 | All reviews |
| **Total** | | **43** | |

Acceptance rule (global): a milestone is complete only when its §D acceptance holds **and** its verification evidence is recorded (verifier output + links where applicable). Plans, mockups, and code presence alone never complete a milestone.

---

## F. Dependencies and execution order

```text
P0 (reliability) ─┬─▶ P2 (compass, needs Action Engine + auth)
                  ├─▶ P3 (utility, needs verified pathways)
                  │     └─▶ P4 (portfolio+proof, shared truth)
                  │           ├─▶ P6 (drops, needs proof + funding)
                  │           ├─▶ P9 (routes, needs router/CCTP + proof) ─▶ P10 (basket execution) ─▶ P11 (vaults)
                  │           └─▶ P7/P8 (social/studio, need proof/controls)
P1 (UX) ──────────┴─▶ parallel-safe anytime (must not mask reliability states)
P5 (baskets V1 discovery) ─▶ parallel-safe anytime ─▶ P10 (execution later)
```

| Rule | Meaning |
|---|---|
| P0 first | Immediate priority. All money-moving credibility depends on it. |
| P1 parallel-safe | May progress when it does not hide or soften reliability/gating states. |
| P2 after Action Engine | Extends existing engine; no fork. |
| P3 after verified pathways | No new Stellar integrations until current ones are witnessed. |
| P4 before P6/P9/P10 | Shared holding/receipt truth must exist before drops, routes, and basket execution. |
| P6 after P4 | Drops depend on proof + real funded controls. |
| P9 on router/CCTP | Extends existing work; inbound-Stellar is the critical path. |
| P10 after P9+P4 | Basket execution needs verified access/route execution + constituent proof. |
| P11 last + gated | Soroban vaults need security, liquidity, issuer, legal reviews. Research before build. |
| P5 before P10 | Basket discovery can and should ship before basket execution. |

---

## G. Three planned product releases

Planning groups, not promises that phases run strictly sequentially. A release ships when its constituent milestones meet §D acceptance.

### Release 1 — USEFUL AND RELIABLE (P0–P4)

Make the existing product true: everything that claims to work is witnessed, everything gated says why, holdings and receipts are real.

- P0 reliability (auth, Send, rewards, external access/exit, CCTP, recoverability)
- P1 premium experience (safe to parallelize)
- P2 Compass (personalized actions on the existing engine)
- P3 Stellar-native utility (completed workflows + verified integrations)
- P4 Portfolio + Proof (shared holding/receipt truth)

Exit signal: manual E2E §§A–H witnessed or honestly re-gated; production config set; Portfolio shows chain re-read holdings; receipts uniform.

### Release 2 — REWARDING AND DIFFERENTIATED (P5–P8)

Differentiate on participation and belonging without inventing finance.

- P5 Baskets V1 (discovery only — no trading, no tokens)
- P6 Drops (funded, idempotent, anti-abuse, budget-capped)
- P7 Circles + Conviction (evidence-backed, privacy-safe)
- P8 Studio (issuer onboarding, source-backed registration, funded campaigns, analytics)

Exit signal: funded Drops E2E; Studio onboarding → registration → funded campaign witnessed; reputation/holding-role rules enforced.

### Release 3 — INFRASTRUCTURE (P9–P11)

Turn routes and baskets into infrastructure — only on verified execution and explicit reviews.

- P9 Routes (discovery, quotes, signing, tracking, recovery, inbound-Stellar verdict)
- P10 Baskets V2 (eligible multi-asset execution with per-leg authorization)
- P11 Vaults + Ecosystem (Testnet research → audit/custody/legal → ecosystem APIs)

Exit signal: cross-chain routes tracked with recovery; basket execution with constituent proof; vaults only as far as reviews permit. **Stock-backed basket tokens are not claimed at any point before P11.3 gates pass.**

---

## H. Risks, blockers and external requirements

### H.1 Confirmed blockers (open at v2 publication)

| # | Blocker | Impact | Owner / next step |
|---|---|---|---|
| 1 | No financial-production (D) `DATABASE_URL`; migrations `0000→0027` (28 files) not run in (D); (C) QA historically migrated | Cannot deploy (D) honestly | Provision Neon (D) → migrate → `db:verify` |
| 2 | `VICUS_APP_URL` value/binding unverified from shell: key PRESENT in (A), contents NOT ACCESSIBLE in (B); `https://…` origin + `VICUS_HOME_DOMAIN` still required for (D) (prod build rejects non-https) | Auth/session scope + boot failure risk in (D) | Verify origin binding; set (D) origin + home domain |
| 3 | Reward-distributor + Lab-issuer keys PRESENT in (A, funding unknown); campaign-secret keys NOT PRESENT in (A); no funded (D) treasury | No funded payouts | Issue dedicated funded (D) treasury keys; set `VICUS_CAMPAIGN_MAX_USDC`, `VICUS_REWARD_MAX_XLM`; never reuse test keys |
| 4 | `VICUS_ENABLE_MAINNET_REWARDS` must remain unset | Mainnet rewards stay off (correct) | Confirm unset pre-deploy; separate payout ceremony before ever setting |
| 5 | All manual-E2E money flows PENDING HUMAN | Implemented ≠ verified | Schedule human-signer sessions with funded wallets (P0.2–P0.4) |
| 6 | CCTP Mainnet off (code-constant `false`); inbound-Stellar dependency | Cross-chain Mainnet + Return Home limited | P9.4 verdict; no env-flip shortcut |
| 7 | AAPLc acquisition gated (no liquidity); NVDAc nothing executable; TSLAx/NVDAc route-limited | External utility bounded by market truth | Keep gated; re-check liquidity per release |
| 8 | Wallet/browser matrix untested (Freighter versions, Mainnet requirement) | Auth/Send fragility | P0.1 inventory must cover; P0.2 proves |

### H.2 External / legal requirements

- **Issuer authorization:** permissioned assets (BENJI-class) and any tokenized-asset drops require issuer approval evidence. No permissionless stock-drop path.
- **Securities/regulatory:** P10 execution and P11 vaults need eligibility review per venue; P11 needs full securities, custody, audit, and approved-underlying reviews before Mainnet.
- **Treasury custody:** dedicated distributor/treasury keys, funding ceremony, spending caps, rotation plan. Test keys never become prod keys.
- **Data/licensing:** logo curation (P1), price-feed licensing (P1), Morpho/Jupiter/Horizon/Circle terms for production use.
- **RPC dependencies (keyless, fail-closed):** Solana Mainnet RPC, Base public node, Stellar Horizon Mainnet+Testnet, Jupiter Lite, Morpho GraphQL, Circle Iris sandbox. Outages must degrade to honest unavailable states.

### H.3 Product risks

| Risk | Mitigation |
|---|---|
| Implied investment advice (baskets, compass) | Discovery-only labels in P5; eligibility + risk copy in P2/P10; never show returns |
| Testnet/Mainnet confusion | Network labels on every financial surface; Testnet “no monetary value” copy |
| invented data under pressure | §I proof standards; fail-closed empty/gated states; metrics traceability (P8.4) |
| Sybil / reward farming | P6.2 controls; review SLAs; budget caps |
| Multi-leg failure complexity (P10) | Per-leg auth; explicit partial-fill paths; no silent rollups |
| Vault ambition outrunning reviews (P11) | Research-before-build gate; Mainnet only after audit + legal + custody |

---

## I. Verification and proof standards

### I.1 Tiered gates (use the cheapest sufficient gate)

1. **Targeted verifier** — `npm run <domain>:verify` (e.g. `send:verify`, `reward:verify`). First gate for every milestone touching that domain.
2. **Typecheck + lint** — `npx tsc --noEmit`, `npm run lint`. Required before any milestone is marked complete.
3. **Production build** — `npm run build`. Required for user-visible slices.
4. **Witnessed E2E** — `docs/manual-e2e.md` flow with human signature where value moves. Required for P0/P3/P4/P6/P8/P9/P10 money paths.
5. **Explorer evidence** — Horizon/chain links recorded in receipts and (where public) in docs. Required for all settlements.

Full-suite reruns are wasteful: run the nearest focused verifier first; run broader checks once at completion.

### I.2 Mandatory product truth (binding)

No fabricated prices or charts · balances or holdings · quotes/liquidity · transactions or receipts · stock ownership · issuer authorization · user participation · investment returns · rewards or funded balances.

- Separate Testnet, Mainnet, connected/external, permissioned, gated, and historical proof on every surface.
- Financial actions require actual authorization, safeguards, and appropriate eligibility.
- Historical Testnet proof is not Mainnet enablement.
- Signed-message auth proves key control only — not holdings, not ownership.
- Pasted-address checks never create roles, persist addresses, or log balances.

### I.3 Receipt standard (P4-unified, applies from P0 forward)

Every financial action records: state (`claimable → submitted → confirmed` or route equivalent / `failed` with safe code) · tx hash · ledger · network · destination (abbreviated in UI) · timestamps · explorer link · recovery metadata (envelope reuse, no-duplicate guarantees). Completed receipts are immutable. Reload must resume, never duplicate.

### I.4 Verifier catalogue (existing, reuse — do not reinvent)

`db · mission · auth · reward · watch · social · community · role · ecosystem · hub · admin · org · spaces · utility · activation · lab · access · classification · stellar-assets · send · asset-access · asset-actions · campaign-funding · external-utility · exit · generalized-access · external-assets · agent-api · crosschain-send · watch-center · positions · lending · return-stellar · broader-access · stellar-home · representations · asset-circles · conviction · personalized-activity · utility-discovery · wave3-ia · contacts · lifecycle` — each as `npm run <name>:verify`. See `package.json` scripts.

### I.5 Failure loop

Inspect exact failure → inspect only implicated code → smallest corrective edit → rerun only the failing check. After two failed fixes, investigate root cause. Never broaden scope to cover unrelated failures.

---

## J. Current active work (synced 2026-10-14)

### P0.1 — EXISTING FUNCTIONALITY & E2E GAP INVENTORY

**State:** Complete 2026-10-14 (was Active at v2.0 publication; ran in its own session per plan).

Delivered (all checked against repository truth):

- [x] Genuinely working flows (live routes 200, session endpoint, gated labels verified)
- [x] Implemented but unverified flows (verifier status + manual-E2E §§A–H mapping)
- [x] Production configuration blockers (scoped A/B/C/D; §C.3/§H.1 corrected above)
- [x] Wallet/browser issues (Freighter Mainnet requirement, untested version matrix)
- [x] Missing providers/quotes (venue-by-venue fail-closed log)
- [x] Existing reusable modules (path + responsibility; `access` vs `asset-access` split named)
- [x] Recommended smallest executable vertical slice (delivered; P2.1 selected below)

### P0.2a — ROUTE-HEALTH + AUTH-READINESS TRIAGE (preliminary verification, not P0.2)

**State:** Complete 2026-10-14. `/positions`, `/subjects/apple`, `/swap/aaplx-on-solana` all return 200 with correct content (P0.1 timeouts = Pi-shell network path); `auth:verify` passed against local DB; owner Freighter checklist issued. **No wallet signature witnessed; P0.2 stays Planned.**

### Shipped UI (visual only — not financial E2E)

- Position Center redesign — `9b02ec9`, live on production (pos- CSS verified in served bundle). P4 remains incomplete (receipts/states/ownership rules outstanding).
- Stellar Send transfer-form redesign — `45cca5c`, live on production (send CSS verified in served bundle). P0.2 remains incomplete (human-signed Mainnet Send + receipt outstanding).
- P0.3 funded Testnet reward/campaign E2E and P0.4 external/CCTP E2E remain outstanding (owner funding + signatures).

### Next active work

- **Next buildable product milestone: P2.2 Alternatives + next steps** (source-backed alternatives + one concrete next step per gated action; builds on the P2.1 verdict model).
- **P0.2–P0.4 owner-dependent E2E stays pending** alongside it (human wallets, Testnet funding, witnessed receipts).
- P2.1 complete 2026-10-14 (`7b8ebb3`, live — see log). P2.3 Compass surface follows P2.2.

---

## K. Status and update conventions

### K.1 Milestone statuses (only these)

| Status | Meaning |
|---|---|
| `Planned` | Defined in §D, not started |
| `Active` | Exactly one milestone active at a time (normal rule; P1 parallel exception must be explicit) |
| `Blocked` | Named blocker from §H with owner + unblock step |
| `Complete` | §D acceptance holds + §I verification recorded |
| `Deferred` | Explicitly moved with reason + new target (never silent) |

### K.2 Session operating rules (binding on future Pi sessions)

1. Start from actual repository truth (`git status`, migrations, services, verifiers). Preserve unrelated changes (including the pre-existing `.gitignore` line-ending state and untracked `design-reference/`).
2. Reuse existing domain logic — never duplicate a domain under a new product name (§B.6).
3. One bounded vertical slice per session: type/domain → logic → boundary/API → UI → focused verification.
4. Measurable acceptance criteria from §D; verify once with targeted gates (§I.1).
5. No speculative refactors, renames, or reorganizations of unrelated systems.
6. Distinguish domain-complete from product-wiring-complete in the session report.
7. Record completed work + remaining blockers; update this roadmap in the same session (status table + date + evidence links).
8. Never mark complete on plans, mockups, or code presence alone.
9. Never enable a Mainnet financial feature as a side effect of a slice. Flag changes require explicit review.
10. Prefer `git diff --stat` / `git diff --check` for final validation; read full diffs only to investigate correctness.

### K.3 Roadmap update procedure

After each completed milestone:

1. Flip its §D status + add evidence (verifier output, receipt/explorer links, E2E section).
2. Update §J (new active milestone) and §E counts if IDs change.
3. Append a dated entry below (keep last 10; archive older to git history).
4. Commit as `docs: update master roadmap — <milestone-id> <status>` (separate from feature commits).

### K.4 Update log

| Date | Change | Session/commit |
|---|---|---|
| 2026-10-14 | v2.0 established as canonical roadmap (P0–P11, 43 milestones, P0.1 active) | Commit `679859a` (`docs: establish Vicus master product roadmap v2`) |
| 2026-10-14 | P0.1 complete (gap inventory + env-scope corrections); P0.2a triage complete (routes 200, `auth:verify` pass) — P0.2–P0.4 stay planned/owner-blocked | Inventory sessions (no code changes) |
| 2026-10-14 | Position Center UI shipped live (visual only; P4 incomplete) | Commit `9b02ec9` (`feat: redesign Vicus Position Center`) |
| 2026-10-14 | Send transfer-form UI shipped live (visual only; P0.2 incomplete) | Commit `45cca5c` (`fix: redesign Stellar Send transfer form`) |
| 2026-10-14 | v2.1 sync: §C.3/§H.1 evidence corrections, §J active-work rewrite, log rows; next buildable P2.1 | Commit `2d1ff8c` |
| 2026-10-14 | P2.1 complete (eligibility-context model live; P2.2/P2.3 remain; 43 IDs intact) | Commit `7b8ebb3` + this sync |

---

## Appendix 1 — Key reused modules

| Responsibility | Module(s) |
|---|---|
| Stellar reads/roles | `src/lib/stellar/` |
| Wallet auth/sessions | `src/lib/auth/`, `src/app/api/auth/` |
| Send | `src/lib/send/`, `src/components/send-runner.tsx` |
| Cross-chain / CCTP | `src/lib/crosschain-send/`, `src/components/crosschain-send-runner.tsx` |
| Action Engine (+Compass) | `src/lib/asset-actions/`, `src/app/use/` |
| Access / exit routers | `src/lib/access/`, `src/lib/asset-access/`, `src/components/access-runner.tsx`, `src/components/exit-runner.tsx` |
| External access (Jupiter/Morpho) | `src/lib/external-utility/`, `src/app/swap/`, `src/app/acquire/` |
| Lab | `src/lib/lab/`, `src/components/lab-runner.tsx` |
| Rewards / campaigns / missions | `src/lib/rewards/`, `src/lib/campaigns/`, `src/lib/missions/`, `src/components/campaign-runner.tsx`, `campaign-studio.tsx`, `reward-claim-card.tsx` |
| Positions → Portfolio | `src/lib/positions/`, `src/components/connected-positions.tsx`, `src/app/positions/` |
| Watch / Activity → Proof | `src/lib/watch-center/`, `src/lib/activity/`, `src/app/watch/`, `src/app/activity/` |
| Circles / community / conviction | `src/lib/circles-social/`, `src/lib/community/`, `src/lib/social/`, `src/lib/conviction/` |
| Spaces / Host / Orgs → Studio | `src/app/spaces/`, `src/app/host/`, `src/app/organizations/`, `src/app/admin/`, `src/lib/organizations/` |
| Lending discovery | `src/lib/lending/` |
| Agent API → Ecosystem APIs | `src/lib/agent-api/`, `src/app/api/v1/` |
| Lifecycle / classification / subjects | `src/lib/lifecycle/`, `src/lib/activation/`, `src/app/subjects/`, `src/app/compare/` |
| Verifiers | `scripts/verify-*.ts` (see §I.4) |
| Migrations | `drizzle/0000–0027` |
| E2E + readiness inputs | `docs/manual-e2e.md`, `docs/production-readiness.md`, `docs/demo-proof-manifest.md` |
| Architecture baseline | `docs/ARCHITECTURE.md` |

---

## Appendix 2 — Historical Testnet proof

One independently verified Stellar Testnet settlement. Historical evidence only — **not** Mainnet enablement.

| Field | Value |
|---|---|
| Network | Stellar Testnet |
| Asset | 0.1 native XLM (no monetary value) |
| Ledger | 5066878 |
| Transaction | `36798e6e184e1c031236d47940dbf6e894447bce260cb918c8c1a2e6985b78fc` |
| Explorer | [stellar.expert (testnet)](https://stellar.expert/explorer/testnet/tx/36798e6e184e1c031236d47940dbf6e894447bce260cb918c8c1a2e6985b78fc) |
| Raw record | [Horizon Testnet](https://horizon-testnet.stellar.org/transactions/36798e6e184e1c031236d47940dbf6e894447bce260cb918c8c1a2e6985b78fc) |
| Verification | `successful: true`, one `payment` op of `0.1000000` native XLM, ledger `5066878`, matching stored claim |
| Context | User completed an eligible approved mission, claimed, Vicus settled via server distributor with durable receipt |

Mainnet rewards remain behind `VICUS_ENABLE_MAINNET_REWARDS` (off by default, unset in every known env). Testnet distributors remain funding-gated.

---

## Appendix 3 — Source map

Inputs merged into this canonical document (authority order: this doc → code/verifiers → E2E/readiness manifests → slice docs → PRD/brand):

- `package.json` — scripts (verifier catalogue), dependencies
- `drizzle/` — migrations 0000–0027, schema evolution
- `src/lib/*`, `src/app/*`, `src/components/*` — implementation inventory (§C)
- `scripts/verify-*.ts` — proof standards (§I)
- `docs/manual-e2e.md` — pending human flows (P0 scope)
- `docs/production-readiness.md` — deploy blockers (§H.1)
- `docs/demo-proof-manifest.md` — proven reads vs placeholders (§C.2)
- `docs/ARCHITECTURE.md` — system map + security boundaries
- `docs/Vicus_Slice_3_Stellar_Verification.md`, `docs/Vicus_Slice_4_Missions.md`, `docs/Vicus_Slice_5A_Auth.md`, `docs/Vicus_Slice_5B_Rewards.md` — slice history
- `docs/Vicus_PRD_Build_Plan_Architecture.md`, `docs/Vicus_Product_Idea.md`, `docs/Vicus_Brand_Messaging.md` — product background (non-authoritative where contradicted by code)
- `README.md` — public positioning + proof section (kept consistent, not changed here)
- `docs/DESIGN.md`, `docs/screenshots/` — experience baseline for P1

---

*End of canonical roadmap v2. Next action: run P0.1 in its own session. No feature implementation in this session.*
