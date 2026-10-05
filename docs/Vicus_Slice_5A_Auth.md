# Vicus Slice 5A — signed wallet sessions

Slice 5A adds authenticated Vicus participation without adding settlement.

## Authentication flow

1. The browser uses Stellar Wallets Kit v2 for Freighter discovery/connection and requires the wallet to be on Stellar mainnet.
2. `POST /api/auth/stellar/challenge` asks the server for a short-lived, deterministic human-readable message containing the selected mainnet address, network, Vicus domain, nonce, issue time, and expiry.
3. Freighter signs that message through `@stellar/freighter-api` `signMessage`. This is SEP-53 signing, not transaction signing.
4. `POST /api/auth/stellar/verify` reconstructs and validates the exact canonical message, verifies the SEP-53 signature against the address in the message, and rejects tampering or signer mismatch.
5. The challenge is atomically consumed and limited to five verification attempts. Only the message hash is retained while it is pending; no pasted address is stored. A verified public key is linked to a Vicus user and `stellar_wallets` row, then a random session token is hashed into `auth_sessions`.
6. The raw token is returned only as an HttpOnly, SameSite cookie. Mission and profile APIs derive the user from that cookie; browser payloads cannot supply a user ID, points, score, or review state.

A successful signature proves control of the signing key corresponding to the selected Stellar address. It does not prove account balance, asset holdings, or multisig threshold authority. Asset-role verification remains a separate read-only network lookup.

The message is never submitted to Stellar, cannot authorize a payment, and requires no XLM or transaction fee.

## Server configuration

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL` — server-only Neon URL.
- `VICUS_APP_URL` — browser origin, HTTPS outside local development.
- `VICUS_HOME_DOMAIN` — domain value bound into the message.
- `VICUS_ADMIN_WALLET_ADDRESSES` — optional comma-separated mainnet keys that receive the seeded admin role when linked.

## Routes

- `GET /api/auth/session` — no-store authenticated session summary.
- `POST /api/auth/logout` — revokes the current server session and clears the cookie.
- `POST /api/auth/stellar/challenge` — issues an expiring SEP-53 message for a valid mainnet public key.
- `POST /api/auth/stellar/verify` — verifies the exact signed message, links the wallet, and creates a session.
- `GET /api/profile/me` — authenticated profile and contribution history.
- `/profile/me` — authenticated profile surface.

The read-only pasted-address role check at `/api/stellar/verify-role` remains separate. It never creates a user, links a wallet, or persists the pasted address.

## Mission boundary

Mission submissions now use the authenticated session's user ID. Migration `0005_remove_demo_submission_identity.sql` removes Slice 4 submissions that were authored by the unauthenticated `demo` identity because they cannot be honestly attributed to a wallet. The `demo` row remains only as deterministic development content and an internal verification actor; production mission routes never resolve or accept that identity. Review actions require an authenticated admin session.

Approved Vicus points remain derived offchain participation state. There are no payouts, claimable balances, signing for payments, reward transactions, or wallet balance displays.

## Verification

```bash
npm run auth:verify
npm run db:migrate
npm run db:seed
npm run db:verify
npm run mission:verify
npm run lint
npx tsc --noEmit
npm run build
```

`auth:verify` checks valid SEP-53 signatures, wrong signers, altered messages, address mismatch, domain binding, expiry, replay/consumption, session creation, sign-out revocation, and authenticated mission identity. Browser acceptance should connect a zero-XLM Freighter mainnet account, sign a message, submit a mission, refresh `/profile/me`, and disconnect; no Stellar transaction or hash should appear in Horizon. The extension-dependent approval step must be run in a browser with Freighter installed.
