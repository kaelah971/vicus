# Vicus — Full Product Idea

**Product concept:** Make tokenized assets social, understandable, and alive on Stellar.

**Prepared for:** Find Your Way: Hackathon — research and build phase

**Document status:** Product strategy and target-state concept. Unless a capability is explicitly labelled **Shipped**, treat it as a target, roadmap item, or hypothesis rather than a live feature.

## Status legend

- **Shipped** — implemented and exercised with evidence.
- **Target** — part of the proposed hackathon MVP or build plan.
- **Roadmap** — intentionally deferred until after the hackathon.
- **Hypothesis** — a strategic belief that requires user or issuer validation.

## Contents

1. Executive thesis
2. Why this direction is stronger
3. Hackathon context
4. Market inspiration
5. Why Stellar is the right home
6. The core product
7. The product loop
8. Key features
9. Business model
10. Multi-chain and ecosystem strategy
11. Value to Stellar
12. Moat and edge
13. Hackathon MVP — no mock
14. Risks and guardrails
15. Pitch narrative
16. Evidence, assumptions, and open validation

---

## 1. Executive thesis

Vicus turns tokenized assets into living communities: watchers learn, holders verify participation, contributors create useful culture, issuers run campaigns, and eligible activity can earn real Stellar-based rewards.

The product is not another wallet, another RWA dashboard, another lending protocol, or another payment link. Those products can be useful, but they do not solve the distribution problem around tokenized assets.

**The thesis:** Stellar can host serious tokenized assets, but an asset does not become a movement by existing onchain. People need a place to discover it, understand it, discuss it, prove participation, and build identity around it. Vicus gives each asset a home.

### The core promise

> **Vicus gives every tokenized asset a place to be understood, followed, and participated in.**

### Recommended public expression

- **Category descriptor:** The community layer for tokenized assets.
- **Primary tagline:** Where assets find their people.
- **Hero headline:** Tokenized assets need a place to belong.
- **Supporting line:** Explore Stellar assets, learn what they represent, prove your role, and earn your way into the community.

### What makes the idea worth building

A wallet can hold assets, show balances, and sign transactions. Vicus adds the layer a wallet does not naturally provide:

- Asset-native communities
- Education and proof-of-understanding
- Privacy-safe holder and watcher roles
- Missions, contributions, and reputation
- Issuer-funded campaigns
- Transparent reward receipts and campaign analytics

Vicus sits **above the wallet**. The wallet is an identity and settlement layer; Vicus is the social, learning, campaign, and distribution layer.

---

## 2. Why this direction is stronger

Earlier concepts such as payment links, protected checkout, escrow, payout desks, and generic stablecoin receipts are useful patterns, but they remain close to existing wallet or messaging workflows. They do not create a sufficiently deep product surface or a strong reason for people to return.

The stronger direction is to make the product do something a wallet cannot do: create an ongoing place where an asset is understood, discussed, verified, and supported by campaigns.

| Alternative | What it already does well | What it does not naturally provide | Vicus opportunity |
|---|---|---|---|
| Wallet | Holds, sends, displays, and signs | Asset-native culture, learning, roles, missions, campaign analytics | Become the participation layer around the wallet |
| Direct message | Coordinates two or more people informally | Public asset communities, proof, repeatable reward programs, analytics | Turn informal coordination into an observable product loop |
| RWA dashboard | Displays asset data and issuer information | Belonging, contribution, education loops, identity, return visits | Make serious asset information useful and alive |
| Marketplace | Helps users discover or transact | Trustworthy education, campaign participation, reputation | Start with understanding and participation rather than trading |
| Generic loyalty product | Rewards activity | Asset-specific proof and Stellar-native settlement | Attach rewards to meaningful asset understanding |

### Strategic choice

Vicus should lead with **educated participation**, not financial speculation.

That means the product should reward:

- Understanding what an asset represents
- Following a verified circle
- Contributing useful research or explanations
- Proving an eligible relationship to an asset
- Completing issuer-defined campaigns

It should not rank assets as investments, imply expected returns, or turn regulated assets into unrestricted reward instruments.

---

## 3. Hackathon context

The official Stellar Passport listing describes Find Your Way as a hackathon for turning ideas into working Stellar projects and lists teams of one to five, a General Track, a University Track, and a total prize pool of US$5,000.[1] The General Track explicitly welcomes projects involving payments, financial inclusion, tokenization, smart contracts, developer tools, wallets, identity, commerce, education, and public goods.[1]

The official judging language names six relevant criteria:

1. Technical execution
2. Meaningful use of Stellar
3. Originality
4. Potential impact
5. User experience
6. Presentation quality

Vicus can address all six without competing head-on with the most obvious wallet, payment, or x402 submissions:

- **Technical execution:** real Stellar address or trustline lookup, mission state, reward eligibility, transaction proof, and a usable issuer workflow.
- **Meaningful Stellar use:** wallet verification, Stellar assets, claimable balances or payouts, and an auditable receipt.
- **Originality:** a social and education layer around tokenized assets rather than another asset rail.
- **Impact:** help serious assets acquire understandable, repeatable, educated attention.
- **User experience:** watch first, connect when useful, see the reason for each action, and keep public roles privacy-safe.
- **Presentation:** one complete loop that can be shown from discovery to onchain proof.

The Luma event page and the Build on Stellar announcement contain different deadline references from the live Stellar Passport page. The live platform page is the operational source to check immediately before submitting; the discrepancy should be treated as a submission risk, not silently ignored.[1][2][3]

### Competitive posture for the event

Vicus should not pitch itself as “a better wallet” or “the future of finance.” Those frames make it look generic and invite direct comparison with deeper infrastructure products.

Pitch it as:

> **The participation and distribution layer that helps tokenized assets become understandable communities.**

---

## 4. Market inspiration

Vicus takes a strategic lesson from Daybreak: an asset can be the starting point for a community, and community activity can create a feedback loop around that asset.[11][12]

Vicus should not copy Daybreak’s product, language, or visual identity. Daybreak is centred on tokenized stocks and culture around equities. Vicus adapts the broader insight to Stellar:

| Dimension | Daybreak insight | Vicus adaptation |
|---|---|---|
| Starting point | A supported stock | A Stellar tokenized asset or asset category |
| Social surface | A circle around a holding | A circle around a tokenized asset, whether watched or verified |
| Participation | Create culture and activity | Learn, explain, research, vote, complete missions, and contribute |
| Reward logic | Activity can flow back toward ownership | Eligible activity can earn badges, reputation, or Stellar rewards |
| Business value | Community and asset attention | Education, distribution, issuer campaigns, and transparent analytics |

### The important distinction

Vicus is not a memestock product first. It is an RWA community, education, and distribution layer with lighter social mechanics wrapped around serious assets.

That distinction protects the product from drifting into:

- Investment advice
- Return promises
- Asset rankings presented as recommendations
- Fake access to regulated securities
- A short-lived engagement game with no issuer value

---

## 5. Why Stellar is the right home

Stellar publishes material on tokenized investment assets including funds, bonds, securities, commodities, and other asset categories.[6] Its transaction primitives can support the product’s intended loop: asset discovery, role verification, campaign rewards, claimable balances, sponsored onboarding, and future smart-wallet flows.

| Stellar primitive | Vicus use |
|---|---|
| Tokenized assets | Asset circles can centre on stablecoins, yield or treasury assets, and other tokenized investment categories where eligibility is clear. |
| Horizon/RPC or an indexer | Read balances, trustlines, and transaction status for verification and receipts. |
| Claimable balances | Create a reward claim that can be accepted later, useful when the recipient is not yet ready to receive the asset.[7] |
| Sponsored reserves | Reduce onboarding friction where sponsoring account or trustline reserves is appropriate and safely budgeted.[8] |
| Soroban | Optional campaign and reward logic if the contract slice is sufficiently small and testable. |
| Smart wallets and passkeys | Roadmap path for less intimidating onboarding and bounded signing flows.[9] |
| CCTP | Roadmap path for moving USDC into Stellar-funded campaign treasuries without making cross-chain support a launch dependency.[10] |

### Guardrail

Stellar is a settlement and participation rail for Vicus, not a reason to make unsupported claims. The brand should show the network doing meaningful work in the product rather than displaying a chain logo as decoration.

---

## 6. The core product

### For users

Discover tokenized assets, join circles, learn what they represent, prove a relevant role when useful, complete missions, build a public contribution record, and claim eligible Stellar rewards.

### For issuers and campaign managers

Create a verified asset presence, educate users, fund missions, reward meaningful participation, and understand which activities create informed attention.

### For Stellar

Give tokenized assets a consumer-facing social front door that creates wallet interactions, trustline checks, mission completions, reward claims, and repeat visits.

### Core product surfaces

#### Home / Explore

A mobile-first front door where users can browse without a wallet. It should feel like discovering places and communities, not opening a trading terminal.

#### Asset Circle

The living page for an asset. It combines:

- Asset Passport
- Watch and verification actions
- Pulse feed
- Missions
- Reward pool status
- Contributor and member activity
- Claim history
- Clear eligibility and risk notes

#### Asset Passport

A serious, structured profile that prevents the product from becoming empty social noise. It should state:

- Asset name and code
- Issuer
- Network
- Category
- What the asset represents
- Intended use
- Eligibility or geographic restrictions
- Risk and disclosure notes
- Official links and source documents
- Supported Vicus actions
- Relevant onchain identifiers when appropriate

#### User Profile

A user-controlled record of:

- Circles followed
- Watcher and verified-holder badges
- Completed missions
- Reputation or contribution history
- Rewards claimed
- Research and explainer contributions

Public profiles must show roles and proof categories, not exact balances by default.

#### Mission Center

A structured place for quizzes, explainers, research tasks, invitations, votes, and issuer-sponsored campaigns. Mission design must favour understanding and useful contribution over empty clicks.

#### Issuer Campaign Dashboard

A business surface for:

- Creating a campaign
- Defining an objective and circle
- Funding or recording a reward budget
- Creating missions
- Reviewing submissions
- Tracking watchers, verified roles, completions, claims, and contributors

---

## 7. The product loop

1. **Discover** — A user lands on the home page or receives a circle link.
2. **Watch first** — The user follows a circle without connecting a wallet.
3. **Learn** — The user reads the passport, explainers, risk notes, and community updates.
4. **Verify** — The user connects or pastes a Stellar address when a role requires it.
5. **Participate** — The user completes a mission, contributes research, votes, invites, or joins a campaign.
6. **Earn** — The user receives points, badges, reputation, and eligible Stellar rewards.
7. **Bring value home** — The circle grows, issuers gain educated distribution, and Stellar sees useful wallet, trustline, and transaction activity.

The loop is deliberately ordered. The user should not need to connect a wallet before understanding why the circle exists.

---

## 8. Key features

### 8.1 Circles

Each asset or asset category can have a home. Example launch circles could include:

- USDC on Stellar
- PYUSD on Stellar
- USDY on Stellar
- A BENJI education circle, subject to issuer and eligibility boundaries
- Stellar RWA education
- Tokenized treasury education

Circles may be official, community-created, or pending verification. The status must be visible so that community energy is not confused with issuer endorsement.

### 8.2 Watcher and verified-holder badges

| Badge | Meaning |
|---|---|
| Watcher | Follows a circle without a wallet requirement |
| Verified Holder | A permitted wallet check matches the circle’s eligibility rule |
| Verified Trustline | The relevant trustline relationship is confirmed |
| Early Circle Member | Joined before a defined milestone |
| Researcher | Published useful material that passed review |
| Signal Maker | Shared a timely, verified update |
| Issuer Verified | Represents an approved issuer or project |
| Liquidity Contributor | Roadmap-only until the relevant action and compliance model are real |

Badges should describe a role or contribution. They should not imply wealth, investment quality, or a guaranteed reward.

### 8.3 Asset Passport

The passport is the product’s credibility anchor. It should keep a circle useful even when the user does not participate socially.

Required fields:

- Issuer and asset code
- Network and asset identifier
- Asset category
- What it represents
- How it is intended to be used
- Eligibility notes and restrictions
- Risk and disclosure notes
- Official links and source documents
- Supported actions
- Last verified timestamp

For regulated assets, the passport must distinguish “learn and watch” from “verify or claim.” Do not imply that every user can purchase or earn a regulated asset.

### 8.4 Missions and quests

Mission examples:

- Explain USDY in one sentence.
- Complete a PYUSD proof-of-understanding quiz.
- Publish a beginner guide to tokenized treasuries.
- Compare two assets using the official source material.
- Join a discussion and answer a structured question.
- Vote on the next asset spotlight.
- Submit a research link with a short explanation.
- Invite a new watcher.

Each mission needs:

- Title and plain-language description
- Circle
- Points
- Reward amount, if any
- Eligibility rule
- Start and end time
- Review mode
- Abuse or duplicate-submission rule
- Evidence requirement when relevant

### 8.5 Real Stellar rewards

Rewards should be real but small and bounded for the hackathon. Use XLM or USDC on the chosen network rather than sensitive securities. The first implementation should favour a classic claimable-balance route because it is easier to explain and demonstrate.[7]

The product must never fake a purchase, a balance, an approval, or a transaction hash. The reward receipt should distinguish:

1. Eligible
2. Approved
3. Claim created
4. Claim submitted
5. Transaction confirmed
6. Claim failed or expired

### 8.6 Circle Treasury

A circle can display a budget or treasury supplied by an issuer, sponsor, community, grant, or campaign budget. The treasury funds missions, research bounties, quizzes, and contributor rewards.

This is a future business surface, not permission to imply that Vicus custody is already live. The MVP may show a campaign budget state rather than a full treasury management product if the real funding flow is not implemented.

### 8.7 Issuer Campaign Dashboard

Example campaign:

> Educate 1,000 users about our asset.

An issuer could define:

- Audience
- Circle
- Learning objective
- Mission sequence
- Eligibility rule
- Reward budget
- Review policy
- Start and end date
- Success metrics

The dashboard should prioritise informed attention over vanity impressions.

### 8.8 Cross-chain profile

**Roadmap.** Users may eventually link Stellar, EVM, Solana, and social identities to build a portable community record. Stellar should remain the launch settlement and reward rail. Cross-chain linking must not become a prerequisite for the first useful loop.

### 8.9 Asset Pulse

The circle feed should combine:

- Issuer announcements
- Community posts
- Research links
- Mission launches
- Top contributions
- Reward events
- Watchlist changes
- Verification and campaign updates

Moderation and provenance matter more than volume. A smaller reliable feed is better than a noisy stream of unverified claims.

### 8.10 Seasons and Circle Wars

**Roadmap.** Circles may compete on education and participation, not investment returns. Useful categories include:

- Most new watchers
- Most verified roles
- Best educational post
- Highest mission completion
- Most useful research contribution
- Fastest-growing learning circle

Avoid financial performance rankings. They would pull the brand toward speculation and create unnecessary regulatory risk.

### 8.11 Proof-of-understanding

Before selected badges or rewards, a user can complete a short quiz showing they understand:

- What an asset represents
- What it does not represent
- What eligibility restrictions apply
- What risks or uncertainties are disclosed

This gives issuers a better form of attention: users who are not merely present, but informed.

### 8.12 Creator and research bounties

**Roadmap or controlled P1.** Contributors could earn for creating:

- Simple explainers
- Asset comparisons
- Local-language guides
- Risk summaries
- Short research notes
- Video walkthroughs

A review layer is essential. The product must reward useful evidence, not volume or promotional claims.

---

## 9. Business model

| Revenue path | Description | Status |
|---|---|---|
| Issuer campaign fees | Issuers pay to launch education, awareness, and reward campaigns. | Hypothesis |
| Sponsored circles | Official or verified circles receive featured placement under clear labelling. | Hypothesis |
| Reward distribution fee | A small fee on funded reward programmes. | Hypothesis |
| Premium analytics | Issuer dashboards for engagement, role conversion, and campaign performance. | Hypothesis |
| API and widgets | Embed passports, proof-of-understanding, or reward modules into wallets and issuer sites. | Roadmap |
| Creator marketplace fee | Platform fee on approved research or creator bounties. | Roadmap |
| Long-term protocol layer | Subject to legal and operational review; any value routing must be transparent. | Roadmap |

The hackathon product should demonstrate the issuer workflow without pretending revenue is already validated.

---

## 10. Multi-chain and ecosystem strategy

Stellar should be first, not necessarily the only network forever.

| Phase | Expansion | Status |
|---|---|---|
| 1 | Stellar asset directory, wallet proof, circles, missions, claimable rewards, issuer campaigns | Target MVP |
| 2 | EVM and Solana wallet linking for portable community identity | Roadmap |
| 3 | CCTP-funded reward treasuries where the funding path is real and tested | Roadmap |
| 4 | Cross-chain asset circles with Stellar as a useful reward and campaign rail | Roadmap |
| 5 | Issuer growth network for tokenized assets across ecosystems | Hypothesis |

Expansion should strengthen the core concept rather than make the launch product a shallow multi-chain directory.

---

## 11. Value to Stellar

Vicus can:

- Make tokenized assets discoverable and understandable to normal users.
- Create a social front door for Stellar asset categories.
- Drive wallet lookups, trustline checks, and reward claims.
- Give issuers a reason to launch and promote asset communities.
- Bring outside attention and future campaign funding into Stellar.
- Show a consumer-friendly side of Stellar’s institutional and RWA narrative.
- Build culture around serious assets instead of leaving them in cold dashboards.

These are strategic outcomes to prove, not guaranteed results.

---

## 12. Moat and edge

| Moat | What compounds |
|---|---|
| Data | Passport metadata, issuer profiles, participation history, mission completions, and proof-of-understanding records |
| Community | Active circles, roles, contributors, researchers, and social identity |
| Issuer | Campaign relationships, analytics, repeat sponsored programmes, and verified asset pages |
| Protocol | Reward and claim flows, campaign rules, future treasuries, and wallet onboarding |
| Brand | An approachable culture around serious assets rather than another cold financial dashboard |

The moat is not the circle UI alone. It is the combination of trusted asset context, useful participation, issuer distribution, and verifiable outcomes.

---

## 13. Hackathon MVP — no mock

The MVP should be narrow but real. It should prove the community and reward loop without pretending that users bought regulated assets.

### Target MVP

1. Landing page: “Tokenized assets need a place to belong.”
2. Asset directory with three to five real Stellar asset or education entries, each with eligibility and source notes.
3. Circle pages with Asset Passport, activity, missions, and reward status.
4. Wallet connection or paste-address fallback for real Stellar lookups.
5. Watcher and verified-role badges.
6. One proof-of-understanding mission.
7. One real Stellar reward flow using a claimable balance or a deliberately smaller payout slice.
8. Receipt page with transaction status and hash when confirmed.
9. Issuer/admin campaign screen for creating a mission and reviewing or approving it.
10. Public profile showing roles, contributions, and completed missions without public balances.
11. Demo script that shows the full loop.

### Deliberately cut from the MVP

- Full brokerage or investment product
- Unrestricted regulated-asset rewards
- Complex lending, collateral, or yield products
- Full multi-chain support
- Full social network features
- Large creator marketplace
- Circle seasons unless the core loop is already stable
- Smart-wallet onboarding unless it is genuinely easier than the fallback

---

## 14. Risks and guardrails

| Risk | Guardrail |
|---|---|
| Financial advice | Use neutral educational language. Do not rank assets as good or bad investments. |
| Regulated assets | Use watch-and-learn states unless issuer rules explicitly permit more. |
| Reward abuse | Enforce one claim per mission/user/wallet, rate limits, duplicate checks, and manual review where needed. |
| Privacy | Display roles and proof categories, not exact balances. Store address ownership only with consent. |
| False proof | Never invent assets, balances, approvals, transaction hashes, or issuer status. |
| Overbuilding | Ship the discovery → learn → verify → mission → reward → receipt path first. |
| Custody confusion | Make it clear that Vicus is not a custodian or brokerage unless that status changes and is legally reviewed. |
| Copy risk | Build data, issuer relationships, reputation, and trusted education—not only a circle-shaped UI. |
| Chain dependency | Keep Stellar use meaningful but isolate future cross-chain work from the first loop. |

---

## 15. Pitch narrative

### Short pitch

> Stellar has serious tokenized assets, but assets do not become movements by sitting onchain. Vicus turns those assets into communities where people discover, learn, verify, contribute, and earn eligible Stellar rewards. For issuers, it is a campaign and distribution layer. For users, it makes tokenized assets understandable and alive.

### Judge framing

- **Meaningful Stellar usage:** asset verification, reward claims, transaction proof, and Stellar-native asset discovery.
- **Originality:** a community and education layer, not another payment app or wallet.
- **Impact:** gives tokenized assets a route to educated attention and repeat participation.
- **UX:** watch without a wallet, verify when ready, and understand every state.
- **Beyond the hackathon:** issuer campaigns, cross-chain identity, funded treasuries, and a broader RWA growth network.

### 90-second demo sequence

1. Open Vicus and state the problem.
2. Browse circles without a wallet.
3. Open a circle and read its Asset Passport.
4. Watch the circle.
5. Complete a short proof-of-understanding mission.
6. Verify a Stellar address without exposing the balance.
7. Show the role badge.
8. Claim a real small reward or show the claimable state.
9. Open the receipt with transaction proof.
10. Switch to the issuer view and show campaign analytics.
11. Close with the long-term distribution thesis.

### The closing line

> **Vicus gives every tokenized asset a place to belong—and gives every participant a verifiable way in.**

---

## 16. Evidence, assumptions, and open validation

### Evidence available now

- The supplied product documents define the intended product, MVP loop, architecture, guardrails, and Stellar integration targets.
- The official hackathon page defines the current challenge framing, team range, prize structure, and judging criteria.[1]
- The Latin dictionary evidence supports the root meaning of *vīcus* as a quarter, neighbourhood, or village.[5]

### Assumptions to validate

- Users will browse and learn before connecting a wallet.
- A proof-of-understanding step increases perceived trust rather than adding unacceptable friction.
- Issuers value educated attention enough to fund missions.
- A small real reward plus a clear receipt is more persuasive than a large simulated reward.
- “Community layer for tokenized assets” is understood faster than “social distribution protocol.”

### Decisions still required before implementation

- Whether to use testnet or tiny mainnet rewards.
- Whether the first reward path is a claimable balance or a simpler payout transaction.
- Which three to five circles have sufficiently clear source and eligibility data.
- Whether the admin role is labelled issuer, sponsor, campaign manager, or moderator.
- Which wallet connection path is genuinely faster than paste-address verification.
- What evidence is required before an issuer or circle receives an official status.

## Sources

[1] https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
[2] https://luma.com/zvrozqn4
[3] https://x.com/BuildOnStellar/status/2106096126453805212
[5] https://atlas.perseus.tufts.edu/dictionaries/entry/urn:cite2:scaife-viewer:dictionary-entries.atlas_v1:lat.ls.perseus-eng2-n50879
[6] https://stellar.org/learn/tokenized-investment-assets
[7] https://developers.stellar.org/docs/build/guides/transactions/claimable-balances
[8] https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves
[9] https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets
[10] https://developers.stellar.org/docs/tokens/cross-chain-transfers
[11] https://www.daybreakcircles.lol
[12] https://www.daybreakcircles.lol/thesis
