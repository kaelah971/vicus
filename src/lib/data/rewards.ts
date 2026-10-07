import { eq } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import { circles, missionSubmissions, missions, rewardClaims } from "@/db/schema";
import { getRewardNetworkConfig, normalizeXlmAmount, rewardExplorerUrl } from "@/lib/rewards/config-core";
import type { RewardFailureCode, RewardReceiptView, RewardStateView } from "@/lib/rewards/types";

const failureCodes: RewardFailureCode[] = [
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

function failureCode(value: string | null): RewardFailureCode | null {
  return value && failureCodes.includes(value as RewardFailureCode) ? (value as RewardFailureCode) : null;
}

function isoDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function rewardState({
  claim,
  submissionId,
  mission,
  circle,
  destinationPublicKey,
  network,
}: {
  claim: typeof rewardClaims.$inferSelect | null;
  submissionId: string;
  mission: typeof missions.$inferSelect;
  circle: typeof circles.$inferSelect;
  destinationPublicKey: string;
  network: RewardStateView["network"];
}): RewardStateView {
  return {
    id: claim?.id ?? null,
    submissionId,
    missionId: mission.id,
    missionTitle: mission.title,
    circleName: circle.name,
    asset: "XLM",
    amount: normalizeXlmAmount(String(claim?.amount ?? mission.rewardAmount)),
    network: claim?.network === "public" ? "public" : network,
    destinationPublicKey: claim?.destinationPublicKey ?? destinationPublicKey,
    status: (claim?.status ?? "eligible") as RewardStateView["status"],
    transactionHash: claim?.transactionHash ?? null,
    ledger: claim?.ledger ?? null,
    failureCode: failureCode(claim?.failureCode ?? null),
    failureMessage: claim?.failureMessage ?? null,
    createdAt: isoDate(claim?.createdAt ?? null),
    submittedAt: isoDate(claim?.submittedAt ?? null),
    confirmedAt: isoDate(claim?.confirmedAt ?? null),
    explorerUrl: rewardExplorerUrl(
      claim?.network === "public" ? "public" : network,
      claim?.transactionHash ?? null,
    ),
  };
}

function isRewardEnabled(mission: typeof missions.$inferSelect): boolean {
  if (mission.rewardAsset?.toUpperCase() !== "XLM") return false;
  try {
    return normalizeXlmAmount(mission.rewardAmount ?? "") !== "0";
  } catch {
    return false;
  }
}

export async function getUserRewardStates(
  userId: string,
  destinationPublicKey: string | null,
): Promise<RewardStateView[]> {
  if (!destinationPublicKey) return [];

  try {
    const database = getDatabase();
    const network = getRewardNetworkConfig().network;
    const rows = await database
      .select({ submission: missionSubmissions, mission: missions, circle: circles, claim: rewardClaims })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .leftJoin(rewardClaims, eq(rewardClaims.missionSubmissionId, missionSubmissions.id))
      .where(eq(missionSubmissions.userId, userId));

    return rows.flatMap(({ submission, mission, circle, claim }) => {
      if (submission.status !== "approved" || !isRewardEnabled(mission)) return [];
      return [rewardState({ claim, submissionId: submission.id, mission, circle, destinationPublicKey, network })];
    });
  } catch {
    throw toDatabaseUnavailableError("get user rewards");
  }
}

export async function getRewardReceiptById(
  rewardId: string,
  userId: string,
  isAdmin = false,
): Promise<RewardReceiptView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(rewardId)) return null;

  try {
    const database = getDatabase();
    const [row] = await database
      .select({ claim: rewardClaims, mission: missions, circle: circles })
      .from(rewardClaims)
      .innerJoin(missions, eq(rewardClaims.missionId, missions.id))
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .where(eq(rewardClaims.id, rewardId))
      .limit(1);

    if (!row || (!isAdmin && row.claim.userId !== userId)) return null;
    const network = row.claim.network === "public" ? "public" : "testnet";
    const state = rewardState({
      claim: row.claim,
      submissionId: row.claim.missionSubmissionId,
      mission: row.mission,
      circle: row.circle,
      destinationPublicKey: row.claim.destinationPublicKey,
      network,
    });
    return { ...state, id: row.claim.id, destinationPublicKey: row.claim.destinationPublicKey };
  } catch {
    throw toDatabaseUnavailableError("get reward receipt");
  }
}
