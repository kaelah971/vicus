# Screenshot Capture Manifest — Vicus judge README

All frames captured from the **live production deployment** (`https://explorevicus.vercel.app`)
with headless Microsoft Edge 154 (1440×900 desktop, 390×844 mobile), `--virtual-time-budget`
for font/hydration settle. Read-only browsing only: no wallets connected, no missions submitted,
no payouts, no data created. No secrets, cookies, or private material visible in any frame.

| File | Live URL | Viewport | What is shown | Notes / limitations |
|---|---|---|---|---|
| `01-landing-hero.gif` | `/` | 1440×900 source, 1000px GIF, 4 s loop @ 5 fps | Real hero motion: SwiftShader-rendered 3D scene across 6 verified phases, full headline + CTAs | 577 KB, 2-pass palette; text verified readable; loops cleanly |
| `01-landing-hero.png` | `/` | 1440×900 | Animated-hero landing: VICUS wordmark, “Tokenized assets need a place to belong.”, Explore / Put-assets-to-work CTAs | 3D hero canvas renders dark in still frame; copy and CTAs fully legible |
| `02-discover-catalogue.png` | `/discover` | 1440×900 | Visual asset catalogue: search, All/Funds/Treasury/Equity/Stable tabs, Stellar tile grid with official USDC, PYUSD, USDY, BENJI, WisdomTree marks | Real registry data; sidebar visible |
| `03-asset-preview-benji.png` | `/discover?asset=benji-on-stellar` | 1440×900 | BENJI bottom-sheet preview over dimmed grid: identity, Access/Send/Earn/Redeem action grid, About, Issuer, Representation, Open-full-asset CTA | Sheet opens from URL state (same as tap) |
| `04-asset-overview-benji.png` | `/circles/benji-on-stellar` | 1440×900 | Asset page Overview tab: identity header, Watch/Share, About paragraph, collapsed What-is/Eligibility/Risks disclosures, Key Facts | Tabs: Overview active |
| `05-compare-apple.png` | `/subjects/apple` | 1440×900 | Apple company view: AAPLx (Solana/Backed, access·swap·exit) vs AAPLc (Base/Coinbase, borrow), US-person restrictions, “No verified Stellar representation” | Real engine-derived states |
| `06-use-actions.png` | `/use` | 1440×900 | Action-first Use: Access/Send/Earn/Borrow/Redeem/Exit tiles with real path counts + Available-now rows (BENJI Earn/Redeem, PYUSD Redeem/Send) | Signed-out; counts from live engine |
| `07-action-sheet-aaplx.png` | `/use?asset=aaplx-on-solana` | 1440×900 | AAPLx sheet: Apple mark, CONNECTED Access (Solana USDC · Jupiter), Exit/Swap states, issuer, representation, Open-AAPLx CTA | Labels execution as wallet-signed + Vicus-verified, never completed |
| `08-circles.png` | `/circles` | 1440×900 | Social layer: “People around assets”, per-circle cards with real signals (1 watching) and truthful empty states (“be the first to ask”) | No activity fabricated |
| `09-space-missions.png` | `/spaces/circle` | 1440×900 | Circle project Space: presence statement, real metrics (4 assets · 1 lesson · 3 open missions · 0 contributions), hosted USDC assets | “0 contributions” shown honestly |
| `10-mobile-discover.png` | `/discover` | 390×844 | Mobile: 2-column visual tile grid, compact filters, bottom nav | No clipping or overflow |
| `11-mobile-sheet.png` | `/discover?asset=benji-on-stellar` | 390×844 | Mobile: BENJI sheet (~2/3 viewport) with grab handle, action grid, About, Issuer | Grid visible above sheet |

Retired: `_test.png` (duplicate of 01, deleted). One landing capture hit a transient
headless-network error page and was discarded, never shipped.

| `12-stellar-reward-proof.png` | `https://stellar.expert/explorer/testnet/tx/36798e6e184e1c031236d47940dbf6e894447bce260cb918c8c1a2e6985b78fc` | 1440×900 | Independent public-explorer record of Vicus's historical Testnet reward settlement: Successful, ledger 5066878, 0.1 XLM payment, 2026-10-07 | Matches the read-only `reward_claims` row (network testnet, asset XLM, amount 0.1000000, status confirmed) and Testnet Horizon (`successful: true`, identical ledger/amount/op). Recipient shown only as explorer-abbreviated; full address omitted from docs by choice. No new transaction was executed for this capture. |

## Gallery additions — 2026-10-17 (P1.3 → P6.3 recovery slices, same production, same conditions)

| File | Live URL | Viewport | What is shown | Notes / limitations |
|---|---|---|---|---|
| `gal-discover-mobile.png` | `/discover` | 390×844 | Stellar-first tile grid with owner Apple/Tesla/NVIDIA marks on Beyond-Stellar tiles | Signed-out; first-visit dialog dismissed via stored completion |
| `gal-onboarding-mobile.png` | `/discover` | 390×844 | First-visit interest dialog: 4 interest cards, adaptive CTA, Skip | Fresh device state (cleared storage); no selection submitted |
| `gal-sheet-price-mobile.png` | `/discover?asset=aaplx-on-solana` | 390×844 | Preview sheet with live Jupiter indicative quote (~344.54 USDC), source + updated time, no-chart honesty note | Live quote at capture time; value moves |
| `gal-basket-mobile.png` | `/baskets/apple-representations` | 390×844 | Curated basket constituent cards with brand marks, weight pills, eligibility disclosures | Scrolled to constituents |
| `gal-loyalty-mobile.png` | `/profile/demo` | 390×844 | Loyalty section on the demo participant profile: honest zero state (Explorer · 0 pts) | Demo identity, explicitly labeled; no wallet, no fixtures presented as activity |
| `gal-discover-desktop.png` | `/discover` | 1440×900 | Desktop catalogue with sidebar, filters, Stellar grid | Same conditions as mobile |
| `gal-loyalty-desktop.png` | `/profile/demo` | 1440×900 | Desktop demo profile with loyalty zero state | Scrolled to loyalty section |
