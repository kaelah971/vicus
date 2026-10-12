import "server-only";
import { and, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import {
  assetCapabilities,
  missionSubmissions,
  missions,
  onchainActionProofs,
} from "@/db/schema";
import { getMissionSubmissionContext, mapSubmissionState } from "@/lib/data/missions";
import { parseMissionConfig } from "@/lib/missions/config";
import type { StoredOnchainActionConfig } from "@/lib/missions/types";
import { MissionActionError } from "@/lib/missions/errors";
import {
  normalizeTransactionHash,
  verificationFailureMessage,
  verifyOnchainPayment,
  type HorizonFetch,
} from "@/lib/activation/verifier";

export type OnchainProofInput = {
  missionId: string;
  userId: string;
  walletPublicKey: string | null;
  transactionHash: unknown;
  fetchJson?: HorizonFetch;
};

/**
 * Open activation missions for a Circle, keyed by capability type.
 * Powers the "Mission available" affordance on capability cards.
 */
export async function getActivationMissionLinks(
  circleId: string,
): Promise<Map<string, { id: string; title: string }>> {
  const links = new Map<string, { id: string; title: string }>();
  if (!/^[0-9a-f-]{36}$/i.test(circleId)) return links;
  try {
    const database = getDatabase();
    const rows = await database
      .select({
        missionId: missions.id,
        title: missions.title,
        capabilityType: assetCapabilities.capabilityType,
      })
      .from(missions)
      .innerJoin(assetCapabilities, eq(missions.assetCapabilityId, assetCapabilities.id))
      .where(
        and(
          eq(missions.circleId, circleId),
          eq(missions.type, "onchain_action"),
          eq(missions.status, "open"),
        ),
      );
    for (const row of rows) {
      if (!links.has(row.capabilityType)) {
        links.set(row.capabilityType, { id: row.missionId, title: row.title });
      }
    }
  } catch {
    // Capability cards render without mission links rather than failing the Circle.
  }
  return links;
}

function assertOpenMissionStatus(status: string) {
  if (status !== "open") {
    throw new MissionActionError(
      "mission-closed",
      "This mission is not currently accepting responses.",
      409,
    );
  }
}

/**
 * Effect core for ONCHAIN_ACTION proofs. Authorization (session, same-origin,
 * wallet binding) stays in the API wrapper / submitMission caller — this core
 * receives the already-authenticated wallet and enforces everything else.
 */
export async function submitOnchainProof(input: OnchainProofInput) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(input.missionId) || !/^[0-9a-f-]{36}$/i.test(input.userId)) {
      throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
    }
    if (!input.walletPublicKey || !/^G[A-Z2-7]{55}$/.test(input.walletPublicKey)) {
      throw new MissionActionError(
        "unauthenticated",
        "Connect a verified Stellar wallet before submitting a mission response.",
        401,
      );
    }

    const context = await getMissionSubmissionContext(input.missionId, input.userId);
    if (!context) {
      throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
    }
    if (!context.participant) {
      throw new MissionActionError("unauthenticated", "Your Vicus session is no longer valid.", 401);
    }
    assertOpenMissionStatus(context.mission.status);

    const rawConfig = context.mission.missionConfig as Record<string, unknown> | null;
    if (
      !rawConfig ||
      rawConfig.kind !== "onchain_action" ||
      context.mission.type !== "onchain_action"
    ) {
      throw new MissionActionError(
        "unsupported-mission",
        "This mission is not configured for a live submission.",
        409,
      );
    }
    const config = parseMissionConfig(rawConfig);
    if (!config || config.kind !== "onchain_action") {
      throw new MissionActionError(
        "unsupported-mission",
        "This mission is not configured for a live submission.",
        409,
      );
    }
    const onchainConfig: StoredOnchainActionConfig = config;

    // Capability relation: a linked capability must belong to the mission Circle.
    if (context.mission.assetCapabilityId) {
      const database = getDatabase();
      const [capability] = await database
        .select({
          id: assetCapabilities.id,
          circleId: assetCapabilities.circleId,
          capabilityType: assetCapabilities.capabilityType,
          active: assetCapabilities.active,
        })
        .from(assetCapabilities)
        .where(eq(assetCapabilities.id, context.mission.assetCapabilityId))
        .limit(1);
      if (!capability || capability.circleId !== context.mission.circleId || !capability.active) {
        throw new MissionActionError(
          "unsupported-mission",
          "This mission is not configured for a live submission.",
          409,
        );
      }
    }

    const existing = context.submission;
    if (
      existing &&
      (existing.status !== "needs_revision" || context.mission.duplicatePolicy !== "allow-revision")
    ) {
      throw new MissionActionError(
        "duplicate-submission",
        "A submission already exists for this mission. Review its current state before trying again.",
        409,
      );
    }

    const hash = normalizeTransactionHash(input.transactionHash);
    if (!hash) {
      throw new MissionActionError(
        "invalid-request",
        "Enter a valid 64-character Stellar transaction hash.",
        400,
      );
    }

    const participant = context.participant;

    const database = getDatabase();
    const now = new Date();

    const storeRetryable = async (reason: string) => {
      const values = {
        content: "Onchain Stellar Mainnet payment submitted for verification.",
        evidenceUrl: null,
        score: null,
        status: "needs_revision",
        reviewedBy: null,
        reviewedAt: now,
        revisionReason: reason,
        submittedAt: now,
        updatedAt: now,
      } as const;
      const rows = existing
        ? await database
            .update(missionSubmissions)
            .set(values)
            .where(
              and(
                eq(missionSubmissions.id, existing.id),
                eq(missionSubmissions.status, "needs_revision"),
              ),
            )
            .returning()
        : await database
            .insert(missionSubmissions)
            .values({
              missionId: context.mission.id,
              userId: participant.id,
              ...values,
            })
            .returning();
      const submission = rows[0] ?? null;
      if (!submission) {
        throw new MissionActionError(
          "invalid-transition",
          "This submission changed while verifying. Review its current state before trying again.",
          409,
        );
      }
      return mapSubmissionState(submission);
    };

    const verification = await verifyOnchainPayment(
      hash,
      {
        expectedSource: input.walletPublicKey,
        assetCode: onchainConfig.assetCode,
        assetIssuer: onchainConfig.assetIssuer,
        minimumAmount: onchainConfig.minimumAmount,
        proofNotBefore: onchainConfig.proofNotBefore,
      },
      input.fetchJson,
    );

    if (!verification.ok) {
      const reason = verificationFailureMessage(verification.failure);
      const submission = await storeRetryable(reason);
      if (!submission) {
        throw new MissionActionError("invalid-transition", "The submission has an unknown state.", 409);
      }
      return { submission, pointsAwarded: 0, message: reason };
    }

    const payment = verification.payment;
    // Proof claim: exactly one submission may own a (mission, hash) pair.
    // onConflictDoNothing makes concurrent duplicates safe — the loser gets no row.
    const submissionValues = {
      content: "Onchain Stellar Mainnet payment verified.",
      evidenceUrl: null,
      score: null,
      status: "approved",
      reviewedBy: null,
      reviewedAt: now,
      revisionReason: null,
      submittedAt: now,
      updatedAt: now,
    } as const;

    let submissionRow: typeof missionSubmissions.$inferSelect | null = null;
    if (existing) {
      const updated = await database
        .update(missionSubmissions)
        .set(submissionValues)
        .where(
          and(
            eq(missionSubmissions.id, existing.id),
            eq(missionSubmissions.status, "needs_revision"),
          ),
        )
        .returning();
      submissionRow = updated[0] ?? null;
    } else {
      try {
        const inserted = await database
          .insert(missionSubmissions)
          .values({
            missionId: context.mission.id,
            userId: participant.id,
            ...submissionValues,
          })
          .returning();
        submissionRow = inserted[0] ?? null;
      } catch {
        submissionRow = null;
      }
    }
    if (!submissionRow) {
      throw new MissionActionError(
        "invalid-transition",
        "This submission changed while verifying. Review its current state before trying again.",
        409,
      );
    }

    const proofRows = await database
      .insert(onchainActionProofs)
      .values({
        submissionId: submissionRow.id,
        missionId: context.mission.id,
        userId: participant.id,
        network: "stellar_mainnet",
        transactionHash: hash,
        operationIndex: payment.operationIndex,
        sourceAccount: payment.sourceAccount,
        destinationAccount: payment.destinationAccount,
        assetCode: payment.assetCode,
        assetIssuer: payment.assetIssuer,
        amount: payment.amount,
        ledger: payment.ledger,
        transactionCreatedAt: payment.transactionCreatedAt
          ? new Date(payment.transactionCreatedAt)
          : null,
      })
      .onConflictDoNothing({
        target: [onchainActionProofs.missionId, onchainActionProofs.transactionHash],
      })
      .returning({ id: onchainActionProofs.id });

    if (!proofRows[0]) {
      // A concurrent submission won this proof. Reopen ours as retryable;
      // no points, no reward eligibility from this call.
      await database
        .update(missionSubmissions)
        .set({
          status: "needs_revision",
          revisionReason: verificationFailureMessage("proof-reused"),
          updatedAt: new Date(),
        })
        .where(eq(missionSubmissions.id, submissionRow.id));
      const [reopened] = await database
        .select()
        .from(missionSubmissions)
        .where(eq(missionSubmissions.id, submissionRow.id))
        .limit(1);
      const submission = mapSubmissionState(reopened ?? null);
      if (!submission) {
        throw new MissionActionError("invalid-transition", "The submission has an unknown state.", 409);
      }
      return {
        submission,
        pointsAwarded: 0,
        message: verificationFailureMessage("proof-reused"),
      };
    }

    const submission = mapSubmissionState(submissionRow);
    if (!submission) {
      throw new MissionActionError("invalid-transition", "The submission has an unknown state.", 409);
    }
    const rewardConfigured = Boolean(
      context.mission.rewardAsset && context.mission.rewardAmount,
    );
    return {
      submission,
      pointsAwarded: context.mission.points,
      message: rewardConfigured
        ? `You completed this mission and earned ${context.mission.points} Vicus points. Your reward is now eligible to claim from your profile.`
        : `You completed this mission and earned ${context.mission.points} Vicus points. No blockchain reward was created.`,
    };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    if (isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("submit onchain proof");
  }
}
