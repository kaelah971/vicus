# Vicus — PRD, Build Plan & Technical Architecture

**Product:** Vicus

**Category:** Stellar-first community and campaign layer for tokenized assets

**Purpose:** Define a demo-ready, honest, mobile-first MVP for the Find Your Way: Hackathon.

**Document status:** Target product requirements and build plan. No capability in this document should be described as live unless the implementation has been exercised and evidence is attached.

## Status legend

- **Shipped** — implemented and exercised.
- **Target** — required or intended for the MVP.
- **Roadmap** — intentionally deferred.
- **Hypothesis** — requires validation.

## Contents

1. Product brief
2. Goals and non-goals
3. Personas
4. MVP scope
5. Functional requirements
6. UX flows
7. Technical architecture
8. Logical architecture and data flow
9. Data model
10. Contracts and blockchain flows
11. APIs and services
12. Security, privacy, and compliance
13. Build plan
14. Suggested implementation slices
15. Acceptance criteria
16. Demo plan
17. Metrics
18. Post-hackathon roadmap
19. Open decisions before coding
20. References and research basis

---

## 1. Product brief

Vicus is a Stellar-first product that turns tokenized assets into communities. Users discover asset circles, read an Asset Passport, watch a circle, verify a relevant Stellar relationship, complete missions, earn badges, and claim eligible Stellar rewards. Issuers and campaign managers launch missions, fund or record reward budgets, and measure educated participation.

### Problem

Tokenized assets can exist onchain while remaining difficult to discover, understand, and revisit. Most RWA interfaces behave like dashboards or financial rails. They expose data but do not create a useful social layer around the asset.

### Solution

Create asset-native circles with:

- Asset Passports
- Watch mode before wallet connection
- Privacy-safe holder or trustline verification
- Proof-of-understanding missions
- Badges and contribution records
- Real, bounded Stellar reward claims
- Issuer campaigns and analytics

### Primary user

Crypto-curious users, Stellar users, RWA learners, asset holders, community builders, and creators or researchers who want to understand and participate without first becoming traders.

### Business user

RWA issuers, asset projects, wallets, ecosystems, sponsors, and campaign managers who need educated attention, distribution, and measurable participation.

### Stellar use

Target uses include:

- Asset verification and onchain source data
- Balance or trustline checks where appropriate
- Stellar reward claims or payouts
- Claimable balances
- Sponsored onboarding where safe and budgeted
- Future smart-wallet flows
- Future CCTP-funded campaign treasuries

Claimable balances are a candidate first reward route because they separate creation from later claimant acceptance.[7]

### MVP principle

No fake assets, fake stock ownership, fake lending, fake balances, fake approvals, or fake transaction hashes. Every onchain claim in the demo must be either real and confirmed or explicitly labelled as pending, simulated in a non-production environment, or deferred.

---

## 2. Goals and non-goals

### Goals

1. Build a demo-ready Stellar-first MVP before the submission deadline.
2. Make tokenized assets feel discoverable, social, and understandable.
3. Prove the loop: **explore → watch → learn → verify → complete mission → earn badge or reward → see receipt**.
4. Show meaningful Stellar usage through a real address or trustline check and a real reward or claim state.
5. Create an issuer or admin dashboard that demonstrates a credible business direction.
6. Keep the architecture open to multi-chain profiles and CCTP-funded rewards later.
7. Give judges one polished end-to-end path rather than a wide but shallow feature map.

### Non-goals for the MVP

- A full brokerage or investment product.
- Financial advice, asset recommendations, or expected-return rankings.
- Unrestricted access to regulated assets.
- Complex lending, collateral, or yield products.
- Full multi-chain support before the Stellar-first loop works.
- A complete public social network.
- A production-grade issuer settlement treasury.
- Autonomous money movement without explicit human or bounded policy authorization.

---

## 3. Personas

### 3.1 Watcher

**Context:** Curious about tokenized assets but not ready to connect a wallet.

**Needs:** Understand what an asset represents, follow a circle, complete a beginner mission, and decide whether deeper participation is worthwhile.

**Success:** Can browse, learn, and receive a watcher badge without a wallet.

### 3.2 Verified holder or trustline participant

**Context:** Has a Stellar address and may hold an asset or maintain a relevant trustline.

**Needs:** Prove a role without exposing an exact balance publicly.

**Success:** Receives the correct role badge, sees why it was granted, and can revoke or update the linked address where the product supports that action.

### 3.3 Contributor or creator

**Context:** Writes explainers, submits research, answers missions, or shares useful updates.

**Needs:** Clear evidence requirements, transparent review, visible contribution history, and fair reward rules.

**Success:** A useful contribution becomes an approved record rather than disappearing into an unstructured feed.

### 3.4 Issuer or campaign manager

**Context:** Needs education, distribution, and measurable activity around an asset or campaign.

**Needs:** Define an objective, create missions, set eligibility and budget, review submissions, and see conversion from watcher to informed participant.

**Success:** Can launch a bounded campaign and understand which activities produced useful engagement.

### 3.5 Admin or moderator

**Context:** Protects users and the integrity of the asset directory.

**Needs:** Review submissions, verify issuer pages, manage featured circles, rate-limit abuse, and resolve ambiguous states.

**Success:** Can moderate without editing raw database records.

### 3.6 Judge or demo viewer

**Context:** Has limited time and will evaluate technical execution, Stellar usage, originality, impact, UX, and presentation quality.[1]

**Needs:** See the product’s purpose in seconds and witness one complete, honest workflow.

**Success:** Can describe what Vicus does, why Stellar matters, and what was genuinely built.

---

## 4. MVP scope

The MVP should be compact enough to ship fast but complete enough to feel like a real product.

| Priority | Scope | Status |
|---|---|---|
| P0 — Must have | Landing page, asset directory, three to five circles, Asset Passport, watch mode, address or wallet input, role badges, one mission, points, reward state, claim or payout flow, profile, admin campaign screen | Target |
| P1 — Should have | Proof-of-understanding quiz, public proof page, light feed, simple comments, leaderboard, campaign analytics, anti-spam controls | Target if P0 is stable |
| P2 — Nice to have | Circle seasons, creator bounty review, CCTP-funded treasury demo, smart-wallet or passkey onboarding, EVM/Solana profile linking | Roadmap |

### MVP cut line

If time is limited, preserve these in order:

1. Browse without wallet.
2. Open an Asset Passport.
3. Watch a circle.
4. Complete one mission.
5. Verify one real Stellar relationship.
6. Create or display one real reward claim.
7. Show a receipt with an honest status.

Remove leaderboards, comments, multi-chain, complex campaign analytics, and advanced wallet connection before removing the core loop.

---

## 5. Functional requirements

### 5.1 Landing and discovery

**FR-001 — Mobile-first landing**

The landing page must explain the product within five seconds:

- What it is: a community layer for tokenized assets.
- Who it is for: people learning, following, holding, or growing asset communities.
- What the user can do: explore, watch, verify, contribute, and claim eligible rewards.
- Why Stellar matters: real asset data, role checks, and settlement evidence.

Recommended headline:

> **Tokenized assets need a place to belong.**

Recommended supporting line:

> **Vicus turns Stellar assets into living communities where people can learn, verify participation, contribute, and earn eligible rewards.**

**FR-002 — Explore without wallet**

Users must be able to browse circles without connecting a wallet.

**FR-003 — Directory filters**

The directory should support filtering by:

- Asset or circle name
- Issuer
- Category
- Network
- Status: official, community, pending, education-only

**FR-004 — Clear eligibility state**

A directory card must distinguish:

- Learn and watch
- Verify role
- Complete mission
- Claim reward
- Restricted or issuer-dependent

### 5.2 Asset directory and Asset Passport

**FR-005 — Seeded sources**

Seed three to five real asset or education entries with official links and explicit status. The seed set must be reviewed before demo day.

**FR-006 — Passport fields**

Each passport must include:

- Name
- Asset code
- Issuer
- Network
- Category
- Description
- Intended use
- Eligibility note
- Risk or disclosure note
- Official links
- Supported actions
- Last verified timestamp

**FR-007 — Education-only distinction**

A passport must be able to say that an entry is educational or watch-only. It must not imply broad access to a regulated asset when official eligibility is not established.

**FR-008 — Source provenance**

Every material issuer or asset claim must link to an official source or be labelled as community-provided and pending review.

### 5.3 Authentication and wallet verification

**FR-009 — Address fallback**

Support paste-address lookup as the minimum verification path. Wallet connection may be added if it is faster and does not delay the demo.

**FR-010 — Stellar reads**

The server-side integration should read the minimum data required to evaluate a role, such as balances, trustlines, or transaction relationship, using a reliable Stellar service.

**FR-011 — Role rule engine**

The role engine must support explicit rules such as:

- Watcher: no wallet required.
- Verified holder: an eligible asset balance meets the stated rule.
- Verified trustline: a relevant trustline exists.
- Contributor: an approved mission contribution exists.
- Issuer verified: an admin-approved issuer profile exists.

**FR-012 — Privacy-safe display**

Public profiles show the role and verification date, not an exact balance, unless the user explicitly chooses otherwise.

**FR-013 — Consent**

Store wallet-address ownership only after explicit user consent where signing or persistent linking is supported. A pasted address may create a read-only verification result.

### 5.4 Circles and activity

**FR-014 — Circle page**

A circle page must show:

- Asset Passport summary
- Watch action
- Verification action where applicable
- Pulse or activity feed
- Mission list
- Reward status
- Member or activity counts
- Disclosure and eligibility notes

**FR-015 — Watch mode**

A user can watch or follow a circle without a wallet.

**FR-016 — Mission response**

A user can submit at least one text or quiz response.

**FR-017 — Moderation states**

Submissions support at minimum:

- Pending
- Approved
- Rejected
- Needs revision

Activity must never be framed as investment advice or expected returns.

### 5.5 Missions

**FR-018 — Mission types**

The target model supports:

- Quiz
- Text answer
- Link submission
- Invite
- Research post
- Vote
- Holder or trustline verification

**FR-019 — Mission fields**

Each mission includes:

- Title
- Description
- Circle
- Mission type
- Points
- Reward amount and asset, if any
- Eligibility rule
- Start and end time
- Review mode
- Status
- Duplicate-submission rule

**FR-020 — Proof-of-understanding**

At least one mission must test whether the user understands what the asset represents and which restrictions apply.

**FR-021 — Admin creation**

An authorised admin can create and publish a mission from the dashboard.

### 5.6 Rewards and receipts

**FR-022 — Safe reward asset**

For the hackathon, use XLM or USDC on the chosen network, or another asset only after a specific legal and technical review. Do not use sensitive securities as the reward asset.

**FR-023 — Real state**

A reward claim must be one of:

- Not eligible
- Eligible
- Approved
- Claimable
- Submitted
- Confirmed
- Failed
- Expired

**FR-024 — Onchain proof**

The receipt page shows the transaction hash or claimable-balance identifier when one exists, plus a link to the relevant explorer or status source.

**FR-025 — Abuse prevention**

Enforce one claim per mission/user/wallet where appropriate, idempotent claim creation, rate limits, and admin review for manual missions.

### 5.7 Issuer and admin dashboard

**FR-026 — Circle management**

Create and edit circle metadata, status, source links, disclosure notes, and supported actions.

**FR-027 — Campaign management**

Create a campaign with:

- Objective
- Circle
- Mission sequence
- Eligibility
- Reward budget or planned budget
- Start and end date
- Review policy

**FR-028 — Review queue**

Review, approve, reject, or request revision on submissions.

**FR-029 — Analytics**

Show at minimum:

- Watchers
- Verified roles
- Mission starts
- Mission completions
- Reward claims
- Claim success rate
- Top contributors

Label analytics as product activity, not investment performance.

---

## 6. UX flows

### 6.1 Watcher flow

1. Open Vicus.
2. Browse circles without a wallet.
3. Select a circle.
4. Read the Asset Passport.
5. Review eligibility and risk notes.
6. Select **Watch circle**.
7. Complete a beginner proof-of-understanding mission.
8. Receive watcher badge and points.
9. See the next useful action without being forced to connect a wallet.

### 6.2 Verification flow

1. Open a circle.
2. Select **Verify your role**.
3. Choose paste address or wallet connection.
4. Accept the privacy explanation.
5. Query the relevant Stellar data.
6. Apply the explicit role rule.
7. Show the result and reason.
8. Store only the minimum persistent data with consent.
9. Display the role publicly without an exact balance.

### 6.3 Mission flow

1. Open the Mission Center or a circle mission.
2. Read the objective and reward condition.
3. Complete a quiz, text answer, or link submission.
4. Submit evidence.
5. Receive pending, approved, rejected, or revision state.
6. If approved, show points and reward eligibility.

### 6.4 Reward claim flow

1. User completes an eligible mission.
2. The system auto-grades or an admin approves it.
3. The reward becomes eligible or claimable.
4. The user reviews asset, amount, network, destination, and status.
5. The system creates a claimable balance or payout transaction.
6. The user claims or signs when required.
7. The receipt displays the exact state.
8. The receipt shows hash or claimable-balance identifier.
9. Failed or expired states provide recovery instructions.

The product must not compress all of these states into a single “success” label.

### 6.5 Issuer campaign flow

1. Authorised issuer or admin opens the dashboard.
2. Creates a campaign objective.
3. Selects a circle.
4. Creates or attaches a mission.
5. Sets eligibility, review mode, dates, and reward budget.
6. Funds the reward route or marks the budget as planned.
7. Publishes the campaign.
8. Reviews submissions.
9. Approves eligible rewards.
10. Reads campaign analytics.

---

## 7. Technical architecture

### Recommended stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS or an equivalent tokenised styling layer
- Postgres/Supabase
- Stellar SDK
- Horizon/RPC or a selected indexer/provider
- Claimable balances for the first reward route where practical
- Soroban contract route only if isolated, tested, and genuinely useful

### Frontend

Mobile-first landing, directory, circle pages, profile, mission center, reward receipt, and admin dashboard.

### Backend/API

Next.js route handlers or server actions for:

- Circle and asset metadata
- Passport source data
- Missions and submissions
- Role and wallet lookups
- Reward state
- Campaign analytics
- Idempotency and rate-limit controls

### Database

Postgres or Supabase for users, circles, assets, missions, submissions, badges, rewards, campaigns, analytics events, issuer profiles, and audit records.

### Stellar integration

Use Horizon/RPC or an approved provider for balances, trustlines, and transaction status. Use the Stellar SDK to build claimable-balance or payout transactions. Use Soroban only when the contract surface can be tested end to end.

### Wallets

Start with paste address plus optional wallet support if it is faster to demonstrate. Smart-wallet or passkey onboarding is a roadmap path; Stellar documentation describes smart-wallet accounts and related flows as a future-friendly direction, not a reason to block the MVP.[9]

### Contracts

**Option A — faster MVP:** classic Stellar claimable balances for reward claims.[7]

**Option B — higher build risk:** a small Soroban `RewardVault` contract that manages campaign funding and reward claims.

Recommendation: build Option A first to guarantee a real onchain reward. Add a contract slice only if it can be isolated without putting the acceptance path at risk.

### Indexing

Use simple on-demand reads first. Add background jobs for circle statistics and holder counts only after the synchronous path is reliable.

### Storage

Store text and structured content in the database. Add file or image storage only for approved creator submissions or issuer assets.

---

## 8. Logical architecture and data flow

```text
User / Issuer UI
        |
        v
Next.js App Router
        |
        v
Route Handlers / Server Actions
        |
        +--> Postgres / Supabase
        |
        +--> Role Rules + Reward State
        |
        +--> Stellar Services
                  |
                  +--> Horizon / RPC / Indexer
                  |
                  +--> Stellar Transactions
                  |
                  +--> Claimable Balances or Soroban Contract
```

### External paths

- User opens a circle → API loads asset, circle, passport, mission, and disclosure data from the database.
- User watches a circle → membership or watch event is stored.
- User verifies an address → API queries Stellar → role rules engine evaluates → badge and verification event are stored.
- User completes a mission → API stores submission → auto or manual review determines eligibility.
- User claims a reward → Stellar service builds or submits a transaction → hash and status are stored → receipt page updates.
- Issuer launches a campaign → dashboard writes campaign, mission, and budget state → analytics events aggregate.

### Boundary rules

- Browser code never holds admin signing keys.
- Reward creation is idempotent.
- A parser or model may prepare a mission or campaign draft, but it cannot authorise money movement without the explicit authorised action.
- A UI success message cannot override the transaction status returned by the settlement path.

---

## 9. Data model

### `users`

`id`, `handle`, `display_name`, `avatar_url`, `created_at`, `updated_at`

### `wallets`

`id`, `user_id`, `chain`, `address`, `verified_at`, `verification_method`, `consent_at`, `revoked_at`

### `assets`

`id`, `code`, `issuer`, `chain`, `type`, `name`, `description`, `official_url`, `risk_note`, `eligibility_note`, `source_status`, `last_verified_at`

### `circles`

`id`, `asset_id`, `slug`, `name`, `tagline`, `status`, `category`, `created_by`, `featured_rank`, `official_status`

### `circle_memberships`

`id`, `circle_id`, `user_id`, `role`, `source`, `joined_at`, `left_at`

### `badges`

`id`, `user_id`, `circle_id`, `badge_type`, `metadata`, `awarded_at`, `revoked_at`

### `missions`

`id`, `circle_id`, `campaign_id`, `type`, `title`, `description`, `points`, `reward_asset`, `reward_amount`, `eligibility_rule`, `review_mode`, `status`, `starts_at`, `ends_at`

### `mission_submissions`

`id`, `mission_id`, `user_id`, `content`, `evidence_url`, `score`, `status`, `reviewed_by`, `reviewed_at`, `revision_reason`

### `campaigns`

`id`, `issuer_user_id`, `circle_id`, `objective`, `budget_asset`, `budget_amount`, `budget_status`, `status`, `starts_at`, `ends_at`

### `reward_claims`

`id`, `user_id`, `mission_id`, `campaign_id`, `amount`, `asset_code`, `status`, `tx_hash`, `claimable_balance_id`, `destination_address`, `created_at`, `updated_at`, `idempotency_key`

### `activity_events`

`id`, `user_id`, `circle_id`, `type`, `metadata`, `created_at`

### `issuer_profiles`

`id`, `user_id`, `org_name`, `website`, `verification_status`, `verification_source`, `reviewed_by`, `reviewed_at`

### `audit_events`

`id`, `actor_id`, `entity_type`, `entity_id`, `action`, `before_json`, `after_json`, `created_at`

Audit events are required for admin actions that affect eligibility, rewards, issuer status, or public asset information.

---

## 10. Contracts and blockchain flows

### Option A — Stellar claimable balances

Claimable balances split a payment into creation and later claim by the claimant, which can be useful when the recipient is not ready to receive the asset at the moment of approval.[7]

Target flow:

1. Campaign or admin wallet funds the reward budget.
2. Mission submission is approved.
3. Backend validates idempotency key and eligibility.
4. Backend creates a claimable balance for the user address.
5. System stores claimable-balance ID and creation transaction hash.
6. User claims when ready.
7. System stores claim transaction hash and final status.
8. Receipt page shows each state separately.

### Option B — Soroban `RewardVault`

Higher-risk target only if the contract slice is isolated:

```text
create_campaign(campaign_id, asset, budget, admin)
fund_campaign(campaign_id, amount)
approve_reward(campaign_id, user, mission_id, amount)
claim(campaign_id, mission_id)
```

Suggested events:

```text
CampaignCreated
RewardApproved
RewardClaimed
RewardExpired
```

### Contract and authorization rules

- Contract or payout logic cannot infer eligibility from a UI-only state.
- Admin approvals must be recorded and auditable.
- A reward amount must be bounded by campaign budget.
- Duplicate claims must fail safely and return the existing state.
- Secrets and signing keys remain server-side.
- Testnet and mainnet labels must be visible in every relevant screen.

---

## 11. APIs and services

| Endpoint | Purpose | Status |
|---|---|---|
| `GET /api/circles` | List circles with filters | Target |
| `GET /api/circles/[slug]` | Circle details, passport, missions, and stats | Target |
| `POST /api/circles/[slug]/watch` | Join as watcher | Target |
| `POST /api/wallets/verify` | Query Stellar and assign role | Target |
| `GET /api/users/[handle]` | Public profile | Target |
| `POST /api/missions/[id]/submit` | Submit mission response | Target |
| `POST /api/admin/missions/[id]/review` | Approve, reject, or request revision | Target |
| `POST /api/rewards/[id]/claim` | Create or submit claim | Target |
| `GET /api/rewards/[id]` | Reward status and transaction proof | Target |
| `GET /api/admin/campaigns/[id]/analytics` | Campaign statistics | Target |

### API design constraints

- Validate all input server-side.
- Return structured status values, not only booleans.
- Use idempotency keys for state-changing reward operations.
- Avoid returning exact balances to public clients.
- Log provider errors without leaking secrets or raw credentials.
- Keep provider-specific details behind a service boundary so the first provider can be replaced.

---

## 12. Security, privacy, and compliance

1. Do not expose exact wallet balances publicly.
2. Public roles should say watcher, verified holder, verified trustline, contributor, or issuer verified—not “wealth” or “portfolio size.”
3. Add a clear statement that Vicus is an educational and social product, not financial advice.
4. Do not rank assets as safe, best, or likely to return more.
5. Treat regulated assets as watch or education circles unless official issuer rules allow more.
6. Use XLM or USDC rewards for the MVP rather than securities.
7. Rate-limit mission submissions and reward claims.
8. Make reward creation idempotent to prevent double claims.
9. Keep admin keys outside the frontend.
10. Use environment variables and minimal server-side signing only where necessary.
11. Label testnet clearly; if mainnet is used, use tiny amounts and show the risk.
12. Track sponsored-reserve obligations carefully if onboarding is subsidised.[8]
13. Add audit events for admin and reward actions.
14. Provide error recovery rather than leaving users with an unexplained failed state.
15. Do not include private keys, seed phrases, credentials, or sensitive treasury addresses in documentation or demo fixtures.

---

## 13. Build plan

Assume a fast build with one main builder and AI-assisted development. Each day should produce a shippable slice. Do not repeatedly audit the entire repository while the demo path is incomplete.

### Day 1 — Product skeleton

- Initialize Next.js application.
- Establish Vicus tokens, typography, layout, and mobile breakpoints.
- Build landing page.
- Build static directory, circle page, profile shell, and admin shell.
- Write the first demo script.

**Exit condition:** A visitor understands Vicus and can click through a convincing static discovery loop.

### Day 2 — Database and content model

- Create Postgres/Supabase schema.
- Seed assets, circles, passports, missions, and user fixtures.
- Build read paths for directory, circle, passport, and missions.

**Exit condition:** Core screens read from the database rather than hardcoded page copies.

### Day 3 — Address verification

- Implement paste-address lookup.
- Query Stellar service.
- Implement explicit role rules.
- Store privacy-safe verification event.
- Display badge and reason.

**Exit condition:** A real or controlled test address produces a reproducible role result without exposing an exact balance.

### Day 4 — Missions and submissions

- Build mission center.
- Implement quiz or text submission.
- Add points and status model.
- Add admin review queue.

**Exit condition:** A user can complete one mission and an admin can approve or reject it.

### Day 5 — Rewards

- Select claimable balance or payout route.
- Implement eligibility and idempotency checks.
- Submit a real controlled reward.
- Store transaction or claimable-balance identifiers.
- Build receipt and failure states.

**Exit condition:** The demo has one real or explicitly verified test transaction path and no fabricated hash.

### Day 6 — Issuer campaign dashboard

- Create campaign form.
- Create mission form.
- Add budget state.
- Add analytics cards.
- Add submission review links.

**Exit condition:** An issuer/admin can create a campaign and see its basic activity.

### Day 7 — Polish and demo

- Mobile QA.
- Seed final source-backed content.
- Add empty, loading, error, and restricted states.
- Tighten copy.
- Record the demo path.

**Exit condition:** The demo can be completed without narration rescuing confusing screens.

### Day 8 — Hardening

- Review authorization boundaries.
- Test duplicate-claim prevention.
- Test failed transaction and stale-provider states.
- Add disclaimers.
- Verify documentation and README claims.

**Exit condition:** No known critical path allows a duplicate claim, false confirmation, or public balance leak.

### Day 9 — Submission packaging

- Record demo video.
- Finalise repository documentation.
- Export architecture diagram.
- Prepare pitch text.
- Run deployment checks.
- Re-check the live Stellar Passport deadline and submission schema.[1]

**Exit condition:** A judge can clone or open the project, understand what is real, and see the strongest workflow quickly.

---

## 14. Suggested implementation slices

1. **Slice 1 — Static premium UI:** landing, explore, circle, profile, and admin shell.
2. **Slice 2 — Database-backed circles:** assets, circles, missions, profiles, and passport data.
3. **Slice 3 — Stellar address verification:** real lookup, role rules, and privacy-safe display.
4. **Slice 4 — Missions:** quiz or text completion, points, and admin review.
5. **Slice 5 — Rewards:** real Stellar claim or payout, receipt, and transaction status.
6. **Slice 6 — Campaign dashboard:** issuer campaign creation and basic analytics.
7. **Slice 7 — Final polish:** mobile behaviour, error states, story, deployment, and demo script.

Each slice should be independently testable and should leave the product in a usable state.

---

## 15. Acceptance criteria

The target MVP is acceptable when:

- A user can browse circles without a wallet.
- A user can open an Asset Passport and understand what the asset is, what it represents, and what restrictions apply.
- A user can watch a circle.
- A user can paste a Stellar address or use the selected wallet path.
- The system can assign the correct role or explain why verification did not qualify.
- A user can complete at least one mission.
- An admin can approve or reject a submission.
- A user can claim or receive a real Stellar reward, or see a clearly labelled pending state with the reason.
- A receipt shows the correct transaction or claimable-balance proof when available.
- Duplicate reward claims are prevented.
- An issuer/admin can create a campaign and see basic analytics.
- The app clearly avoids financial advice and regulated-asset overclaims.
- The demo has at least one real transaction or an honestly labelled testnet proof.
- Mobile layout works for the principal flow.
- Empty, loading, restricted, rejected, and failed states are understandable.
- No supplied documentation or UI claim describes a roadmap capability as shipped.

---

## 16. Demo plan

### Demo story

1. Open Vicus: “Tokenized assets can exist onchain and still have nowhere to belong.”
2. Browse circles without a wallet.
3. Open a circle and show the Asset Passport.
4. Explain what the asset represents and what the user can or cannot do.
5. Watch the circle.
6. Complete a proof-of-understanding mission.
7. Verify a Stellar address and show a role badge without exposing the balance.
8. Claim a small real XLM or USDC reward, or show the claimable state if the user has not claimed yet.
9. Open the receipt with transaction proof.
10. Switch to the issuer dashboard and show campaign analytics.
11. Close with cross-chain profiles and funded campaign treasuries as roadmap, not live functionality.

### Demo discipline

- Never use a fake transaction hash.
- Never imply a user bought a regulated asset.
- Never hide testnet status.
- Do not spend the demo on a feature that is not part of the core loop.
- Show the exact reason Stellar is involved at each onchain step.

---

## 17. Metrics

### User growth

- New watchers
- Circle follows
- Profile creations
- Verification attempts
- Verified roles

### Learning

- Passport views
- Explainer completion
- Quiz completion
- Proof-of-understanding pass rate
- Mission revision rate

### Community

- Useful posts
- Approved research contributions
- Missions completed
- Repeat visits
- Circle follows over time

### Rewards

- Eligible rewards
- Claims created
- Claims confirmed
- Claim success rate
- Duplicate-claim attempts blocked
- Total distributed
- Cost per completed mission

### Issuer value

- Campaign completions
- Watcher-to-verified conversion
- Watcher-to-mission conversion
- Top contributors
- Analytics views

### Stellar value

- Stellar wallet interactions
- Trustline or balance checks
- Reward transactions
- Claimable balances created and claimed
- Future CCTP-funded campaigns, if implemented later

Metrics describe activity, not investment performance.

---

## 18. Post-hackathon roadmap

| Timeline | Roadmap |
|---|---|
| Month 1 | Harden Stellar MVP, onboard the first five to ten circles, improve verification, mission review, and receipts. |
| Month 2 | Issuer beta: campaigns, sponsored reward budgets, better analytics, and official circle verification. |
| Month 3 | Creator and research bounty workflow, seasons, and API or widget embeds for wallets and issuer sites. |
| Month 4+ | Cross-chain identity, CCTP-funded treasuries, smart-wallet or passkey onboarding, and official issuer partnerships. |

Roadmap features must not appear in the hackathon demo as if they already exist.

---

## 19. Open decisions before coding

1. Final reward route: claimable balances versus a simpler payout transaction.
2. Testnet versus tiny mainnet rewards.
3. Which three to five circles have sufficiently clear source and eligibility information.
4. How strict role verification should be for assets with restricted access.
5. Whether the admin dashboard is labelled issuer, sponsor, campaign manager, or moderator.
6. Whether the first user authentication is address-only, passkey-assisted, or wallet-assisted.
7. Whether comments are cut from the MVP to protect the learning and reward loop.
8. What minimum source-review process is required before a circle becomes official.
9. The exact live submission deadline and fields shown on Stellar Passport at the moment of delivery.[1]

---

## 20. References and research basis

The product requirements preserve the supplied product brief and build architecture. External competition, language, and protocol claims are linked in the source list below. The original PDFs remain the source artifacts; this file is the editable Vicus replacement.

## Sources

[1] https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
[7] https://developers.stellar.org/docs/build/guides/transactions/claimable-balances
[8] https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves
[9] https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets
