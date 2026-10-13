import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import {
  assetTransfers,
  campaignCompletions,
  campaigns,
  circles,
  externalUtilityOrders,
  missionSubmissions,
  missions,
} from "@/db/schema";
import { isGlobalAdmin, requireOrgRoles } from "@/lib/organizations/service";
import {
  CAMPAIGN_EXPLORER_TX,
  CAMPAIGN_REWARD_ASSET,
  CAMPAIGN_REWARD_NETWORK,
  CAMPAIGN_REWARD_NETWORK_LABEL,
  baseUnitsToUsdc,
  isCampaignTargetAction,
  numericToBaseUnits,
  usdcToBaseUnits,
  type CampaignTargetAction,
} from "@/lib/campaigns/config";
import {
  CampaignConfigurationError,
  CampaignSettlementError,
  defaultCampaignHorizon,
  getCampaignSettlementConfig,
  getCampaignTreasuryAccount,
  settleCampaignPayout,
  type CampaignHorizon,
} from "@/lib/campaigns/settlement";

export type CampaignActionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid-request"
  | "not-found"
  | "invalid-transition"
  | "campaign-not-configured"
  | "funding-invalid"
  | "funding-duplicate"
  | "proof-invalid"
  | "proof-reused"
  | "budget-exhausted"
  | "participant-cap-reached"
  | "payout-retryable"
  | "payout-failed";

export class CampaignActionError extends Error {
  constructor(
    public readonly code: CampaignActionErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const TX_HASH_RE = /^[0-9a-fA-F]{64}$/;

function preserveExpectedError(error: unknown): boolean {
  return (
    error instanceof CampaignActionError ||
    error instanceof CampaignSettlementError ||
    error instanceof CampaignConfigurationError ||
    isDatabaseUnavailableError(error)
  );
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new CampaignActionError("unauthenticated", "Sign in to manage campaigns.", 401);
  }
  return userId;
}

export type CampaignView = {
  id: string;
  organizationId: string | null;
  circleId: string;
  circleSlug: string;
  circleName: string;
  objective: string;
  targetAction: CampaignTargetAction;
  rewardAsset: string;
  rewardNetwork: string;
  rewardNetworkLabel: string;
  rewardPerCompletion: string | null;
  participantCap: number | null;
  fundedAmount: string;
  reservedAmount: string;
  paidAmount: string;
  remainingAmount: string;
  treasuryAccount: string | null;
  fundingTxHash: string | null;
  status: string;
  activatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapCampaignView(
  row: typeof campaigns.$inferSelect,
  circle: { slug: string; name: string },
): CampaignView {
  const funded = numericToBaseUnits(row.fundedAmount);
  const reserved = numericToBaseUnits(row.reservedAmount);
  const paid = numericToBaseUnits(row.paidAmount);
  const remaining = funded - paid - reserved;
  return {
    id: row.id,
    organizationId: row.organizationId,
    circleId: row.circleId,
    circleSlug: circle.slug,
    circleName: circle.name,
    objective: row.objective,
    targetAction: (row.targetAction ?? "send") as CampaignTargetAction,
    rewardAsset: row.rewardAsset ?? CAMPAIGN_REWARD_ASSET,
    rewardNetwork: row.rewardNetwork ?? CAMPAIGN_REWARD_NETWORK,
    rewardNetworkLabel: CAMPAIGN_REWARD_NETWORK_LABEL,
    rewardPerCompletion: row.rewardPerCompletion,
    participantCap: row.participantCap,
    fundedAmount: baseUnitsToUsdc(funded),
    reservedAmount: baseUnitsToUsdc(reserved < BigInt(0) ? BigInt(0) : reserved),
    paidAmount: baseUnitsToUsdc(paid),
    remainingAmount: baseUnitsToUsdc(remaining < BigInt(0) ? BigInt(0) : remaining),
    treasuryAccount: row.treasuryAccount,
    fundingTxHash: row.fundingTxHash,
    status: row.status,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadCampaignRow(campaignId: string) {
  if (!UUID_RE.test(campaignId)) {
    throw new CampaignActionError("not-found", "That campaign could not be found.", 404);
  }
  const database = getDatabase();
  const [row] = await database
    .select({ campaign: campaigns, slug: circles.slug, name: circles.name })
    .from(campaigns)
    .innerJoin(circles, eq(campaigns.circleId, circles.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!row) throw new CampaignActionError("not-found", "That campaign could not be found.", 404);
  return row;
}

/**
 * Authorize campaign management: org owner/admin for circles hosted by that
 * org, or a global Vicus admin for any circle. Editors are read-only here —
 * money movement stays owner/admin-only.
 */
async function authorizeCampaignManager(
  actorId: string,
  circleId: string,
  organizationId: string | null,
): Promise<{ organizationId: string | null }> {
  if (await isGlobalAdmin(actorId)) return { organizationId };
  if (!organizationId || !UUID_RE.test(organizationId)) {
    throw new CampaignActionError("forbidden", "Campaigns need a hosting organization or a Vicus admin.", 403);
  }
  const { orgId } = await requireOrgRoles(actorId, organizationId, ["owner", "admin"]).catch(() => {
    throw new CampaignActionError("forbidden", "Only organization owners and admins manage campaigns.", 403);
  });
  const database = getDatabase();
  const [circle] = await database
    .select({ id: circles.id, organizationId: circles.organizationId })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);
  if (!circle || circle.organizationId !== orgId) {
    throw new CampaignActionError("forbidden", "Campaigns can only target Circles hosted by this organization.", 403);
  }
  return { organizationId: orgId };
}

export async function createCampaign(
  actorId: string | null | undefined,
  input: {
    circleSlug?: unknown;
    organizationId?: unknown;
    objective?: unknown;
    targetAction?: unknown;
    rewardPerCompletion?: unknown;
    participantCap?: unknown;
  },
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CampaignView> {
  try {
    const actor = requireUserId(actorId);
    if (typeof input.circleSlug !== "string" || !input.circleSlug.trim()) {
      throw new CampaignActionError("invalid-request", "Choose the target Circle.", 400);
    }
    if (!isCampaignTargetAction(input.targetAction)) {
      throw new CampaignActionError("invalid-request", "Choose a server-approved qualifying action.", 400);
    }
    const objective = typeof input.objective === "string" ? input.objective.trim() : "";
    if (objective.length < 8 || objective.length > 180) {
      throw new CampaignActionError("invalid-request", "Describe the campaign objective in 8 to 180 characters.", 400);
    }
    const rewardUnits = usdcToBaseUnits(input.rewardPerCompletion);
    if (rewardUnits === null) {
      throw new CampaignActionError("invalid-request", "Set a positive USDC reward per completion.", 400);
    }
    let cap: number | null = null;
    if (input.participantCap !== undefined && input.participantCap !== null && input.participantCap !== "") {
      cap = typeof input.participantCap === "number" ? input.participantCap : Number(input.participantCap);
      if (!Number.isInteger(cap) || cap <= 0 || cap > 100000) {
        throw new CampaignActionError("invalid-request", "Set a participant cap between 1 and 100000.", 400);
      }
    }
    // Treasury must be derivable before a campaign exists — no campaign
    // without a real funding destination. Throws when unconfigured.
    let treasury: string;
    let maxUnits: bigint;
    try {
      treasury = getCampaignTreasuryAccount(environment);
      maxUnits = getCampaignSettlementConfig(environment).maxUnits;
    } catch {
      throw new CampaignActionError(
        "campaign-not-configured",
        "Campaign rewards are not configured yet. An operator must configure the campaign treasury first.",
        503,
      );
    }
    if (rewardUnits > maxUnits) {
      throw new CampaignActionError(
        "invalid-request",
        "The per-completion reward exceeds the configured payout limit.",
        400,
      );
    }
    const database = getDatabase();
    const [circle] = await database
      .select({ id: circles.id, slug: circles.slug, name: circles.name })
      .from(circles)
      .where(eq(circles.slug, input.circleSlug.trim()))
      .limit(1);
    if (!circle) throw new CampaignActionError("not-found", "That Circle could not be found.", 404);
    const orgClaim =
      typeof input.organizationId === "string" && UUID_RE.test(input.organizationId) ? input.organizationId : null;
    const { organizationId } = await authorizeCampaignManager(actor, circle.id, orgClaim);
    const [row] = await database
      .insert(campaigns)
      .values({
        issuerUserId: actor,
        circleId: circle.id,
        organizationId,
        objective,
        budgetAsset: CAMPAIGN_REWARD_ASSET,
        budgetStatus: "unfunded",
        status: "awaiting_funding",
        targetAction: input.targetAction,
        rewardAsset: CAMPAIGN_REWARD_ASSET,
        rewardNetwork: CAMPAIGN_REWARD_NETWORK,
        rewardPerCompletion: baseUnitsToUsdc(rewardUnits),
        participantCap: cap,
        treasuryAccount: treasury,
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("create campaign");
    return mapCampaignView(row, circle);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create campaign");
  }
}

export async function getCampaign(campaignId: string): Promise<CampaignView> {
  try {
    const { campaign, slug, name } = await loadCampaignRow(campaignId);
    return mapCampaignView(campaign, { slug, name });
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read campaign");
  }
}

export async function listCircleCampaigns(circleSlug: string): Promise<CampaignView[]> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({ campaign: campaigns, slug: circles.slug, name: circles.name })
      .from(campaigns)
      .innerJoin(circles, eq(campaigns.circleId, circles.id))
      .where(eq(circles.slug, circleSlug));
    return rows
      .filter((row) => ["active", "funded", "exhausted"].includes(row.campaign.status))
      .map((row) => mapCampaignView(row.campaign, { slug: row.slug, name: row.name }));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list campaigns");
  }
}

export type CampaignDashboard = {
  campaign: CampaignView;
  completions: number;
  participants: number;
  recent: {
    id: string;
    userHandle: string | null;
    proofKind: string;
    rewardAmount: string;
    status: string;
    paidAt: string | null;
  }[];
};

/** Manager/global-admin dashboard. No destination wallets, no envelopes. */
export async function getCampaignDashboard(
  campaignId: string,
  actorId: string | null | undefined,
): Promise<CampaignDashboard> {
  try {
    const actor = requireUserId(actorId);
    const { campaign, slug, name } = await loadCampaignRow(campaignId);
    if (!(await isGlobalAdmin(actor))) {
      if (!campaign.organizationId) {
        throw new CampaignActionError("forbidden", "Only Vicus admins review this campaign.", 403);
      }
      await requireOrgRoles(actor, campaign.organizationId, ["owner", "admin"]).catch(() => {
        throw new CampaignActionError("forbidden", "Only organization owners and admins review campaigns.", 403);
      });
    }
    const database = getDatabase();
    const [{ value: completions }] = await database
      .select({ value: count() })
      .from(campaignCompletions)
      .where(eq(campaignCompletions.campaignId, campaign.id));
    const [{ value: participants }] = await database
      .select({ value: sql<number>`count(distinct ${campaignCompletions.userId})` })
      .from(campaignCompletions)
      .where(eq(campaignCompletions.campaignId, campaign.id));
    const recent = await database
      .select({
        id: campaignCompletions.id,
        handle: sql<string | null>`(select handle from users where users.id = ${campaignCompletions.userId})`,
        proofKind: campaignCompletions.proofKind,
        rewardAmount: campaignCompletions.rewardAmount,
        status: campaignCompletions.status,
        paidAt: campaignCompletions.paidAt,
      })
      .from(campaignCompletions)
      .where(eq(campaignCompletions.campaignId, campaign.id))
      .orderBy(sql`${campaignCompletions.createdAt} desc`)
      .limit(25);
    return {
      campaign: mapCampaignView(campaign, { slug, name }),
      completions,
      participants: Number(participants ?? 0),
      recent: recent.map((entry) => ({
        id: entry.id,
        userHandle: entry.handle,
        proofKind: entry.proofKind,
        rewardAmount: entry.rewardAmount,
        status: entry.status,
        paidAt: entry.paidAt?.toISOString() ?? null,
      })),
    };
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read campaign dashboard");
  }
}

/**
 * Verify project funding from a submitted Testnet transaction hash. Credits
 * the ACTUAL verified amount — never the client-declared figure. Each hash
 * credits at most one campaign (unique index); already-funded campaigns
 * reject further funding.
 */
export async function verifyCampaignFunding(
  campaignId: string,
  actorId: string | null | undefined,
  fundingTxHash: unknown,
  horizon: CampaignHorizon = defaultCampaignHorizon,
): Promise<CampaignView> {
  try {
    const actor = requireUserId(actorId);
    const { campaign, slug, name } = await loadCampaignRow(campaignId);
    if (!(await isGlobalAdmin(actor))) {
      if (!campaign.organizationId) {
        throw new CampaignActionError("forbidden", "Only Vicus admins fund this campaign.", 403);
      }
      await requireOrgRoles(actor, campaign.organizationId, ["owner", "admin"]).catch(() => {
        throw new CampaignActionError("forbidden", "Only organization owners and admins fund campaigns.", 403);
      });
    }
    if (!["awaiting_funding", "draft"].includes(campaign.status)) {
      throw new CampaignActionError("invalid-transition", "This campaign already completed funding.", 409);
    }
    if (typeof fundingTxHash !== "string" || !TX_HASH_RE.test(fundingTxHash.trim())) {
      throw new CampaignActionError("invalid-request", "Provide the funding transaction hash.", 400);
    }
    const hash = fundingTxHash.trim().toLowerCase();
    if (!campaign.treasuryAccount) {
      throw new CampaignActionError("campaign-not-configured", "This campaign has no treasury address.", 503);
    }
    let transaction;
    try {
      transaction = await horizon.getTransaction(hash);
    } catch {
      throw new CampaignActionError("funding-invalid", "Stellar Testnet could not be reached. Retry later.", 503);
    }
    if (!transaction || !transaction.successful) {
      throw new CampaignActionError("funding-invalid", "That transaction is not a successful Testnet payment.", 400);
    }
    if (new Date(transaction.createdAt).getTime() < campaign.createdAt.getTime()) {
      throw new CampaignActionError("funding-invalid", "That transaction predates this campaign.", 400);
    }
    // Exact match: USDC code + verified issuer + treasury destination.
    const { CAMPAIGN_REWARD_ISSUER } = await import("@/lib/campaigns/config");
    let credited = BigInt(0);
    for (const operation of transaction.operations) {
      if (
        operation.type === "payment" &&
        operation.assetCode === CAMPAIGN_REWARD_ASSET &&
        operation.assetIssuer === CAMPAIGN_REWARD_ISSUER &&
        operation.destination === campaign.treasuryAccount &&
        typeof operation.amount === "string"
      ) {
        const units = usdcToBaseUnits(operation.amount);
        if (units !== null) credited += units;
      }
    }
    if (credited <= BigInt(0)) {
      throw new CampaignActionError(
        "funding-invalid",
        "That transaction does not fund this campaign's treasury with Testnet USDC.",
        400,
      );
    }
    const database = getDatabase();
    let updated;
    try {
      [updated] = await database
        .update(campaigns)
        .set({
          fundedAmount: baseUnitsToUsdc(numericToBaseUnits(campaign.fundedAmount) + credited),
          fundingTxHash: hash,
          fundingVerifiedAt: new Date(),
          budgetStatus: "funded",
          status: "funded",
          updatedAt: new Date(),
        })
        .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, campaign.status)))
        .returning();
    } catch (error) {
      if (isDatabaseUnavailableError(error)) throw error;
      throw new CampaignActionError("funding-duplicate", "That funding transaction already credited a campaign.", 409);
    }
    if (!updated) {
      throw new CampaignActionError("invalid-transition", "This campaign changed while funding was verified.", 409);
    }
    return mapCampaignView(updated, { slug, name });
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("verify campaign funding");
  }
}

async function transitionCampaignStatus(
  campaignId: string,
  actorId: string | null | undefined,
  from: string[],
  to: Exclude<import("@/lib/campaigns/config").CampaignStatus, "draft" | "awaiting_funding" | "funded">,
  stamp: "activatedAt" | "completedAt" | null,
): Promise<CampaignView> {
  try {
    const actor = requireUserId(actorId);
    const { campaign, slug, name } = await loadCampaignRow(campaignId);
    if (!(await isGlobalAdmin(actor))) {
      if (!campaign.organizationId) {
        throw new CampaignActionError("forbidden", "Only Vicus admins manage this campaign.", 403);
      }
      await requireOrgRoles(actor, campaign.organizationId, ["owner", "admin"]).catch(() => {
        throw new CampaignActionError("forbidden", "Only organization owners and admins manage campaigns.", 403);
      });
    }
    if (!from.includes(campaign.status)) {
      throw new CampaignActionError(
        "invalid-transition",
        `This campaign cannot move to ${to} from ${campaign.status}.`,
        409,
      );
    }
    if ((to === "active" || to === "paused") && numericToBaseUnits(campaign.fundedAmount) <= BigInt(0)) {
      throw new CampaignActionError("invalid-transition", "A campaign cannot activate without verified funding.", 409);
    }
    if (!campaign.rewardPerCompletion || usdcToBaseUnits(campaign.rewardPerCompletion) === null) {
      throw new CampaignActionError("invalid-transition", "This campaign has no valid per-completion reward.", 409);
    }
    const database = getDatabase();
    const patch: Partial<typeof campaign> = { status: to, updatedAt: new Date() };
    if (stamp === "activatedAt" && !campaign.activatedAt) patch.activatedAt = new Date();
    if (stamp === "completedAt") patch.completedAt = new Date();
    const [updated] = await database
      .update(campaigns)
      .set(patch)
      .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, campaign.status)))
      .returning();
    if (!updated) {
      throw new CampaignActionError("invalid-transition", "This campaign changed while updating.", 409);
    }
    return mapCampaignView(updated, { slug, name });
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("transition campaign");
  }
}

export function activateCampaign(campaignId: string, actorId: string | null | undefined) {
  return transitionCampaignStatus(campaignId, actorId, ["funded", "paused"], "active", "activatedAt");
}

export function pauseCampaign(campaignId: string, actorId: string | null | undefined) {
  return transitionCampaignStatus(campaignId, actorId, ["active"], "paused", null);
}

export function completeCampaign(campaignId: string, actorId: string | null | undefined) {
  return transitionCampaignStatus(campaignId, actorId, ["active", "paused", "exhausted"], "completed", "completedAt");
}

type ProofInput = { kind?: unknown; id?: unknown };

type ValidatedProof = {
  kind: CampaignTargetAction;
  proofId: string;
  proofAt: Date;
};

/**
 * Fail-closed proof validation. Every branch pins the campaign's own circle,
 * the claiming user, a confirmed/approved state, and the eligibility window.
 */
async function validateProof(
  database: ReturnType<typeof getDatabase>,
  campaign: typeof campaigns.$inferSelect,
  userId: string,
  proof: ProofInput,
): Promise<ValidatedProof> {
  const kind = proof.kind;
  const proofId = typeof proof.id === "string" && UUID_RE.test(proof.id) ? proof.id : null;
  if (!isCampaignTargetAction(kind) || kind !== campaign.targetAction || !proofId) {
    throw new CampaignActionError("proof-invalid", "That proof does not qualify for this campaign.", 400);
  }
  const windowStart = campaign.activatedAt?.getTime() ?? campaign.createdAt.getTime();
  const windowEnd = campaign.endsAt?.getTime() ?? null;
  const withinWindow = (proofAt: Date | null): proofAt is Date =>
    proofAt !== null && proofAt.getTime() >= windowStart && (windowEnd === null || proofAt.getTime() <= windowEnd);
  if (kind === "send") {
    const [transfer] = await database
      .select()
      .from(assetTransfers)
      .where(eq(assetTransfers.id, proofId))
      .limit(1);
    if (
      !transfer ||
      transfer.senderUserId !== userId ||
      transfer.status !== "confirmed" ||
      transfer.circleId !== campaign.circleId ||
      transfer.network !== "stellar_mainnet" ||
      !withinWindow(transfer.confirmedAt)
    ) {
      throw new CampaignActionError("proof-invalid", "That Send receipt does not qualify for this campaign.", 400);
    }
    // The transfer's own asset/issuer was verified at send time against the
    // server-owned policy; the circle binding above pins the campaign asset.
    return { kind, proofId, proofAt: transfer.confirmedAt };
  }
  if (kind === "swap") {
    const [order] = await database
      .select()
      .from(externalUtilityOrders)
      .where(eq(externalUtilityOrders.id, proofId))
      .limit(1);
    if (
      !order ||
      order.userId !== userId ||
      order.status !== "confirmed" ||
      order.actionKind !== "swap" ||
      order.targetCircleId !== campaign.circleId ||
      !withinWindow(order.completedAt)
    ) {
      throw new CampaignActionError("proof-invalid", "That swap receipt does not qualify for this campaign.", 400);
    }
    return { kind, proofId, proofAt: order.completedAt };
  }
  if (kind === "exit") {
    const [order] = await database
      .select()
      .from(externalUtilityOrders)
      .where(eq(externalUtilityOrders.id, proofId))
      .limit(1);
    if (
      !order ||
      order.userId !== userId ||
      order.status !== "confirmed" ||
      order.actionKind !== "exit" ||
      order.targetCircleId !== campaign.circleId ||
      !withinWindow(order.completedAt)
    ) {
      throw new CampaignActionError("proof-invalid", "That exit receipt does not qualify for this campaign.", 400);
    }
    return { kind, proofId, proofAt: order.completedAt };
  }
  const [submission] = await database
    .select({ submission: missionSubmissions, circleId: missions.circleId })
    .from(missionSubmissions)
    .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
    .where(eq(missionSubmissions.id, proofId))
    .limit(1);
  if (!submission || submission.submission.userId !== userId || submission.submission.status !== "approved") {
    throw new CampaignActionError("proof-invalid", "That mission proof is not approved for this user.", 400);
  }
  if (submission.circleId !== campaign.circleId) {
    throw new CampaignActionError("proof-invalid", "That mission proof belongs to a different asset.", 400);
  }
  const proofAt = submission.submission.reviewedAt ?? submission.submission.submittedAt;
  if (!withinWindow(proofAt)) {
    throw new CampaignActionError("proof-invalid", "That mission proof is outside this campaign window.", 400);
  }
  return { kind, proofId, proofAt };
}

const RETRYABLE_PAYOUT_CODES: ReadonlySet<string> = new Set([
  "horizon_unavailable",
  "destination_not_ready",
  "destination_no_trustline",
  "source_not_ready",
  "recovery_required",
]);

/**
 * Claim a campaign reward for a verified proof. Reserves budget atomically
 * under a row lock (one payout winner for the final reward), pays Testnet
 * USDC from the campaign treasury, and finalizes exactly once. Retried
 * claims resume the same completion — never a second payout.
 */
export async function claimCampaignReward(
  campaignId: string,
  userId: string | null | undefined,
  destinationPublicKey: unknown,
  proof: ProofInput,
  horizon: CampaignHorizon = defaultCampaignHorizon,
  environment: NodeJS.ProcessEnv = process.env,
) {
  try {
    const user = requireUserId(userId);
    if (typeof destinationPublicKey !== "string" || !destinationPublicKey.trim()) {
      throw new CampaignActionError("invalid-request", "Provide the verified Stellar destination.", 400);
    }
    const destination = destinationPublicKey.trim();
    const database = getDatabase();
    const { campaign, slug } = await loadCampaignRow(campaignId);
    if (campaign.status !== "active") {
      const code = campaign.status === "exhausted" ? "budget-exhausted" : "invalid-transition";
      throw new CampaignActionError(
        code,
        campaign.status === "exhausted"
          ? "This campaign's budget is exhausted."
          : `This campaign is ${campaign.status} and not paying rewards right now.`,
        code === "budget-exhausted" ? 409 : 400,
      );
    }
    const rewardUnits = campaign.rewardPerCompletion ? usdcToBaseUnits(campaign.rewardPerCompletion) : null;
    if (rewardUnits === null) {
      throw new CampaignActionError("invalid-transition", "This campaign has no valid per-completion reward.", 400);
    }
    const validated = await validateProof(database, campaign, user, proof);

    // Reserve without interactive transactions (neon-http): insert the
    // completion idempotently, then validate + reserve cover in ONE
    // conditional UPDATE. The row lock + fresh subquery reads make concurrent
    // racers for the final reward produce exactly one winner.
    const [inserted] = await database
      .insert(campaignCompletions)
      .values({
        campaignId: campaign.id,
        userId: user,
        proofKind: validated.kind,
        proofId: validated.proofId,
        rewardAmount: baseUnitsToUsdc(rewardUnits),
        destinationPublicKey: destination,
        status: "reserved",
      })
      .onConflictDoNothing({
        target: [campaignCompletions.campaignId, campaignCompletions.proofKind, campaignCompletions.proofId],
      })
      .returning();
    let completion = inserted;
    if (!completion) {
      const [existing] = await database
        .select()
        .from(campaignCompletions)
        .where(
          and(
            eq(campaignCompletions.campaignId, campaign.id),
            eq(campaignCompletions.proofKind, validated.kind),
            eq(campaignCompletions.proofId, validated.proofId),
          ),
        )
        .limit(1);
      if (!existing) throw toDatabaseUnavailableError("reserve campaign reward");
      completion = existing;
    }
    if (completion.status === "paid") return mapCompletionView(completion, slug);

    // Re-arm failed attempts so the same proof can retry with fresh cover.
    let needsCover = completion.id === inserted?.id || completion.status === "failed";
    if (completion.status === "failed") {
      const [rearmed] = await database
        .update(campaignCompletions)
        .set({ status: "reserved", lastError: null, updatedAt: new Date() })
        .where(and(eq(campaignCompletions.id, completion.id), eq(campaignCompletions.status, "failed")))
        .returning();
      completion = rearmed ?? completion;
      needsCover = true;
    }

    const rewardText = baseUnitsToUsdc(rewardUnits);
    if (needsCover) {
      const [covered] = await database
        .update(campaigns)
        .set({
          reservedAmount: sql`${campaigns.reservedAmount} + ${rewardText}::numeric`,
          status: sql`CASE WHEN (${campaigns.fundedAmount} - ${campaigns.paidAmount} - ${campaigns.reservedAmount} - ${rewardText}::numeric) < ${rewardText}::numeric THEN 'exhausted' ELSE ${campaigns.status} END`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(campaigns.id, campaign.id),
            eq(campaigns.status, "active"),
            sql`(${campaigns.fundedAmount} - ${campaigns.paidAmount} - ${campaigns.reservedAmount}) >= ${rewardText}::numeric`,
            sql`(${campaigns.participantCap} IS NULL OR EXISTS (SELECT 1 FROM ${campaignCompletions} WHERE ${campaignCompletions.campaignId} = ${campaigns.id} AND ${campaignCompletions.userId} = ${user} AND ${campaignCompletions.id} <> ${completion.id}) OR (SELECT COUNT(DISTINCT ${campaignCompletions.userId}) FROM ${campaignCompletions} WHERE ${campaignCompletions.campaignId} = ${campaigns.id} AND ${campaignCompletions.userId} <> ${user}) < ${campaigns.participantCap})`,
          ),
        )
        .returning({ id: campaigns.id });
      if (!covered) {
        // Reason first (fresh reads), then release our own fresh reservation.
        const [fresh] = await database
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaign.id))
          .limit(1);
        if (inserted) {
          await database
            .delete(campaignCompletions)
            .where(and(eq(campaignCompletions.id, completion.id), eq(campaignCompletions.status, "reserved")));
        }
        if (fresh?.participantCap !== null && fresh?.participantCap !== undefined) {
          const [{ value: others }] = await database
            .select({ value: sql<number>`count(distinct ${campaignCompletions.userId})` })
            .from(campaignCompletions)
            .where(
              and(eq(campaignCompletions.campaignId, campaign.id), sql`${campaignCompletions.userId} <> ${user}`),
            );
          const mine = await database
            .select({ id: campaignCompletions.id })
            .from(campaignCompletions)
            .where(and(eq(campaignCompletions.campaignId, campaign.id), eq(campaignCompletions.userId, user)))
            .limit(1);
          if (mine.length === 0 && Number(others ?? 0) >= fresh.participantCap) {
            throw new CampaignActionError("participant-cap-reached", "This campaign reached its participant cap.", 409);
          }
        }
        const remainingNow = fresh
          ? numericToBaseUnits(fresh.fundedAmount) - numericToBaseUnits(fresh.paidAmount) - numericToBaseUnits(fresh.reservedAmount)
          : BigInt(0);
        if (remainingNow < rewardUnits) {
          await database
            .update(campaigns)
            .set({ status: "exhausted", updatedAt: new Date() })
            .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "active")));
          throw new CampaignActionError("budget-exhausted", "This campaign's budget is exhausted.", 409);
        }
        throw new CampaignActionError(
          "invalid-transition",
          fresh && fresh.status !== "active"
            ? `This campaign is ${fresh.status} and not paying rewards right now.`
            : "This campaign stopped paying rewards.",
          400,
        );
      }
    }

    const settle = async () =>
      settleCampaignPayout(
        {
          amountUnits: rewardUnits,
          destinationPublicKey: completion.destinationPublicKey,
          transactionHash: completion.payoutTxHash,
          signedEnvelopeXdr: completion.payoutEnvelope,
        },
        async (prepared) => {
          const [stored] = await database
            .update(campaignCompletions)
            .set({
              payoutTxHash: prepared.transactionHash,
              payoutEnvelope: prepared.signedEnvelopeXdr,
              updatedAt: new Date(),
            })
            .where(and(eq(campaignCompletions.id, completion.id), eq(campaignCompletions.status, "reserved")))
            .returning({ id: campaignCompletions.id });
          if (!stored) {
            throw new CampaignSettlementError(
              "recovery_required",
              "The reward changed while its transaction was being prepared.",
            );
          }
        },
        horizon,
        environment,
      );

    let confirmation;
    try {
      confirmation = await settle();
    } catch (error) {
      if (error instanceof CampaignSettlementError && !RETRYABLE_PAYOUT_CODES.has(error.code)) {
        // Definitive failure: release the reservation so budget is not
        // clogged, and mark the attempt failed. The same proof may retry.
        // Single CTE statement — atomic on neon-http.
        await database.execute(sql`
          WITH rel AS (
            UPDATE campaign_completions
            SET status = 'failed', last_error = ${error.message}, updated_at = now()
            WHERE id = ${completion.id} AND status = 'reserved'
            RETURNING reward_amount
          )
          UPDATE campaigns
          SET reserved_amount = reserved_amount - COALESCE((SELECT reward_amount FROM rel), 0),
              updated_at = now()
          WHERE id = ${campaign.id}
        `);
        throw new CampaignActionError("payout-failed", error.message, 400);
      }
      if (error instanceof CampaignSettlementError) {
        await database
          .update(campaignCompletions)
          .set({ lastError: error.message, updatedAt: new Date() })
          .where(eq(campaignCompletions.id, completion.id));
        throw new CampaignActionError("payout-retryable", `${error.message} It stays retryable.`, 400);
      }
      throw error;
    }

    // Finalize exactly once via a single CTE statement (atomic on
    // neon-http): the completion flips reserved→paid at most once, and the
    // budget moves if and only if the flip happened. Replays are no-ops.
    await database.execute(sql`
      WITH done AS (
        UPDATE campaign_completions
        SET status = 'paid',
            payout_tx_hash = ${confirmation.transactionHash},
            payout_ledger = ${confirmation.ledger},
            paid_at = now(),
            last_error = NULL,
            updated_at = now()
        WHERE id = ${completion.id} AND status = 'reserved'
        RETURNING reward_amount
      )
      UPDATE campaigns
      SET paid_amount = paid_amount + COALESCE((SELECT reward_amount FROM done), 0),
          reserved_amount = reserved_amount - COALESCE((SELECT reward_amount FROM done), 0),
          updated_at = now()
      WHERE id = ${campaign.id}
    `);
    const [finalCompletion] = await database
      .select()
      .from(campaignCompletions)
      .where(eq(campaignCompletions.id, completion.id))
      .limit(1);
    return mapCompletionView(finalCompletion ?? completion, slug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("claim campaign reward");
  }
}

export type CompletionView = {
  id: string;
  campaignId: string;
  circleSlug: string;
  proofKind: string;
  rewardAmount: string;
  rewardAsset: string;
  rewardNetwork: string;
  rewardNetworkLabel: string;
  payoutTxHash: string | null;
  payoutExplorerUrl: string | null;
  payoutLedger: number | null;
  status: string;
  lastError: string | null;
  paidAt: string | null;
  createdAt: string;
};

function mapCompletionView(
  row: typeof campaignCompletions.$inferSelect,
  circleSlug: string,
): CompletionView {
  return {
    id: row.id,
    campaignId: row.campaignId,
    circleSlug,
    proofKind: row.proofKind,
    rewardAmount: row.rewardAmount,
    rewardAsset: CAMPAIGN_REWARD_ASSET,
    rewardNetwork: CAMPAIGN_REWARD_NETWORK,
    rewardNetworkLabel: CAMPAIGN_REWARD_NETWORK_LABEL,
    payoutTxHash: row.payoutTxHash,
    payoutExplorerUrl: row.payoutTxHash ? `${CAMPAIGN_EXPLORER_TX}${row.payoutTxHash}` : null,
    payoutLedger: row.payoutLedger,
    status: row.status,
    lastError: row.lastError,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type EligibleProof = {
  kind: CampaignTargetAction;
  id: string;
  label: string;
  completedAt: string;
};

/** Proofs the user could claim with right now (qualifying, unused). */
export async function listEligibleProofs(
  campaignId: string,
  userId: string | null | undefined,
): Promise<EligibleProof[]> {
  try {
    const user = requireUserId(userId);
    const database = getDatabase();
    const { campaign } = await loadCampaignRow(campaignId);
    const windowStart = campaign.activatedAt?.getTime() ?? campaign.createdAt.getTime();
    const windowEnd = campaign.endsAt?.getTime() ?? null;
    const inWindow = (proofAt: Date | null): proofAt is Date =>
      proofAt !== null && proofAt.getTime() >= windowStart && (windowEnd === null || proofAt.getTime() <= windowEnd);
    const used = await database
      .select({ kind: campaignCompletions.proofKind, proofId: campaignCompletions.proofId })
      .from(campaignCompletions)
      .where(eq(campaignCompletions.campaignId, campaign.id));
    const usedKeys = new Set(used.map((entry) => `${entry.kind}:${entry.proofId}`));
    const eligible: EligibleProof[] = [];
    if (campaign.targetAction === "send") {
      const rows = await database
        .select()
        .from(assetTransfers)
        .where(and(eq(assetTransfers.senderUserId, user), eq(assetTransfers.circleId, campaign.circleId)));
      for (const row of rows) {
        if (
          row.status === "confirmed" &&
          row.network === "stellar_mainnet" &&
          inWindow(row.confirmedAt) &&
          !usedKeys.has(`send:${row.id}`)
        ) {
          eligible.push({
            kind: "send",
            id: row.id,
            label: `Sent ${row.assetCode} on ${row.confirmedAt.toISOString().slice(0, 10)}`,
            completedAt: row.confirmedAt.toISOString(),
          });
        }
      }
    } else if (campaign.targetAction === "swap") {
      const rows = await database
        .select()
        .from(externalUtilityOrders)
        .where(and(eq(externalUtilityOrders.userId, user), eq(externalUtilityOrders.targetCircleId, campaign.circleId)));
      for (const row of rows) {
        if (
          row.status === "confirmed" &&
          row.actionKind === "swap" &&
          inWindow(row.completedAt) &&
          !usedKeys.has(`swap:${row.id}`)
        ) {
          eligible.push({
            kind: "swap",
            id: row.id,
            label: `Swapped on ${row.completedAt.toISOString().slice(0, 10)}`,
            completedAt: row.completedAt.toISOString(),
          });
        }
      }
    } else if (campaign.targetAction === "exit") {
      const rows = await database
        .select()
        .from(externalUtilityOrders)
        .where(and(eq(externalUtilityOrders.userId, user), eq(externalUtilityOrders.targetCircleId, campaign.circleId)));
      for (const row of rows) {
        if (
          row.status === "confirmed" &&
          row.actionKind === "exit" &&
          inWindow(row.completedAt) &&
          !usedKeys.has(`exit:${row.id}`)
        ) {
          eligible.push({
            kind: "exit",
            id: row.id,
            label: `Exited on ${row.completedAt.toISOString().slice(0, 10)}`,
            completedAt: row.completedAt.toISOString(),
          });
        }
      }
    } else {
      const rows = await database
        .select({ submission: missionSubmissions, title: missions.title })
        .from(missionSubmissions)
        .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
        .where(and(eq(missionSubmissions.userId, user), eq(missions.circleId, campaign.circleId)));
      for (const row of rows) {
        const proofAt = row.submission.reviewedAt ?? row.submission.submittedAt;
        if (
          row.submission.status === "approved" &&
          inWindow(proofAt) &&
          !usedKeys.has(`mission:${row.submission.id}`)
        ) {
          eligible.push({
            kind: "mission",
            id: row.submission.id,
            label: `Approved: ${row.title.slice(0, 48)}`,
            completedAt: proofAt.toISOString(),
          });
        }
      }
    }
    return eligible;
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list eligible proofs");
  }
}

export async function listMyCompletions(
  campaignId: string,
  userId: string | null | undefined,
): Promise<CompletionView[]> {
  try {
    const user = requireUserId(userId);
    const { slug } = await loadCampaignRow(campaignId);
    const database = getDatabase();
    const rows = await database
      .select()
      .from(campaignCompletions)
      .where(and(eq(campaignCompletions.campaignId, campaignId), eq(campaignCompletions.userId, user)));
    return rows.map((row) => mapCompletionView(row, slug));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list completions");
  }
}

/** Manager-visible campaigns for an organization (any status). */
export async function listOrgCampaigns(
  organizationId: string,
  actorId: string | null | undefined,
): Promise<CampaignView[]> {
  try {
    const actor = requireUserId(actorId);
    if (!UUID_RE.test(organizationId)) {
      throw new CampaignActionError("invalid-request", "That organization is invalid.", 400);
    }
    if (!(await isGlobalAdmin(actor))) {
      await requireOrgRoles(actor, organizationId, ["owner", "admin"]).catch(() => {
        throw new CampaignActionError("forbidden", "Only organization owners and admins review campaigns.", 403);
      });
    }
    const database = getDatabase();
    const rows = await database
      .select({ campaign: campaigns, slug: circles.slug, name: circles.name })
      .from(campaigns)
      .innerJoin(circles, eq(campaigns.circleId, circles.id))
      .where(eq(campaigns.organizationId, organizationId));
    return rows.map((row) => mapCampaignView(row.campaign, { slug: row.slug, name: row.name }));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list org campaigns");
  }
}
