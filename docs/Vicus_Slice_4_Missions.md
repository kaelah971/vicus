# Vicus Slice 4: mission participation

Slice 4 added persistent offchain mission participation while preserving the watch-first circle, profile, database, and Stellar verification flows from Slices 1–3. Slice 5A supersedes its demo-only identity path: live submissions now require a signed wallet session, and migration 0005 removes unowned demo submissions.

## Live mission types

### Proof-of-understanding quiz

`Understand USDC on Stellar` is an automatically graded quiz. Its server-held configuration tests:

- what USDC on Stellar represents
- what the entry does not represent
- eligibility and restriction context
- risk and disclosure context

The browser receives question prompts and choices without `correctAnswer`. The server grades the submitted answer map and stores a percentage score. A passing quiz is `approved`; a failed attempt becomes `needs_revision` with zero approved points.

### Text/research contribution

`Write a source-backed USDC explainer` accepts plain text plus an official source URL and enters `pending`. The admin review queue can approve, reject, or request revision. A second seeded research mission exercises the rejection path.

Manual review uses the copy states from Vicus messaging:

- “Your response is waiting for review.”
- “Your response was approved.”
- “Your response needs one more piece of evidence.”
- “This response was not approved. Review the reason and try again if the mission allows it.”

## Data model

Migration `drizzle/0002_bizarre_rockslide.sql` adds structured `missionConfig` and `duplicatePolicy` to `missions`, plus `mission_submissions` with:

- mission/user foreign keys
- plain text content and optional evidence URL
- score and explicit review status
- reviewer, review timestamp, and revision reason
- submitted/updated timestamps
- mission/user uniqueness and review/history indexes

The current seeded missions use `allow-revision`. A user has one submission row per mission; a `needs_revision` row can be resubmitted, while approved, rejected, and pending rows are protected by the duplicate rule.

Approved points are derived from approved submissions joined to mission points. There is no mutable points balance and no `reward_claims` table. Points are an offchain Vicus participation score, not money or a blockchain reward.

## Routes and boundaries

- `/missions/[id]` — mission detail and submission experience
- `POST /api/missions/[id]/submit` — server-validated quiz/text submission
- `POST /api/admin/submissions/[id]/review` — server-validated admin review transition
- `/admin` — Neon-backed pending review queue
- `/profile/demo` — contribution history and derived approved points
- `/circles/[slug]` — mission cards show Start, Pending review, Approved, Needs revision, or Rejected

The browser never sends a user ID, mission points, score, or review status. The server resolves the seeded `demo` participant. This identity is not authenticated, is not linked to a wallet, and cannot authorize money movement. Admin review is a demo shell with the same explicit limitation.

Responses are rendered as text; arbitrary HTML is not accepted or rendered. Mission availability, type, duplicate policy, payload lengths, evidence URLs, and review transitions are validated server-side.

## Deferred scope

This slice does not add authentication, wallet ownership, signing, reward transactions, claimable balances, Soroban, CCTP, issuer onboarding, comments, or a social feed backend. Approving a mission does not imply an onchain reward.

## Neon verification

`npm run mission:verify` exercises the live Neon database and then removes its temporary demo submissions:

- failing quiz → `needs_revision`, zero points
- passing quiz → `approved`, mission points derived
- duplicate quiz submission → rejected
- text submission → `pending`
- admin needs-revision → resubmission → approval
- research submission → rejection
- profile approved total and contribution history → derived correctly
- circle mission card state → updated to approved
- review queue → empty after cleanup

The deterministic seed restores six missions, including the live quiz and manual contribution paths, with zero submissions.
