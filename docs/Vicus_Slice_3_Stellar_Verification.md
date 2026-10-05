# Vicus Slice 3: Stellar role verification

Slice 3 adds one narrow, read-only verification path without changing the Slice 1–2 routes, database-backed content model, or watch-first behavior.

## Live path

The `USDC on Stellar` circle is configured for a classic Stellar asset check:

- Network: Stellar mainnet (public network)
- Asset code: `USDC`
- Verification rule: a canonical USDC trustline with a positive balance returns **Verified holder**; a matching trustline without a positive balance returns **Verified trustline**.
- Source: [Circle USDC on Stellar](https://www.circle.com/multi-chain-usdc/stellar)
- Horizon service: `https://horizon.stellar.org`

The canonical code, network, issuer account, verification mode, and source URL are stored on the `assets` table. The server reads that configuration for every request; it does not accept an issuer from the browser.

## Deferred assets

- `PYUSD on Stellar` is marked `sac-deferred`. Its Stellar representation uses the Stellar Asset Contract, so classic trustline verification is not assumed. It remains Watch/Learn-only.
- `USDY on Stellar` is marked `unsupported` until an unambiguous canonical Stellar identifier is available. It remains Watch/Learn-only.
- The category-level treasury education circle has no asset verification configuration.

No issuer or contract identifier is guessed for an unsupported path.

## API

`POST /api/stellar/verify-role` accepts a JSON body with `circleSlug` and a pasted Stellar public address. It performs a server-side mainnet account read and returns only a privacy-safe result:

- `verified-holder`
- `verified-trustline`
- `not-qualified`
- `invalid-address`
- `account-not-found`
- `verification-unavailable`
- `unsupported`

The response contains a role/status, a short explanation, asset code/network context, and a check timestamp. It never returns an exact balance, portfolio data, unrelated assets, issuer account, or a wallet-ownership claim. Pasted addresses are not persisted or logged by Vicus. Watcher remains available without an address or wallet connection.

The dedicated server-only service lives under `src/lib/stellar/`:

- `client.ts` — singleton mainnet Horizon client with a bounded timeout
- `assets.ts` — canonical classic asset construction
- `verify-role.ts` — address validation, account lookup, and role rules
- `types.ts` — privacy-safe result types

## Verification evidence

The following checks were run against the seeded database and a running local app:

```text
USDC mainnet holder fixture       -> 200 / verified-holder
Canonical issuer account          -> 200 / not-qualified
Valid uninitialized account       -> 200 / account-not-found
Malformed address                 -> 200 / invalid-address
PYUSD deferred configuration      -> 200 / unsupported
Unknown circle                    -> 404
```

The mainnet holder fixture was used only for an ephemeral integration request. It is not stored in Vicus seed data, profile data, documentation, or application state.

## Deferred scope

This slice does not add signing, wallet connection, authentication, persistent wallet links, missions, rewards, Soroban, CCTP, cross-chain reads, or settlement. Verification is a temporary read-only result, not a permanent profile role.

## Checks

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:verify
npm run lint
npm run build
```
