# Screenshot Capture Manifest — Vicus judge README

All frames captured from the **live production deployment** (`https://explorevicus.vercel.app`)
with headless Microsoft Edge 154 (1440×900 desktop, 390×844 mobile), `--virtual-time-budget`
for font/hydration settle. Read-only browsing only: no wallets connected, no missions submitted,
no payouts, no data created. No secrets, cookies, or private material visible in any frame.

| File | Live URL | Viewport | What is shown | Notes / limitations |
|---|---|---|---|---|
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
