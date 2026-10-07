import { and, eq, inArray } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { missionSubmissions, missions, rewardClaims, circles } from "@/db/schema";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { compareXlmAmounts, getRewardNetworkConfig, normalizeXlmAmount, rewardExplorerUrl } from "@/lib/rewards/config-core";
import { RewardActionError, RewardConfigurationError, RewardSettlementError } from "@/lib/rewards/errors";
import type { RewardSettlementClaim, ConfirmedRewardSettlement } from "@/lib/rewards/settlement";
import type { RewardFailureCode, RewardStateView } from "@/lib/rewards/types";

type RewardClaimRow = typeof rewardClaims.$inferSelect;
type RewardContext = {
  submission: typeof missionSubmissions.$inferSelect;
  mission: typeof missions.$inferSelect;
  circle: typeof circles.$inferSelect;
};

type ClaimOptions = {
  settle?: (claim: RewardSettlementClaim) => Promise<ConfirmedRewardSettlement>;
};

function isoDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function failureCode(value: string | null): RewardFailureCode | null {
  const codes: RewardFailureCode[] = [
    "destination_not_ready",
    "distributor_not_configured",
    "mainnet_disabled",
    "invalid_reward_amount",
    "invalid_destination",
    "source_not_ready",
    "horizon_unavailable",
    "transaction_rejected",
    "recovery_required",
  ];
  return value && codes.includes(value as RewardFailureCode) ? (value as RewardFailureCode) : null;
}

function mapRewardClaim(claim: RewardClaimRow, context: RewardContext): RewardStateView {
  const network = claim.network === "public" ? "public" : "testnet";
  return {
    id: claim.id,
    submissionId: claim.missionSubmissionId,
    missionId: context.mission.id,
    missionTitle: context.mission.title,
    circleName: context.circle.name,
    asset: "XLM",
    amount: normalizeXlmAmount(String(claim.amount)),
    network,
    destinationPublicKey: claim.destinationPublicKey,
    status: claim.status as RewardStateView["status"],
    transactionHash: claim.transactionHash,
    ledger: claim.ledger,
    failureCode: failureCode(claim.failureCode),
    failureMessage: claim.failureMessage,
    createdAt: isoDate(claim.createdAt),
    submittedAt: isoDate(claim.submittedAt),
    confirmedAt: isoDate(claim.confirmedAt),
    explorerUrl: rewardExplorerUrl(network, claim.transactionHash),
  };
}

function mapConfigurationError(error: unknown): RewardActionError {
  if (error instanceof RewardConfigurationError && error.code === "mainnet_disabled") {
    return new RewardActionError("reward-configuration-unavailable", 503, error.message);
  }
  return new RewardActionError(
    "reward-configuration-unavailable",
    503,
    "Reward settlement is not configured for this environment.",
  );
}

async function getRewardContext(database: ReturnType<typeof getDatabase>, submissionId: string, userId: string) {
  const [row] = await database
    .select({ submission: missionSubmissions, mission: missions, circle: circles })
    .from(missionSubmissions)
    .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
    .innerJoin(circles, eq(missions.circleId, circles.id))
    .where(and(eq(missionSubmissions.id, submissionId), eq(missionSubmissions.userId, userId)))
    .limit(1);
  return row as RewardContext | undefined;
}

async function getClaim(database: ReturnType<typeof getDatabase>, submissionId: string) {
  const [claim] = await database
    .select()
    .from(rewardClaims)
    .where(eq(rewardClaims.missionSubmissionId, submissionId))
    .limit(1);
  return claim;
}

function assertRewardEligibility(context: RewardContext) {
  if (context.submission.status !== "approved") {
    throw new RewardActionError("not-eligible", 409, "This mission must be approved before its reward is eligible.");
  }
  if (context.mission.rewardAsset?.toUpperCase() !== "XLM") {
    throw new RewardActionError("not-eligible", 409, "This mission does not have a native XLM reward.");
  }

  let amount: string;
  try {
    amount = normalizeXlmAmount(context.mission.rewardAmount ?? "");
  } catch {
    throw new RewardActionError("not-eligible", 409, "This mission has an invalid reward amount.");
  }
  if (compareXlmAmounts(amount, "0") <= 0) {
    throw new RewardActionError("not-eligible", 409, "This mission does not have a positive reward amount.");
  }

  return amount;
}

async function transitionToSubmitted(database: ReturnType<typeof getDatabase>, claim: RewardClaimRow) {
  if (claim.status === "submitted") return claim;
  if (claim.status === "confirmed") return claim;
  if (claim.status === "expired") {
    throw new RewardActionError("not-eligible", 409, "This reward has expired and cannot be claimed.");
  }

  const [updated] = await database
    .update(rewardClaims)
    .set({
      status: "submitted",
      failureCode: null,
      failureMessage: null,
      submittedAt: claim.submittedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(rewardClaims.id, claim.id), inArray(rewardClaims.status, ["claimable", "failed"])))
    .returning();

  return updated ?? (await getClaim(database, claim.missionSubmissionId)) ?? claim;
}

export function requireRewardSession(session: AuthenticatedSession | null): AuthenticatedSession {
  if (!session) {
    throw new RewardActionError("unauthenticated", 401, "Connect a verified Stellar wallet before claiming a reward.");
  }
  return session;
}

export async function claimRewardForSession(
  submissionId: string,
  session: AuthenticatedSession,
  options: ClaimOptions = {},
): Promise<RewardStateView> {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
    throw new RewardActionError("invalid-submission", 400, "That mission submission is invalid.");
  }

  const database = getDatabase();
  try {
    const context = await getRewardContext(database, submissionId, session.user.id);
    if (!context) {
      throw new RewardActionError("not-found", 404, "That reward could not be found.");
    }

    const amount = assertRewardEligibility(context);
    let networkConfig;
    try {
      networkConfig = getRewardNetworkConfig();
      if (!options.settle) {
        const { getRewardSettlementConfig } = await import("@/lib/rewards/config");
        getRewardSettlementConfig();
      }
    } catch (error) {
      throw mapConfigurationError(error);
    }

    await database
      .insert(rewardClaims)
      .values({
        missionSubmissionId: context.submission.id,
        missionId: context.mission.id,
        userId: session.user.id,
        walletId: session.wallet.id,
        network: networkConfig.network,
        asset: "XLM",
        amount,
        destinationPublicKey: session.wallet.publicKey,
        status: "claimable",
      })
      .onConflictDoNothing({ target: rewardClaims.missionSubmissionId });

    let claim = await getClaim(database, context.submission.id);
    if (!claim) {
      throw new RewardActionError("reward-unavailable", 503, "The reward could not be created. Try again later.");
    }
    if (claim.walletId !== session.wallet.id) {
      throw new RewardActionError(
        "wallet-mismatch",
        409,
        "This reward is linked to a different verified Stellar wallet.",
      );
    }
    if (claim.status === "confirmed") return mapRewardClaim(claim, context);
    if (claim.status === "submitted" && !claim.signedEnvelopeXdr) return mapRewardClaim(claim, context);

    claim = await transitionToSubmitted(database, claim);
    if (claim.status === "confirmed") return mapRewardClaim(claim, context);
    if (claim.status !== "submitted") return mapRewardClaim(claim, context);

    const settlementClaim: RewardSettlementClaim = {
      network: claim.network === "public" ? "public" : "testnet",
      amount: normalizeXlmAmount(String(claim.amount)),
      destinationPublicKey: claim.destinationPublicKey,
      transactionHash: claim.transactionHash,
      signedEnvelopeXdr: claim.signedEnvelopeXdr,
    };

    try {
      let confirmation: ConfirmedRewardSettlement;
      if (options.settle) {
        confirmation = await options.settle(settlementClaim);
      } else {
        const { settleReward } = await import("@/lib/rewards/settlement");
        confirmation = await settleReward(settlementClaim, async (prepared) => {
          const [stored] = await database
            .update(rewardClaims)
            .set({
              transactionHash: prepared.transactionHash,
              signedEnvelopeXdr: prepared.signedEnvelopeXdr,
              updatedAt: new Date(),
            })
            .where(and(eq(rewardClaims.id, claim.id), eq(rewardClaims.status, "submitted")))
            .returning({ id: rewardClaims.id });
          if (!stored) {
            throw new RewardSettlementError(
              "recovery_required",
              "The reward claim changed while its transaction was being prepared.",
            );
          }
        });
      }

      await database
        .update(rewardClaims)
        .set({
          status: "confirmed",
          transactionHash: confirmation.transactionHash,
          ledger: confirmation.ledger,
          confirmedAt: confirmation.confirmedAt,
          updatedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        })
        .where(and(eq(rewardClaims.id, claim.id), eq(rewardClaims.status, "submitted")));
    } catch (error) {
      if (!(error instanceof RewardSettlementError)) throw error;
      await database
        .update(rewardClaims)
        .set({
          status: "failed",
          failureCode: error.code,
          failureMessage: error.message,
          updatedAt: new Date(),
        })
        .where(and(eq(rewardClaims.id, claim.id), eq(rewardClaims.status, "submitted")));
    }

    const finalClaim = await getClaim(database, context.submission.id);
    if (!finalClaim) {
      throw new RewardActionError("reward-unavailable", 503, "The reward receipt could not be loaded.");
    }
    return mapRewardClaim(finalClaim, context);
  } catch (error) {
    if (error instanceof RewardActionError || error instanceof RewardSettlementError) throw error;
    if (isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("claim reward");
  }
}
