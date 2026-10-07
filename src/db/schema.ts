import {
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

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issuerUserId: uuid("issuer_user_id").references(() => users.id, { onDelete: "set null" }),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    budgetAsset: varchar("budget_asset", { length: 32 }),
    budgetAmount: numeric("budget_amount", { precision: 24, scale: 7 }),
    budgetStatus: varchar("budget_status", { length: 40 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("campaigns_circle_status_idx").on(table.circleId, table.status)],
);

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    points: integer("points").notNull().default(0),
    rewardAsset: varchar("reward_asset", { length: 32 }),
    rewardAmount: numeric("reward_amount", { precision: 24, scale: 7 }),
    eligibilityRule: jsonb("eligibility_rule").$type<Record<string, unknown>>(),
    missionConfig: jsonb("mission_config").$type<Record<string, unknown>>(),
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
