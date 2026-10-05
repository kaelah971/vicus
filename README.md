# Vicus

Vicus is a watch-first community layer for tokenized assets. The current app preserves the Slice 1 UI, Slice 2 Neon-backed content, and Slice 3 read-only Stellar role check while adding signed wallet sessions and authenticated offchain mission participation.

## Local development

```bash
npm install
npm run dev
```

Set `DATABASE_URL` in `.env.local`. It is server-only and must not be exposed to the browser. For Slice 5A wallet sessions, copy `.env.example` and configure the app/domain values before connecting Freighter.

## Database

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:verify
npm run mission:verify
npm run auth:verify
```

The development seed is deterministic and recreates the Vicus development tables. It contains neutral educational data only—no fake wallets, balances, transactions, issuer approvals, yields, or rewards.

## Stellar verification

`USDC on Stellar` supports an optional server-side, read-only mainnet check through `POST /api/stellar/verify-role`. The response shows a privacy-safe role such as verified holder or verified trustline, never an exact balance or portfolio. Pasted addresses are not persisted. PYUSD and USDY remain Watch/Learn-only until their Stellar lookup paths are unambiguous.

Open a mission from a circle and connect Freighter on Stellar mainnet to complete the seeded proof-of-understanding quiz or submit a source-backed contribution for admin review. Vicus verifies a short-lived SEP-53 wallet message server-side, stores only the linked public key and a hashed session token, and never submits a transaction. No XLM or fee is required. Mission points are derived from approved submissions and are not financial value or blockchain rewards. The old `demo` row remains seed-only; live submissions use the authenticated session user.

See the [Slice 3 verification notes](docs/Vicus_Slice_3_Stellar_Verification.md), [Slice 4 mission notes](docs/Vicus_Slice_4_Missions.md), and [Slice 5A auth notes](docs/Vicus_Slice_5A_Auth.md) for configuration, state behavior, integration evidence, and deferred scope.

## Quality checks

```bash
npm run lint
npm run build
```
