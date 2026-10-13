# Vicus Production Readiness (Wave 2 complete)

Audited 2026-10-13. Values never printed — only presence and purpose.

## Required server-only variables

| Variable | Present locally | Controls | Production requirement |
|---|---|---|---|
| `DATABASE_URL` | yes (dev Neon) | Postgres connection | **BLOCKER:** provision production database, run migrations 0001→0026 |
| `VICUS_APP_URL` | unset locally (defaults `http://localhost:3000`) | Same-origin checks, session cookie scope; production build rejects non-https | **BLOCKER:** set to the real `https://` origin before deploy |
| `VICUS_HOME_DOMAIN` | optional | Stellar home-domain auth messaging | Set to production domain |
| `VICUS_ADMIN_WALLET_ADDRESSES` | optional | Admin allowlist | Set to operator wallets |
| `VICUS_CAMPAIGN_DISTRIBUTOR_SECRET` | test-only locally | Campaign Testnet-USDC payout signer | **BLOCKER for campaigns:** fund + configure a dedicated treasury key; never reuse |
| `VICUS_CAMPAIGN_MAX_USDC` | test-only locally | Per-completion payout cap | Set an explicit cap |
| `VICUS_REWARD_DISTRIBUTOR_SECRET` | test-only locally | Reward payout signer | Same handling as campaign secret |
| `VICUS_REWARD_MAX_XLM` | defaults `1` | Reward cap | Review before demo |
| `STELLAR_LAB_ISSUER_SECRET` | test-only locally | Tokenization Lab test-asset issuer | Keep server-only; Testnet only |

## Environment flags (hazards, not blockers while unset)

- `VICUS_REWARD_NETWORK` defaults `testnet`. `VICUS_ENABLE_MAINNET_REWARDS === "true"`
  would enable Mainnet rewards — **never set this without a reviewed Mainnet
  payout ceremony.** Gated features (Mainnet CCTP, AAPLc execution) are
  code-constant (`false`), not env-flippable — verified safe.
- `NODE_ENV=production` enforces https app origin at boot.

## External dependencies (no API keys required)

- Solana Mainnet RPC (`api.mainnet-beta.solana.com`), Base (`base.publicnode.com`),
  Stellar Horizon Mainnet + Testnet, Jupiter Lite API, Morpho public GraphQL,
  Circle Iris sandbox (Testnet). All are keyless public endpoints; outage
  behavior is fail-closed and retryable throughout Vicus.

## Pre-deploy checklist

- [ ] Production `DATABASE_URL` + full migration run
- [ ] `VICUS_APP_URL=https://…` + `VICUS_HOME_DOMAIN`
- [ ] Campaign/reward distributor secrets issued + caps set
- [ ] Confirm `VICUS_ENABLE_MAINNET_REWARDS` is unset
- [ ] Re-run `npm run db:verify` against production after seeding
- [ ] Manual E2E runbook (`docs/manual-e2e.md`) executed with real wallets
