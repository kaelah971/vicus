# Tokenized-Stock Coverage + Stellar Trading Feasibility

**Date:** 2026-10-16
**Mode:** Research + read-only verification. No transactions, signatures, Mainnet enablement, config changes, or code changes. Horizon Mainnet reads + live Jupiter quote only.
**Builds on:** `docs/P3.2_Stellar_Swap_Yield_Verdicts.md` (2026-10-14, still standing — nothing below re-litigates S1–S6/Y1–Y3 except fresh quote evidence where noted).

## Verdict taxonomy (matches P3.2; matrix labels in brackets)

- QUOTE-VERIFIED [QUOTE-AVAILABLE] — live read-only quote obtained. Proves quotability only.
- IMPLEMENTED-UNVERIFIED [IMPLEMENTED BUT UNWITNESSED] — Vicus code + verifier exist; no witnessed wallet-signed settlement.
- VERIFIED EXECUTABLE — witnessed end-to-end settlement with receipt. **Nothing in Vicus claims this for any stock route.**
- PERMISSIONED / RESTRICTED — issuer/jurisdiction gate confirmed; route exists but most users cannot use it.
- NO MARKET / INSUFFICIENT LIQUIDITY — venue or book checked live; nothing tradeable found.
- UNVERIFIED / REJECTED — clone, counterfeit ticker, dead documentation, or unsupported issuer claim.
- VERIFIED + DISCOVERABLE — catalogue listing backed by issuer evidence (no execution implied).

## 1. Stellar stock representations: investigated, all rejected

Horizon `/assets` sweep 2026-10-16 (codes AAPL, TSLA, NVDA, AAPLX, TSLAX, MSFT, SPY, QQQ, NVDAC). Pattern everywhere: many same-ticker issuers, no official backing.

| Candidate | Holders | Documentation | USD book (vs USDC) | Observed market | Verdict |
|---|---|---|---|---|---|
| AAPL / GDTM6… (stellarnasdaq.org) | 586 | Domain DEAD (DNS fail 2026-10-16) | Empty | XLM book only, asks ≈ 0.00045 XLM (≈ $0.0001 vs real ~$250); zero USDC trades ever | UNVERIFIED / REJECTED |
| TSLA / GDY7L… (electric.indus.exchange) | 7,557 | Domain DEAD | 2 asks, 50.75M units @ 0.001 USDC (dust pricing) | XLM trades ≈ 0.0004 XLM per 45M units; no USD anchor | UNVERIFIED / REJECTED |
| NVDA / GDPCD… (metaverse.indus.exchange) | 1,785 | Unverified minter-style domain | Empty | No USD book | UNVERIFIED / REJECTED |
| NVDA / GDVIQ… (atmindividual.org) | 209 | Unverified | Empty | No USD book | UNVERIFIED / REJECTED |
| SPY / GA3SFO… (stellarmint store) | 421 | Unverified storefront domain | Empty | No USD book | UNVERIFIED / REJECTED |
| QQQ / GAFTOY… (mutualfunds.stellar-dex.io) | 1,678 | Unverified | Empty | XLM trades: 6.9M QQQ → 0.0025 XLM (2026-10-16) | UNVERIFIED / REJECTED |
| TSLAX (2 records, litemint/coincent) | 1–2 | Minter storefronts | — | Clone dust | UNVERIFIED / REJECTED |
| DSTOQ TSLA (dstoq.tech) | 1 | Issuer shut down 2021 | — | Dead | UNVERIFIED / REJECTED |
| NVDAC / NVDAc codes | 0 | — | — | Do not exist on Stellar | NO MARKET |

Rejection reasons (any one is sufficient): (a) documentation domain dead or unofficial, (b) no USD-anchored orderbook — XLM books price these at fractions of a cent with million-unit sizes, (c) zero USDC-paired trades in history, (d) no issuer authorization program, redemption docs, or jurisdiction terms, (e) holder counts consistent with airdrop-farming (7,557 holders, revocable flag, $0 mill pricing).

**Conclusion: there is no VERIFIED Stellar tokenized-stock representation. Nothing may be listed, quoted, or priced from these.**

## 2. Existing four: stage review (fresh 2026-10-16 where noted)

| Asset | Catalogue | Reference/market price | Indicative quote | Venue | Implemented route | Witnessed execution |
|---|---|---|---|---|---|---|
| AAPLx (Solana) | VERIFIED + DISCOVERABLE | None (P1.3: no market feed) | QUOTE-AVAILABLE — 25 USDC → live 2026-10-16 (~344.75 USDC/token, 0% impact) | Jupiter | IMPLEMENTED BUT UNWITNESSED (`/swap`, prepare/verify) | No (P0.4) |
| TSLAx (Solana) | VERIFIED + DISCOVERABLE | None | QUOTE-AVAILABLE (shared adapter, re-proven Oct 2026) | Jupiter | IMPLEMENTED BUT UNWITNESSED | No (P0.4) |
| AAPLc (Base) | VERIFIED + DISCOVERABLE | None | NO MARKET — Aerodrome pool dust, quotes revert (standing Oct record; `ACQUISITION_ENABLED = false` confirmed in tree today) | Aerodrome (gated) | None (disabled by design) | No |
| NVDAc (Base) | VERIFIED + DISCOVERABLE | None | NO MARKET — same standing record | Aerodrome (gated) | None | No |

UX attribution check 2026-10-16: no "issued by Apple/Tesla/NVIDIA" claim anywhere in visuals, tiles, sheets, or circle pages; issuer-first lines (Backed / Coinbase) intact with owner logos. **No classification defect found — no UI change made.**

## 3. Stellar DEX/AMM feasibility for stock trading

- **Mechanism works:** Classic DEX orderbooks + path payments are live and quotable (USDC/XLM book read again this slice, ~5.43). Strict-send/receive, trustline pre-checks, and issuer-auth-flag reads are all available via Horizon + the existing Stellar client/role modules. No new provider needed.
- **Missing leg:** there is no verified stock token to trade against. A path payment USDC → clone-AAPL would execute technically and settle something economically meaningless — machinery without a counterparty market is theater, not trading.
- **Permissioning:** clones are permissionless (auth_required=false) precisely because no real issuer stands behind them. A genuine stock token would almost certainly carry auth_required + KYC (cf. BENJI/WTGXX permissioned funds) — meaning even a future verified listing needs eligibility plumbing, not just a quote adapter.
- **Fees/slippage:** irrelevant until a real book exists; XLM-denominated books cannot produce USD slippage estimates without an XLM→USD feed Vicus does not have (see P1.3).
- **Verdict:** Stellar stock-trading integration is NOT feasible today. The blocker is market existence, not engineering.

## 4. Coverage matrix (every candidate, one label)

| Candidate | Label | What it proves |
|---|---|---|
| AAPLx / TSLAx | QUOTE-AVAILABLE + IMPLEMENTED BUT UNWITNESSED | Live indicative quotes + built routes; settlement unwitnessed |
| AAPLc / NVDAc | VERIFIED + DISCOVERABLE, PERMISSIONED / RESTRICTED venue | Real Coinbase tokens, accurately listed; no Vicus execution path |
| BENJI / WTGXX / WisdomTree funds | VERIFIED + DISCOVERABLE (funds, not stocks) | Issuer NAV reference; official flows only |
| All Stellar "stock" tickers (AAPL/TSLA/NVDA/MSFT/SPY/QQQ/TSLAX…) | UNVERIFIED / REJECTED | Clone soup; §1 evidence |
| Stellar DEX stock route | NO MARKET / INSUFFICIENT LIQUIDITY | Mechanism ready, market absent |

## 5. Recommendation

**Recommended first execution integration: none in this slice.** The honest next build is NOT a Stellar stock adapter (no market) and NOT a new Solana/Base route (already built, awaiting witnesses).

**Exact next slice:** P0.4 human-witnessed settlement of the existing AAPLx Jupiter route (S2) — the only stock path that is QUOTE-AVAILABLE + IMPLEMENTED. Needs: funded Solana wallet, 25-USDC swap, delta verification, explorer receipt. Zero new engineering; owner-dependent. If P0.4 stays blocked, the fallback build slice is a Stellar path-payment *read-only quoter* (strict-send USDC→XLM display, no settlement) as S1's follow-up — but it must never imply stock tradability.

**Explicitly rejected:** listing any Stellar clone ticker; Stellar stock orderbook quotes in USD; backfilling token prices from equity prices; enabling AAPLc acquisition without fresh pool liquidity + Mainnet CCTP review.

## 6. Verification performed

- 8 Horizon asset-code sweeps + 6 orderbook reads + 4 trade-history reads + 2 issuer-account reads + 2 TOML fetches (all 2026-10-16, raw JSON retained during analysis, not committed).
- `prices:verify` green incl. live Jupiter probe (AAPLx ~344.75 USDC).
- `ACQUISITION_ENABLED = false` + Aerodrome dust record confirmed in tree.
- Attribution grep clean. No code changed → no other verifier runs needed; `git diff --check` clean (docs only).
