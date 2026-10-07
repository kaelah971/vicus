# Vicus Slice 5B — native XLM reward settlement

Slice 5B adds one real reward path without changing SEP-53 authentication, Stellar role verification, mission review, or the existing wallet/session model.

## Scope and current status

The shipped code supports:

- native XLM rewards only
- Stellar Testnet by default
- an explicitly safety-gated Stellar public-network configuration
- approved reward-enabled mission submissions
- direct distributor-to-user Stellar payments
- durable reward claims and receipts in Neon
- transaction envelope recovery metadata

USDC rewards, claimable balances, Soroban vaults, CCTP, issuer treasury funding, and automatic funding are not part of this slice.

The automated verification path uses isolated temporary records and a fake settlement adapter. It does not present mocked transactions as real blockchain activity. Real Testnet settlement requires the manual setup below.

## Reward state machine

A reward row is not created until the user is eligible and claims:

```text
approved mission + XLM amount + verified wallet
                    │
                    ▼
                 eligible
                    │ Claim reward
                    ▼
                 claimable
                    │ durable submission begins
                    ▼
                 submitted
                    │ Horizon confirms
                    ▼
                 confirmed
```

Network or validation failures become `failed` with a safe failure code and recovery message. `expired` is reserved for future campaign expiry behavior.

Eligibility requires:

- an active authenticated Vicus session
- ownership of the approved mission submission
- `rewardAsset = XLM`
- a positive reward amount within the configured maximum
- a linked verified Stellar wallet
- no previously confirmed reward for the submission

A unique database constraint permits one reward claim per mission submission.

## Settlement architecture

1. `POST /api/rewards/submissions/[id]/claim` derives the submission, amount, wallet, network, and destination on the server.
2. A unique `reward_claims` row is created in `claimable` state.
3. A compare-and-set transition moves it to `submitted`.
4. The server loads the destination account and dedicated distributor account from the selected Horizon network.
5. The server builds a normal native-XLM payment with the current distributor sequence and a bounded timeout.
6. The transaction is signed with `VICUS_REWARD_DISTRIBUTOR_SECRET`.
7. The signed envelope and deterministic transaction hash are persisted before submission.
8. Horizon submission or reconciliation moves the claim to `confirmed` with the real hash and ledger.

If a process crashes after the envelope is persisted, retries reuse that signed transaction rather than creating a second payment. If a transaction hash already exists, the service checks Horizon before attempting any resubmission.

## Environment configuration

Add these server-only values to `.env.local`:

```text
VICUS_REWARD_NETWORK=testnet
VICUS_REWARD_DISTRIBUTOR_SECRET=
VICUS_REWARD_MAX_XLM=1
VICUS_ENABLE_MAINNET_REWARDS=false
```

Supported network values are `testnet` and `public`. Public-network settlement is rejected unless `VICUS_ENABLE_MAINNET_REWARDS=true`.

The distributor secret:

- must never use a `NEXT_PUBLIC_` prefix
- is never logged or returned by an API
- is never stored in Neon
- must not be committed to the repository

`VICUS_REWARD_MAX_XLM` is enforced server-side and reward amounts are validated to a maximum of seven decimal places.

## Testnet setup

1. Generate a dedicated distributor keypair locally with a trusted Stellar SDK tool or local script.
2. Put only the secret key in `.env.local` as `VICUS_REWARD_DISTRIBUTOR_SECRET`.
3. Fund the distributor public key with Stellar Testnet Friendbot.
4. Use a recipient public key whose Stellar Testnet account exists. The same public key may be linked to the user's authenticated mainnet wallet, but Testnet account activation is separate.
5. Approve the seeded `Understand USDC on Stellar` mission for the authenticated user.
6. Open `/profile/me` and claim the available XLM reward.

Vicus never calls Friendbot at runtime and never creates a destination account automatically. If the destination is not active, the claim fails with `destination_not_ready` and the UI says that the address is not active on Testnet yet.

## API and receipt behavior

### `GET /api/rewards/me`

Returns only the authenticated user's reward states. Eligible rewards without a claim row are derived from approved submissions; exact reward data is not exposed to other users.

### `POST /api/rewards/submissions/[id]/claim`

Requires same-origin, authenticated session-backed access. The request body is not trusted for reward fields. The server derives:

- asset
- amount
- network
- wallet
- destination

The response returns a safe reward state. Confirmed claims include the real transaction hash and a Horizon link.

### `/rewards/[id]`

The receipt is visible to the owning user or an authorized admin and shows:

- mission and circle
- native XLM amount
- Stellar network
- abbreviated destination
- exact state
- transaction hash when available
- ledger and confirmation time when available
- network-specific Horizon verification link

Testnet copy explicitly states that Testnet XLM has no monetary value.

## Mainnet safety

The public network is supported by the network configuration layer, but it is disabled unless the operator explicitly sets:

```text
VICUS_ENABLE_MAINNET_REWARDS=true
```

This flag is checked server-side before the distributor secret is used. No mainnet transaction is claimed or implied by the default Testnet configuration.

## Verification

```bash
npm run db:migrate
npm run reward:verify
npm run auth:verify
npm run mission:verify
npm run lint
npx tsc --noEmit
npm run build
```

`reward:verify` covers eligibility guards, ownership, server-derived amount and destination, concurrent claims, idempotent confirmed claims, durable failed state, and the mainnet safety gate. It does not submit a real transaction.

## Limitations

- Real Testnet funding and manual transaction acceptance are operator steps.
- There is no automatic distributor funding or balance management.
- Failed transactions with a persisted signed envelope are recoverable by retrying the same envelope; claims without recoverable envelope metadata require operator review.
- Only native XLM is supported.
- Mainnet rewards remain disabled by default.
