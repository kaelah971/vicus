# Vicus architecture

This document describes the current implementation only. Reward settlement, claimable balances, Soroban vaults, CCTP, cross-chain identity, and full issuer onboarding are roadmap items and are intentionally not shown as live components.

## System map

```mermaid
flowchart TD
    Browser[Next.js browser UI] --> Router[App Router pages + route handlers]
    Router --> Data[Neon Postgres via Drizzle]
    Router --> Auth[Wallet auth + session service]
    Router --> Missions[Mission service + review rules]
    Router --> Stellar[Server-only Stellar services]
    Auth --> Freighter[Freighter via Stellar Wallets Kit]
    Auth --> SEP53[SEP-53 signed messages]
    Stellar --> Horizon[Stellar mainnet Horizon reads]
    Stellar --> Role[Canonical USDC holder/trustline checks]
```

## Frontend

The Next.js App Router provides the user-facing surfaces:

- `/` — product entry point
- `/explore` — watch-first circle discovery
- `/circles/[slug]` — circle, Asset Passport summary, verification, and mission context
- `/missions/[id]` — quiz or text/research submission experience
- `/profile/me` — authenticated profile and contribution history
- `/admin` — authenticated admin review queue

The browser renders privacy-safe responses. Application JavaScript does not receive quiz answer keys, database credentials, admin signing keys, exact role-check balances, or raw session tokens; the session token is delivered only in an HttpOnly cookie.

## Server and API boundaries

Route handlers keep data access and security-sensitive decisions on the server:

- `POST /api/stellar/verify-role` performs the read-only Stellar role check.
- `POST /api/auth/stellar/challenge` issues a short-lived canonical message.
- `POST /api/auth/stellar/verify` verifies the SEP-53 signature and creates a session.
- `GET /api/auth/session` and `POST /api/auth/logout` manage the current session.
- `GET /api/profile/me` loads the authenticated profile.
- `POST /api/missions/[id]/submit` validates and records a mission submission.
- `POST /api/admin/submissions/[id]/review` applies an authenticated admin review transition.

Server-only modules under `src/lib/` contain the auth, mission, data-access, and Stellar rules. The server reads canonical asset verification configuration from the database rather than accepting an issuer from the browser.

## Data layer

Neon Postgres is accessed through `@neondatabase/serverless` and Drizzle ORM. Migrations live in `drizzle/`; the deterministic seed and verification scripts live in `scripts/`.

The current schema covers:

- users, Stellar wallets, auth challenges, and hashed auth sessions
- assets and circles, including source, eligibility, and disclosure fields
- campaign records and mission definitions
- mission submissions, review state, evidence URLs, and reviewer metadata
- circle memberships and badges

There is no reward-claims table or payout ledger in the current system. Approved Vicus points are derived from approved mission submissions and remain offchain participation data.

## Mission system

Mission configuration is held server-side. The browser receives quiz prompts and choices without the correct answer. The server validates payload shape, availability, duplicate policy, evidence URLs, and review transitions.

The shipped paths are:

- proof-of-understanding quiz: auto-graded to `approved` or `needs_revision`
- text/research contribution: `pending`, then admin `approved`, `rejected`, or `needs_revision`

A live submission requires an authenticated wallet session. Approval awards derived Vicus points; it does not create a blockchain reward.

## Authentication and sessions

1. Stellar Wallets Kit discovers Freighter and requires Stellar mainnet.
2. The server issues a short-lived deterministic message containing the address, network, domain, nonce, and expiry.
3. Freighter signs the message with SEP-53 `signMessage`; no transaction is built or submitted.
4. The server reconstructs the exact message, verifies the signature and signer, consumes the challenge, and links the public key to a user.
5. A random session token is returned only in an HttpOnly, SameSite cookie. The database stores a hash of the token, not the raw token.

A signed message proves control of the selected signing key. It does not establish asset ownership or balance; that remains a separate read-only role check.

## Stellar verification

`src/lib/stellar/` is server-only. The live path uses a bounded Horizon mainnet client and a canonical USDC asset configuration. The role service returns only:

- `verified-holder`
- `verified-trustline`
- `not-qualified`
- `invalid-address`
- `account-not-found`
- `verification-unavailable`
- `unsupported`

Pasted addresses are not persisted or logged by this path. Exact balances, unrelated assets, issuer accounts, and wallet-ownership claims are not returned. Unsupported or deferred assets remain learn/watch-only.

## Security boundaries

- Environment variables are server-only; `.env.local` is ignored.
- Browser payloads cannot choose the user ID, mission points, quiz score, review status, or reviewer.
- Admin review requires an authenticated user with the admin role.
- Auth challenges expire, are consumed, and have bounded verification attempts.
- Session cookies are HttpOnly and SameSite; sessions are revocable and stored by hash.
- The browser never holds a payment or admin signing key.
- No current route submits a payment, creates a claimable balance, or claims a blockchain reward.

## Local verification

```bash
npm run db:migrate
npm run db:seed
npm run db:verify
npm run mission:verify
npm run auth:verify
npm run lint
npx tsc --noEmit
npm run build
```
