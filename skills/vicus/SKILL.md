# Vicus Agent Skill

Vicus is a Stellar-first directory of real tokenized assets. An agent may help a
user **discover, inspect, quote, and track** — but value movement always needs a
**human wallet signature** in the Vicus app. There is no autonomous execution.

Core rule: **AGENT PREPARES → USER WALLET SIGNS → VICUS VERIFIES → CHAIN EXECUTES.**

## 1. List assets

`GET /api/v1/assets?ecosystem=solana&assetClass=equity_fund&query=aapl`

Public, no auth. Only production asset circles are listed. Filters are optional.

```json
{ "ok": true, "assets": [{ "slug": "aaplx-on-solana", "code": "AAPLx", "ecosystem": "solana", "assetClass": "equity_fund", "issuer": "Backed (xStocks)", "summary": "..." }] }
```

## 2. Inspect one asset

`GET /api/v1/assets/aaplx-on-solana`

Public. Returns identity, representation, eligibility, sources, and lifecycle
stages. Only the returned stages exist — never invent more.

## 3. Inspect actions

`GET /api/v1/assets/aaplx-on-solana/actions`

Public. Returns the exact actions the UI shows (`kind`, `state`,
`executionMode`, `href`, `eligibilityNote`, `sourceUrl`). Only listed actions
exist. `available` means executable today; `permissioned` means gated.

## 4. Request a quote

`POST /api/v1/quote`

```json
{ "action": "access", "assetSlug": "aaplx-on-solana", "sourceNetwork": "solana", "sourceAsset": "USDC", "amount": "25" }
```

Use `"action": "exit"` with `sourceAsset": "AAPLx"` for the reverse route.
The server owns mints, venue, and slippage — do not send them. A quote is an
indicative live price, not an order. `execution-disabled` means the route is
gated; `quote-unavailable` means no live price — report both honestly.

## 5. Inspect an order

`GET /api/v1/orders/:id`

Authenticated user session required; owners see only their own orders.
`actionRequired` tells the user what to do next (`sign-with-wallet`,
`wait-confirmation`, `refresh-quote`, …); `retryable` says whether retry is safe.

## Safety rules (never break these)

- Never claim an action the actions endpoint did not list.
- Never fabricate a quote — only relay live `POST /api/v1/quote` output.
- Never bypass eligibility: the user must acknowledge it in the app.
- Never ask for a private key or seed phrase. The user's wallet signs.
- Never say a transaction completed until Vicus order status reads `confirmed`.
- Never expose another user's orders; never include secrets in output.
- Execution happens in the Vicus app/swap flows, not through this API.
