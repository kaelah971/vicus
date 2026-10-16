import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handle: varchar("handle", { length: 80 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    preferredEcosystems: jsonb("preferred_ecosystems").$type<string[]>().notNull().default([]),
    assetInterests: jsonb("asset_interests").$type<string[]>().notNull().default([]),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_handle_unique").on(table.handle)],
);

export const stellarWallets = pgTable(
  "stellar_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 32 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stellar_wallets_network_public_key_unique").on(table.network, table.publicKey),
    index("stellar_wallets_user_idx").on(table.userId),
  ],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengeHash: varchar("challenge_hash", { length: 128 }).notNull(),
    network: varchar("network", { length: 32 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_challenges_hash_unique").on(table.challengeHash),
    index("auth_challenges_created_idx").on(table.createdAt),
    index("auth_challenges_expires_idx").on(table.expiresAt),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => stellarWallets.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    issuer: text("issuer"),
    chain: varchar("chain", { length: 48 }).notNull(),
    ecosystem: varchar("ecosystem", { length: 32 }).notNull().default("stellar"),
    type: varchar("type", { length: 80 }).notNull(),
    stellarNetwork: varchar("stellar_network", { length: 32 }),
    stellarAssetCode: varchar("stellar_asset_code", { length: 32 }),
    stellarIssuerAccount: varchar("stellar_issuer_account", { length: 64 }),
    stellarContractId: varchar("stellar_contract_id", { length: 64 }),
    verificationMode: varchar("verification_mode", { length: 48 }),
    verificationSourceUrl: text("verification_source_url"),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description").notNull(),
    intendedUse: text("intended_use"),
    officialUrl: text("official_url"),
    riskNote: text("risk_note"),
    eligibilityNote: text("eligibility_note"),
    sourceStatus: varchar("source_status", { length: 80 }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("assets_chain_code_idx").on(table.chain, table.code)],
);

export const circles = pgTable(
  "circles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    slug: varchar("slug", { length: 140 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    tagline: text("tagline"),
    status: varchar("status", { length: 40 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    officialStatus: varchar("official_status", { length: 40 }).notNull(),
    featuredRank: integer("featured_rank"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("circles_slug_unique").on(table.slug),
    index("circles_category_status_idx").on(table.category, table.status),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description").notNull(),
    websiteUrl: text("website_url"),
    ecosystemFocus: varchar("ecosystem_focus", { length: 32 }),
    ...timestamps,
  },
  (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
    index("organization_memberships_org_idx").on(table.organizationId),
    index("organization_memberships_user_idx").on(table.userId),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id").references(() => circles.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    sources: jsonb("sources").$type<Array<{ label: string; url: string }>>().notNull().default([]),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lessons_slug_unique").on(table.slug),
    index("lessons_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issuerUserId: uuid("issuer_user_id").references(() => users.id, { onDelete: "set null" }),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    objective: text("objective").notNull(),
    budgetAsset: varchar("budget_asset", { length: 32 }),
    budgetAmount: numeric("budget_amount", { precision: 24, scale: 7 }),
    budgetStatus: varchar("budget_status", { length: 40 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    targetAction: varchar("target_action", { length: 32 }).notNull().default("send"),
    rewardAsset: varchar("reward_asset", { length: 16 }).notNull().default("USDC"),
    rewardNetwork: varchar("reward_network", { length: 32 }).notNull().default("stellar_testnet"),
    rewardPerCompletion: numeric("reward_per_completion", { precision: 24, scale: 7 }),
    participantCap: integer("participant_cap"),
    fundedAmount: numeric("funded_amount", { precision: 24, scale: 7 }).notNull().default("0"),
    reservedAmount: numeric("reserved_amount", { precision: 24, scale: 7 }).notNull().default("0"),
    paidAmount: numeric("paid_amount", { precision: 24, scale: 7 }).notNull().default("0"),
    treasuryAccount: varchar("treasury_account", { length: 64 }),
    fundingTxHash: varchar("funding_tx_hash", { length: 128 }),
    fundingVerifiedAt: timestamp("funding_verified_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("campaigns_circle_status_idx").on(table.circleId, table.status),
    uniqueIndex("campaigns_funding_tx_unique").on(table.fundingTxHash),
  ],
);

export const campaignCompletions = pgTable(
  "campaign_completions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    proofKind: varchar("proof_kind", { length: 16 }).notNull(),
    proofId: uuid("proof_id").notNull(),
    rewardAmount: numeric("reward_amount", { precision: 24, scale: 7 }).notNull(),
    destinationPublicKey: varchar("destination_public_key", { length: 64 }).notNull(),
    payoutTxHash: varchar("payout_tx_hash", { length: 128 }),
    payoutEnvelope: text("payout_envelope"),
    payoutLedger: integer("payout_ledger"),
    status: varchar("status", { length: 24 }).notNull().default("reserved"),
    lastError: text("last_error"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("campaign_completions_proof_unique").on(table.campaignId, table.proofKind, table.proofId),
    index("campaign_completions_campaign_status_idx").on(table.campaignId, table.status),
    index("campaign_completions_user_idx").on(table.userId),
  ],
);

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    points: integer("points").notNull().default(0),
    rewardAsset: varchar("reward_asset", { length: 32 }),
    rewardAmount: numeric("reward_amount", { precision: 24, scale: 7 }),
    eligibilityRule: jsonb("eligibility_rule").$type<Record<string, unknown>>(),
    missionConfig: jsonb("mission_config").$type<Record<string, unknown>>(),
    assetCapabilityId: uuid("asset_capability_id").references(() => assetCapabilities.id, {
      onDelete: "set null",
    }),
    duplicatePolicy: varchar("duplicate_policy", { length: 40 }).notNull().default("one-per-user"),
    reviewMode: varchar("review_mode", { length: 60 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("missions_circle_status_idx").on(table.circleId, table.status)],
);

export const missionSubmissions = pgTable(
  "mission_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content"),
    evidenceUrl: text("evidence_url"),
    score: integer("score"),
    status: varchar("status", { length: 32 }).notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    revisionReason: text("revision_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mission_submissions_mission_user_unique").on(table.missionId, table.userId),
    index("mission_submissions_mission_status_idx").on(table.missionId, table.status),
    index("mission_submissions_user_submitted_idx").on(table.userId, table.submittedAt),
    index("mission_submissions_review_queue_idx").on(table.status, table.submittedAt),
  ],
);

export const onchainActionProofs = pgTable(
  "onchain_action_proofs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => missionSubmissions.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 32 }).notNull(),
    transactionHash: varchar("transaction_hash", { length: 128 }).notNull(),
    operationIndex: integer("operation_index"),
    sourceAccount: varchar("source_account", { length: 64 }).notNull(),
    destinationAccount: varchar("destination_account", { length: 64 }).notNull(),
    assetCode: varchar("asset_code", { length: 32 }).notNull(),
    assetIssuer: varchar("asset_issuer", { length: 64 }).notNull(),
    amount: numeric("amount", { precision: 24, scale: 7 }).notNull(),
    ledger: integer("ledger"),
    transactionCreatedAt: timestamp("transaction_created_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("onchain_action_proofs_submission_unique").on(table.submissionId),
    uniqueIndex("onchain_action_proofs_mission_hash_unique").on(
      table.missionId,
      table.transactionHash,
    ),
    index("onchain_action_proofs_mission_user_idx").on(table.missionId, table.userId),
  ],
);

export const rewardClaims = pgTable(
  "reward_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    missionSubmissionId: uuid("mission_submission_id")
      .notNull()
      .references(() => missionSubmissions.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => stellarWallets.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 32 }).notNull(),
    asset: varchar("asset", { length: 32 }).notNull(),
    amount: numeric("amount", { precision: 24, scale: 7 }).notNull(),
    destinationPublicKey: varchar("destination_public_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    transactionHash: varchar("transaction_hash", { length: 128 }),
    signedEnvelopeXdr: text("signed_envelope_xdr"),
    ledger: integer("ledger"),
    failureCode: varchar("failure_code", { length: 80 }),
    failureMessage: text("failure_message"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reward_claims_submission_unique").on(table.missionSubmissionId),
    uniqueIndex("reward_claims_transaction_hash_unique").on(table.transactionHash),
    index("reward_claims_user_status_idx").on(table.userId, table.status),
    index("reward_claims_mission_idx").on(table.missionId),
  ],
);

export const circleMemberships = pgTable(
  "circle_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 60 }).notNull(),
    source: varchar("source", { length: 60 }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("circle_memberships_circle_user_unique").on(table.circleId, table.userId),
    index("circle_memberships_user_idx").on(table.userId),
  ],
);

export const badges = pgTable(
  "badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id").references(() => circles.id, { onDelete: "set null" }),
    badgeType: varchar("badge_type", { length: 80 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("badges_user_idx").on(table.userId), index("badges_circle_idx").on(table.circleId)],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    circleId: uuid("circle_id").references(() => circles.id, { onDelete: "set null" }),
    type: varchar("type", { length: 80 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_events_circle_created_idx").on(table.circleId, table.createdAt),
    index("activity_events_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const stellarRoleVerifications = pgTable(
  "stellar_role_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => stellarWallets.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    role: varchar("role", { length: 32 }).notNull(),
    ecosystem: varchar("ecosystem", { length: 32 }).notNull().default("stellar"),
    network: varchar("network", { length: 32 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).defaultNow().notNull(),
    lastState: varchar("last_state", { length: 48 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stellar_role_verifications_user_circle_unique").on(table.userId, table.circleId),
    index("stellar_role_verifications_user_idx").on(table.userId),
    index("stellar_role_verifications_circle_idx").on(table.circleId),
  ],
);

export const userFollows = pgTable(
  "user_follows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    followerUserId: uuid("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedUserId: uuid("followed_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_follows_follower_followed_unique").on(
      table.followerUserId,
      table.followedUserId,
    ),
    index("user_follows_follower_idx").on(table.followerUserId),
    index("user_follows_followed_idx").on(table.followedUserId),
  ],
);

export const circlePosts = pgTable(
  "circle_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    sourceUrl: text("source_url"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("circle_posts_circle_status_idx").on(table.circleId, table.status, table.createdAt),
    index("circle_posts_author_idx").on(table.authorUserId),
  ],
);

export const circleAnswers = pgTable(
  "circle_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => circlePosts.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("circle_answers_post_idx").on(table.postId, table.status, table.createdAt),
    index("circle_answers_author_idx").on(table.authorUserId),
  ],
);

export const circlePostHelpful = pgTable(
  "circle_post_helpful",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => circlePosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("circle_post_helpful_post_user_unique").on(table.postId, table.userId),
    index("circle_post_helpful_post_idx").on(table.postId),
    index("circle_post_helpful_user_idx").on(table.userId),
  ],
);

export const spaceApplications = pgTable(
  "space_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicantUserId: uuid("applicant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    proposedName: varchar("proposed_name", { length: 180 }).notNull(),
    proposedSlug: varchar("proposed_slug", { length: 140 }).notNull(),
    description: text("description").notNull(),
    websiteUrl: text("website_url"),
    projectType: varchar("project_type", { length: 48 }).notNull(),
    ecosystemFocus: varchar("ecosystem_focus", { length: 32 }),
    requestedPurpose: text("requested_purpose").notNull(),
    affiliationNote: text("affiliation_note"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("space_applications_applicant_status_idx").on(table.applicantUserId, table.status),
    index("space_applications_status_idx").on(table.status),
  ],
);

export const assetCapabilities = pgTable(
  "asset_capabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    capabilityType: varchar("capability_type", { length: 32 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    shortDescription: text("short_description").notNull(),
    supportMode: varchar("support_mode", { length: 16 }).notNull(),
    ctaLabel: varchar("cta_label", { length: 60 }).notNull(),
    destinationUrl: text("destination_url"),
    sourceUrl: text("source_url").notNull(),
    eligibilityNote: text("eligibility_note"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("asset_capabilities_circle_type_unique").on(table.circleId, table.capabilityType),
    index("asset_capabilities_circle_active_idx").on(table.circleId, table.active),
  ],
);

export const tokenizationLabRuns = pgTable(
  "tokenization_lab_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetName: varchar("asset_name", { length: 120 }).notNull(),
    assetCode: varchar("asset_code", { length: 12 }).notNull(),
    assetClass: varchar("asset_class", { length: 32 }).notNull(),
    representation: text("representation").notNull(),
    initialAmount: numeric("initial_amount", { precision: 24, scale: 7 }).notNull(),
    issuerPublicKey: varchar("issuer_public_key", { length: 64 }).notNull(),
    holderPublicKey: varchar("holder_public_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    trustlineTxHash: varchar("trustline_tx_hash", { length: 128 }),
    issuanceTxHash: varchar("issuance_tx_hash", { length: 128 }),
    issuanceEnvelope: text("issuance_envelope"),
    ledger: integer("ledger"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lab_runs_issuer_code_unique").on(table.issuerPublicKey, table.assetCode),
    index("lab_runs_user_idx").on(table.userId),
    index("lab_runs_status_idx").on(table.status),
  ],
);

export const crosschainTransfers = pgTable(
  "crosschain_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceNetwork: varchar("source_network", { length: 32 }).notNull(),
    sourceWallet: varchar("source_wallet", { length: 64 }).notNull(),
    destinationNetwork: varchar("destination_network", { length: 32 }).notNull(),
    asset: varchar("asset", { length: 16 }).notNull().default("USDC"),
    amount: numeric("amount", { precision: 24, scale: 6 }).notNull(),
    destinationAddress: text("destination_address").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    forwarding: boolean("forwarding").notNull().default(true),
    sourceTxHash: varchar("source_tx_hash", { length: 128 }),
    cctpMessage: text("cctp_message"),
    destinationTxHash: varchar("destination_tx_hash", { length: 128 }),
    feeSubunits6: varchar("fee_subunits_6", { length: 32 }),
    retryable: boolean("retryable").notNull().default(false),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("access_transfers_user_idx").on(table.userId),
    index("access_transfers_status_idx").on(table.status),
  ],
);

export const assetLifecycleSteps = pgTable(
  "asset_lifecycle_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 16 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    shortDescription: text("short_description").notNull(),
    supportMode: varchar("support_mode", { length: 16 }).notNull(),
    accessMode: varchar("access_mode", { length: 16 }),
    ctaLabel: varchar("cta_label", { length: 60 }),
    destinationUrl: text("destination_url"),
    sourceUrl: text("source_url").notNull(),
    eligibilityNote: text("eligibility_note"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lifecycle_circle_stage_unique").on(table.circleId, table.stage),
    index("lifecycle_circle_active_idx").on(table.circleId, table.active),
  ],
);

export const userContacts = pgTable(
  "user_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    handleSnapshot: varchar("handle_snapshot", { length: 80 }),
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_contacts_owner_linked_unique").on(table.ownerUserId, table.linkedUserId),
    index("user_contacts_owner_idx").on(table.ownerUserId),
  ],
);

export const contactWalletEndpoints = pgTable(
  "contact_wallet_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => userContacts.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 16 }).notNull(),
    address: text("address").notNull(),
    label: varchar("label", { length: 80 }),
    verifiedSource: varchar("verified_source", { length: 16 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("contact_endpoints_contact_network_address_unique").on(
      table.contactId,
      table.network,
      table.address,
    ),
  ],
);

export const userReceiveEndpoints = pgTable(
  "user_receive_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: varchar("network", { length: 16 }).notNull(),
    address: text("address").notNull(),
    label: varchar("label", { length: 80 }),
    enabled: boolean("enabled").notNull().default(false),
    visibility: varchar("visibility", { length: 16 }).notNull().default("contacts_only"),
    ownershipStatus: varchar("ownership_status", { length: 16 }).notNull().default("unverified"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("receive_endpoints_user_network_address_unique").on(
      table.userId,
      table.network,
      table.address,
    ),
    index("receive_endpoints_user_idx").on(table.userId),
  ],
);

export const assetTransfers = pgTable(
  "asset_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => userContacts.id, { onDelete: "set null" }),
    network: varchar("network", { length: 16 }).notNull().default("stellar_mainnet"),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    assetCode: varchar("asset_code", { length: 32 }).notNull(),
    assetIssuer: varchar("asset_issuer", { length: 64 }).notNull(),
    amount: numeric("amount", { precision: 24, scale: 7 }).notNull(),
    destinationAddress: text("destination_address").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    transactionHash: varchar("transaction_hash", { length: 128 }),
    ledger: integer("ledger"),
    failureReason: varchar("failure_reason", { length: 64 }),
    lastError: text("last_error"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("asset_transfers_tx_hash_unique").on(table.transactionHash),
    index("asset_transfers_sender_idx").on(table.senderUserId),
    index("asset_transfers_status_idx").on(table.status),
  ],
);

export const assetAccessOrders = pgTable(
  "asset_access_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetCircleId: uuid("target_circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    sourceAsset: varchar("source_asset", { length: 16 }).notNull().default("USDC"),
    sourceNetwork: varchar("source_network", { length: 32 }).notNull().default("stellar_testnet"),
    sourceAmountSubunits: varchar("source_amount_subunits", { length: 32 }).notNull(),
    destinationNetwork: varchar("destination_network", { length: 32 }).notNull().default("base"),
    executionWallet: varchar("execution_wallet", { length: 64 }),
    targetAssetAddress: varchar("target_asset_address", { length: 64 }).notNull(),
    venue: varchar("venue", { length: 32 }).notNull(),
    eligibilityAcknowledged: boolean("eligibility_acknowledged").notNull().default(false),
    accessTransferId: uuid("access_transfer_id").references(() => crosschainTransfers.id, {
      onDelete: "set null",
    }),
    quoteAmountOut: varchar("quote_amount_out", { length: 32 }),
    quoteMinOut: varchar("quote_min_out", { length: 32 }),
    quoteAt: timestamp("quote_at", { withTimezone: true }),
    destinationUsdcAmount: varchar("destination_usdc_amount", { length: 32 }),
    targetAmount: varchar("target_amount", { length: 32 }),
    approvalHash: varchar("approval_hash", { length: 128 }),
    swapHash: varchar("swap_hash", { length: 128 }),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    failureReason: varchar("failure_reason", { length: 64 }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("access_orders_user_idx").on(table.userId),
    index("access_orders_status_idx").on(table.status),
  ],
);

export const externalUtilityOrders = pgTable(
  "external_utility_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetCircleId: uuid("target_circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    actionKind: varchar("action_kind", { length: 16 }).notNull().default("swap"),
    sourceMint: varchar("source_mint", { length: 64 }).notNull(),
    sourceAmountSubunits: varchar("source_amount_subunits", { length: 32 }).notNull(),
    targetMint: varchar("target_mint", { length: 64 }).notNull(),
    destinationNetwork: varchar("destination_network", { length: 32 }).notNull().default("solana"),
    executionWallet: varchar("execution_wallet", { length: 64 }),
    venue: varchar("venue", { length: 32 }).notNull(),
    eligibilityAcknowledged: boolean("eligibility_acknowledged").notNull().default(false),
    quoteOutAmount: varchar("quote_out_amount", { length: 32 }),
    quoteMinOut: varchar("quote_min_out", { length: 32 }),
    quoteAt: timestamp("quote_at", { withTimezone: true }),
    swapSignature: varchar("swap_signature", { length: 128 }),
    targetAmount: varchar("target_amount", { length: 32 }),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    failureReason: varchar("failure_reason", { length: 64 }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("utility_orders_user_idx").on(table.userId),
    index("utility_orders_status_idx").on(table.status),
  ],
);

export const theses = pgTable(
  "theses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id").references(() => circles.id, { onDelete: "cascade" }),
    subjectSlug: varchar("subject_slug", { length: 80 }),
    title: varchar("title", { length: 180 }).notNull(),
    claim: text("claim").notNull(),
    timeframe: varchar("timeframe", { length: 16 }).notNull(),
    confidence: integer("confidence").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    thesisType: varchar("thesis_type", { length: 32 }).notNull().default("paper"),
    evidenceRefs: jsonb("evidence_refs").$type<{ kind: string; label: string; url: string | null; postId: string | null }[]>().notNull().default([]),
    positionLinked: boolean("position_linked").notNull().default(false),
    linkedAssetSlug: varchar("linked_asset_slug", { length: 140 }),
    outcomeNote: text("outcome_note"),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("theses_circle_status_idx").on(table.circleId, table.status, table.createdAt),
    index("theses_subject_status_idx").on(table.subjectSlug, table.status, table.createdAt),
    index("theses_author_idx").on(table.authorUserId),
  ],
);

export const userBaskets = pgTable(
  "user_baskets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    theme: text("theme").notNull(),
    rationale: text("rationale").notNull(),
    constituents: jsonb("constituents").$type<{ slug: string; weightBps: number }[]>().notNull().default([]),
    source: varchar("source", { length: 16 }).notNull().default("user"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_baskets_owner_slug_unique").on(table.ownerUserId, table.slug),
    index("user_baskets_owner_idx").on(table.ownerUserId),
  ],
);

export const basketWatches = pgTable(
  "basket_watches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    basketKind: varchar("basket_kind", { length: 16 }).notNull(),
    basketRef: varchar("basket_ref", { length: 80 }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("basket_watches_user_kind_ref_unique").on(table.userId, table.basketKind, table.basketRef),
    index("basket_watches_user_idx").on(table.userId),
  ],
);

/**
 * P6.2 anti-abuse quotas. One row per (scope, subject, window bucket).
 * DB-backed so limits hold across serverless instances — never in-memory
 * counters. Bucket keys embed the window start, so expiry is implicit
 * (stale buckets simply stop matching); no janitor required.
 */
export const abuseRateLimits = pgTable(
  "abuse_rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    count: integer("count").notNull().default(1),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("abuse_rate_limits_window_idx").on(table.windowStart)],
);
