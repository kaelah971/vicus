import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { circles, assets, assetCapabilities, missionSubmissions, missions, organizationMemberships, organizations, users } from "@/db/schema";
import { normalizeXlmAmount } from "@/lib/rewards/config-core";
import { normalizeDecimal7, compareDecimal7 } from "@/lib/missions/config";
import {
  assertOpenMission,
  getMissionSubmissionContext,
  mapSubmissionState,
} from "@/lib/data/missions";
import {
  gradeQuiz,
  isHttpUrl,
  parseMissionConfig,
} from "@/lib/missions/config";
import { MissionActionError } from "@/lib/missions/errors";
import type { SubmissionOutcome } from "@/lib/missions/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function preserveExpectedError(error: unknown): boolean {
  return (
    error instanceof MissionActionError || isDatabaseUnavailableError(error)
  );
}

function getSubmissionOrThrow(
  submission: ReturnType<typeof mapSubmissionState>,
): NonNullable<ReturnType<typeof mapSubmissionState>> {
  if (!submission) {
    throw new MissionActionError("invalid-transition", "The submission has an unknown state.", 409);
  }

  return submission;
}

function approvedMissionMessage(mission: typeof missions.$inferSelect, points: number) {
  const rewardConfigured = Boolean(
    mission.rewardAsset && mission.rewardAmount && Number(mission.rewardAmount) > 0,
  );
  return rewardConfigured
    ? `You completed this mission and earned ${points} Vicus points. Your reward is now eligible to claim from your profile.`
    : `You completed this mission and earned ${points} Vicus points. No blockchain reward was created.`;
}

export async function submitMission(
  missionId: string,
  payload: unknown,
  userId?: string | null,
  walletPublicKey?: string | null,
): Promise<SubmissionOutcome> {
  try {
    if (!userId) {
      throw new MissionActionError(
        "unauthenticated",
        "Connect a verified Stellar wallet before submitting a mission response.",
        401,
      );
    }

    if (!isRecord(payload)) {
      throw new MissionActionError("invalid-request", "Send a mission response to submit.");
    }

    const context = await getMissionSubmissionContext(missionId, userId);
    if (!context) {
      throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
    }
    if (!context.participant) {
      throw new MissionActionError("unauthenticated", "Your Vicus session is no longer valid.", 401);
    }

    assertOpenMission(context.mission);
    const config = parseMissionConfig(context.mission.missionConfig);
    if (!config) {
      throw new MissionActionError(
        "unsupported-mission",
        "This mission is not configured for a live submission.",
        409,
      );
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

    const database = getDatabase();
    const now = new Date();

    if (config.kind === "onchain_action") {
      if (context.mission.type !== "onchain_action" || !isRecord(payload)) {
        throw new MissionActionError("invalid-request", "Submit a transaction hash to prove this activation.");
      }
      const { submitOnchainProof } = await import("@/lib/activation/service");
      return submitOnchainProof({
        missionId: context.mission.id,
        userId: context.participant.id,
        walletPublicKey: walletPublicKey ?? null,
        transactionHash: payload.transactionHash,
      });
    }

    if (config.kind === "quiz") {
      if (context.mission.type !== "quiz" || !isRecord(payload.answers)) {
        throw new MissionActionError("invalid-quiz", "Submit an answer for every quiz question.");
      }

      const answers: Record<string, string> = {};
      for (const [questionId, answer] of Object.entries(payload.answers)) {
        if (typeof answer !== "string" || answer.length > 300) {
          throw new MissionActionError("invalid-quiz", "One or more quiz answers is invalid.");
        }
        answers[questionId] = answer;
      }

      if (JSON.stringify(answers).length > 10_000) {
        throw new MissionActionError("invalid-quiz", "The quiz response is too large.");
      }

      const grading = gradeQuiz(config, answers);
      if (!grading) {
        throw new MissionActionError("invalid-quiz", "Answer every quiz question before submitting.");
      }

      const passed = grading.passed;
      const status = passed ? "approved" : "needs_revision";
      const revisionReason = passed
        ? null
        : "Review what the asset represents, its limits, and the stated risk context before trying again.";
      const values = {
        content: JSON.stringify({ answers }),
        evidenceUrl: null,
        score: grading.score,
        status,
        reviewedBy: null,
        reviewedAt: now,
        revisionReason,
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
              userId: context.participant.id,
              ...values,
            })
            .returning();
      const submission = getSubmissionOrThrow(mapSubmissionState(rows[0] ?? null));

      return {
        submission,
        pointsAwarded: passed ? context.mission.points : 0,
        message: passed
          ? approvedMissionMessage(context.mission, context.mission.points)
          : "Your response needs one more review of the Passport before you can pass this mission.",
      };
    }

    if (
      (config.kind !== "text" && config.kind !== "research") ||
      (context.mission.type !== "text" && context.mission.type !== "research")
    ) {
      throw new MissionActionError(
        "unsupported-mission",
        "This mission type is not configured for a live submission.",
        409,
      );
    }

    const content = asNonEmptyString(payload.content);
    if (!content || content.length < config.minLength || content.length > config.maxLength) {
      throw new MissionActionError(
        "invalid-text",
        `Write between ${config.minLength} and ${config.maxLength} characters before submitting.`,
      );
    }

    const evidenceUrl = asNonEmptyString(payload.evidenceUrl);
    if (config.evidenceRequired && !evidenceUrl) {
      throw new MissionActionError("invalid-text", "Add one source link before submitting.");
    }

    if (evidenceUrl && (evidenceUrl.length > 500 || !isHttpUrl(evidenceUrl))) {
      throw new MissionActionError("invalid-text", "Use a valid http or https source link.");
    }

    const values = {
      content,
      evidenceUrl: evidenceUrl ?? null,
      score: null,
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      revisionReason: null,
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
            userId: context.participant.id,
            ...values,
          })
          .returning();
    const submission = getSubmissionOrThrow(mapSubmissionState(rows[0] ?? null));

    return {
      submission,
      pointsAwarded: 0,
      message: "Your response is waiting for review.",
    };
  } catch (error) {
    if (preserveExpectedError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("submit mission");
  }
}

export type ReviewAction = "approved" | "rejected" | "needs_revision";

export async function reviewMissionSubmission(
  submissionId: string,
  action: ReviewAction,
  reasonValue: unknown,
  reviewerId?: string | null,
): Promise<SubmissionOutcome> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
      throw new MissionActionError("submission-not-found", "That submission could not be found.", 404);
    }

    const reason = asNonEmptyString(reasonValue);
    if (action !== "approved" && (!reason || reason.length > 1_000)) {
      throw new MissionActionError(
        "invalid-request",
        "Add a review reason of 1,000 characters or fewer.",
      );
    }

    if (!reviewerId) {
      throw new MissionActionError("unauthenticated", "Sign in with an admin wallet to review submissions.", 401);
    }

    const database = getDatabase();
    const [reviewer] = await database
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, reviewerId))
      .limit(1);
    if (!reviewer || reviewer.role !== "admin") {
      throw new MissionActionError("forbidden", "This wallet is not authorized to review submissions.", 403);
    }

    const [row] = await database
      .select({ submission: missionSubmissions, mission: missions })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .where(eq(missionSubmissions.id, submissionId))
      .limit(1);

    if (!row) {
      throw new MissionActionError("submission-not-found", "That submission could not be found.", 404);
    }

    return applyReviewDecision(database, row, submissionId, action, reason, reviewer.id);
  } catch (error) {
    if (preserveExpectedError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("review mission submission");
  }
}

export type ReviewDecisionRow = {
  submission: typeof missionSubmissions.$inferSelect;
  mission: typeof missions.$inferSelect;
};

/**
 * Shared review core: grading/points/eligibility behavior is identical
 * whether the reviewer is authorized as a global admin or as an
 * organization's owner/admin. Only the authorization differs.
 */
export async function applyReviewDecision(
  database: ReturnType<typeof getDatabase>,
  row: ReviewDecisionRow,
  submissionId: string,
  action: ReviewAction,
  reason: string | null,
  reviewerId: string,
): Promise<SubmissionOutcome> {
  if (row.submission.status !== "pending") {
    throw new MissionActionError(
      "invalid-transition",
      "This submission is no longer waiting for review.",
      409,
    );
  }

  const now = new Date();
  const updatedRows = await database
    .update(missionSubmissions)
    .set({
      status: action,
      reviewedBy: reviewerId,
      reviewedAt: now,
      revisionReason: action === "approved" ? null : reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(missionSubmissions.id, submissionId),
        eq(missionSubmissions.status, "pending"),
      ),
    )
    .returning();
  const submission = getSubmissionOrThrow(mapSubmissionState(updatedRows[0] ?? null));
  const pointsAwarded = action === "approved" ? row.mission.points : 0;
  return {
    submission,
    pointsAwarded,
    message:
      action === "approved"
        ? approvedMissionMessage(row.mission, pointsAwarded)
        : action === "needs_revision"
          ? "Your response needs one more piece of evidence."
          : "This response was not approved. Review the reason and try again if the mission allows it.",
  };
}

export type MissionCreateType = "quiz" | "text" | "research" | "onchain_action";

export type MissionCreateQuizQuestion = {
  prompt: unknown;
  choices: unknown;
  correctAnswer: unknown;
};

export type MissionCreateInput = {
  circleId: unknown;
  organizationId?: unknown;
  title: unknown;
  description: unknown;
  type: unknown;
  points: unknown;
  status: unknown;
  rewardEnabled: unknown;
  rewardAmount: unknown;
  questions: MissionCreateQuizQuestion[] | unknown;
  evidenceRequired: unknown;
  evidencePrompt: unknown;
  minimumAmount?: unknown;
};

export type MissionCreateOutcome = {
  mission: {
    id: string;
    circleId: string;
    type: string;
    title: string;
    status: string;
    points: number;
    rewardAsset: string | null;
    rewardAmount: string | null;
  };
};

function asBoundedString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

async function assertMissionCreator(creatorId: string) {
  const database = getDatabase();
  const [creator] = await database
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .limit(1);

  if (!creator) {
    throw new MissionActionError("unauthenticated", "Sign in with an admin wallet to create missions.", 401);
  }

  if (creator.role !== "admin") {
    throw new MissionActionError("forbidden", "This wallet is not authorized to create missions.", 403);
  }
}

/**
 * Organization creation path: owners, admins, and editors may create
 * missions, but only for their own organization. Membership is read directly
 * here so the mission pipeline stays a single function without a module
 * cycle with the organization service.
 */
async function assertOrgMissionCreator(creatorId: string, organizationId: string): Promise<string> {
  const database = getDatabase();
  const [creator] = await database
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .limit(1);

  if (!creator) {
    throw new MissionActionError("unauthenticated", "Sign in to create missions for this organization.", 401);
  }

  if (creator.role === "admin") {
    return creator.id;
  }

  const [membership] = await database
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, creatorId),
      ),
    )
    .limit(1);

  if (!membership || !["owner", "admin", "editor"].includes(membership.role)) {
    throw new MissionActionError("forbidden", "This wallet is not authorized to create missions for this organization.", 403);
  }

  return creator.id;
}

function buildQuizConfig(questionsValue: unknown): Record<string, unknown> {
  if (!Array.isArray(questionsValue) || questionsValue.length < 1 || questionsValue.length > 10) {
    throw new MissionActionError("invalid-request", "Add between 1 and 10 quiz questions.", 400);
  }

  const questions = questionsValue.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new MissionActionError("invalid-request", `Question ${index + 1} is invalid.`, 400);
    }

    const prompt = asBoundedString(entry.prompt, 8, 500);
    if (!prompt) {
      throw new MissionActionError("invalid-request", `Question ${index + 1} needs a prompt of 8 to 500 characters.`, 400);
    }

    const rawChoices = Array.isArray(entry.choices) ? entry.choices : null;
    const choices = rawChoices
      ?.filter((choice): choice is string => typeof choice === "string")
      .map((choice) => choice.trim())
      .filter(Boolean);
    const uniqueChoices = choices ? Array.from(new Set(choices)) : [];
    if (uniqueChoices.length < 2 || uniqueChoices.length > 6 || uniqueChoices.some((choice) => choice.length > 280)) {
      throw new MissionActionError("invalid-request", `Question ${index + 1} needs 2 to 6 unique choices of 280 characters or fewer.`, 400);
    }

    const correctAnswer = typeof entry.correctAnswer === "string" ? entry.correctAnswer.trim() : "";
    if (!uniqueChoices.includes(correctAnswer)) {
      throw new MissionActionError("invalid-request", `Question ${index + 1} needs a correct answer matching one of its choices.`, 400);
    }

    return { id: `q${index + 1}`, prompt, choices: uniqueChoices, correctAnswer };
  });

  return { kind: "quiz", passingScore: questions.length, questions };
}

function buildTextConfig(
  kind: "text" | "research",
  evidenceRequiredValue: unknown,
  evidencePromptValue: unknown,
): Record<string, unknown> {
  const evidenceRequired = evidenceRequiredValue === true;
  const evidencePrompt = asBoundedString(evidencePromptValue, 8, 500);
  if (!evidencePrompt) {
    throw new MissionActionError("invalid-request", "Add source guidance of 8 to 500 characters.", 400);
  }

  return {
    kind,
    minLength: kind === "text" ? 80 : 40,
    maxLength: 2_000,
    evidenceRequired,
    evidencePrompt,
  };
}

/**
 * Create a mission for an existing circle. Admin-only; answer keys stay in
 * server-side missionConfig and are stripped from public payloads by
 * publicMissionConfig. Rewards reuse the existing XLM eligibility path:
 * creation only configures them, never settles anything.
 */
/**
 * Server-derived Stellar activation config. Asset identity comes from the
 * Circle's own verified asset record — admins never supply issuer data.
 * Only classic-asset Mainnet Circles with an active Send capability qualify.
 */
async function buildOnchainActionConfig(
  circleId: string,
  minimumAmountValue: unknown,
): Promise<{ config: Record<string, unknown>; assetCapabilityId: string }> {
  const minimumAmount = normalizeDecimal7(minimumAmountValue);
  if (!minimumAmount || compareDecimal7(minimumAmount, "1000000.0000000") > 0) {
    throw new MissionActionError(
      "invalid-request",
      "Set a positive activation minimum of at most 1,000,000 asset units.",
      400,
    );
  }
  const database = getDatabase();
  const [row] = await database
    .select({
      assetId: circles.assetId,
      verificationMode: assets.verificationMode,
      stellarNetwork: assets.stellarNetwork,
      stellarAssetCode: assets.stellarAssetCode,
      stellarIssuerAccount: assets.stellarIssuerAccount,
    })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(eq(circles.id, circleId))
    .limit(1);
  if (
    !row ||
    row.verificationMode !== "classic-asset" ||
    row.stellarNetwork !== "mainnet" ||
    !row.stellarAssetCode ||
    !row.stellarIssuerAccount
  ) {
    throw new MissionActionError(
      "invalid-request",
      "Activation missions require a Circle with a verified Stellar Mainnet asset.",
      400,
    );
  }
  const [capability] = await database
    .select({ id: assetCapabilities.id })
    .from(assetCapabilities)
    .where(
      and(
        eq(assetCapabilities.circleId, circleId),
        eq(assetCapabilities.capabilityType, "send"),
        eq(assetCapabilities.active, true),
      ),
    )
    .limit(1);
  if (!capability) {
    throw new MissionActionError(
      "invalid-request",
      "Activation missions require an active Send capability on the Circle.",
      400,
    );
  }
  return {
    config: {
      kind: "onchain_action",
      network: "stellar_mainnet",
      action: "payment",
      assetCode: row.stellarAssetCode,
      assetIssuer: row.stellarIssuerAccount,
      minimumAmount,
      proofNotBefore: new Date().toISOString(),
    },
    assetCapabilityId: capability.id,
  };
}

export async function createMission(
  input: MissionCreateInput,
  creatorId: string,
): Promise<MissionCreateOutcome> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(creatorId)) {
      throw new MissionActionError("unauthenticated", "Sign in with an admin wallet to create missions.", 401);
    }

    const orgClaim =
      input.organizationId !== undefined && input.organizationId !== null
        ? String(input.organizationId)
        : null;
    if (orgClaim) {
      // Organization path: membership authorizes creation for the org's circles.
      await assertOrgMissionCreator(creatorId, orgClaim);
    } else {
      await assertMissionCreator(creatorId);
    }

    const circleId = typeof input.circleId === "string" ? input.circleId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(circleId)) {
      throw new MissionActionError("invalid-request", "Choose an existing Circle for this mission.", 400);
    }

    const title = asBoundedString(input.title, 8, 180);
    if (!title) {
      throw new MissionActionError("invalid-request", "Add a mission title of 8 to 180 characters.", 400);
    }

    const description = asBoundedString(input.description, 20, 2_000);
    if (!description) {
      throw new MissionActionError("invalid-request", "Add mission instructions of 20 to 2,000 characters.", 400);
    }

    if (input.type !== "quiz" && input.type !== "text" && input.type !== "research" && input.type !== "onchain_action") {
      throw new MissionActionError("invalid-request", "Choose a quiz, text, research, or onchain activation mission type.", 400);
    }

    if (input.status !== "draft" && input.status !== "open") {
      throw new MissionActionError("invalid-request", "New missions start as draft or open.", 400);
    }

    const points = typeof input.points === "number" && Number.isInteger(input.points) ? input.points : null;
    if (points === null || points < 0 || points > 10_000) {
      throw new MissionActionError("invalid-request", "Set Vicus points between 0 and 10,000.", 400);
    }

    let rewardAsset: string | null = null;
    let rewardAmount: string | null = null;
    if (input.rewardEnabled === true) {
      rewardAsset = "XLM";
      try {
        rewardAmount = normalizeXlmAmount(typeof input.rewardAmount === "string" ? input.rewardAmount : "");
      } catch {
        throw new MissionActionError("invalid-request", "Set a positive XLM reward amount.", 400);
      }
      if (Number(rewardAmount) <= 0) {
        throw new MissionActionError("invalid-request", "Set a positive XLM reward amount.", 400);
      }
    }

    let assetCapabilityId: string | null = null;
    const missionConfig =
      input.type === "quiz"
        ? buildQuizConfig(input.questions)
        : input.type === "onchain_action"
          ? await buildOnchainActionConfig(circleId, input.minimumAmount).then((derived) => {
              assetCapabilityId = derived.assetCapabilityId;
              return derived.config;
            })
          : buildTextConfig(input.type, input.evidenceRequired, input.evidencePrompt);

    if (!parseMissionConfig(missionConfig)) {
      throw new MissionActionError("invalid-request", "The mission configuration is invalid.", 400);
    }

    const database = getDatabase();
    const [circle] = await database
      .select({ id: circles.id })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!circle) {
      throw new MissionActionError("mission-not-found", "That Circle could not be found.", 404);
    }

    // Optional ownership relation. Authorization is enforced by the caller
    // (global admin path or organization path); creation still flows through
    // this single pipeline.
    let organizationDbId: string | null = null;
    if (input.organizationId !== undefined && input.organizationId !== null) {
      if (typeof input.organizationId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.organizationId)) {
        throw new MissionActionError("invalid-request", "The organization is invalid.", 400);
      }
      const [org] = await database
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      if (!org) {
        throw new MissionActionError("invalid-request", "That organization could not be found.", 404);
      }
      organizationDbId = org.id;
    }

    const now = new Date();
    const [created] = await database
      .insert(missions)
      .values({
        id: randomUUID(),
        circleId: circle.id,
        campaignId: null,
        organizationId: organizationDbId,
        type: input.type,
        title,
        description,
        points,
        rewardAsset,
        rewardAmount,
        eligibilityRule: { kind: "education-only", note: "Created in Campaign Studio; eligibility follows review state." },
        missionConfig,
        assetCapabilityId,
        duplicatePolicy: "allow-revision",
        reviewMode: input.type === "quiz" || input.type === "onchain_action" ? "automatic" : "manual",
        status: input.status,
        startsAt: null,
        endsAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: missions.id,
        circleId: missions.circleId,
        type: missions.type,
        title: missions.title,
        status: missions.status,
        points: missions.points,
        rewardAsset: missions.rewardAsset,
        rewardAmount: missions.rewardAmount,
      });

    if (!created) {
      throw toDatabaseUnavailableError("create mission");
    }

    return {
      mission: {
        ...created,
        rewardAmount: created.rewardAmount ? String(created.rewardAmount) : null,
      },
    };
  } catch (error) {
    if (preserveExpectedError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("create mission");
  }
}

/**
 * Admin-only campaign lifecycle control. Only DRAFT <-> OPEN is supported.
 * Reward settlement is untouched: this only flips the persisted mission
 * status so participant visibility follows DB state immediately.
 */
export type MissionStatusTransition = "draft" | "open";

export type MissionStatusOutcome = {
  mission: {
    id: string;
    status: MissionStatusTransition;
    title: string;
  };
};

export async function updateMissionStatus(
  missionId: string,
  status: unknown,
  adminId?: string | null,
): Promise<MissionStatusOutcome> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
      throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
    }

    if (!adminId || !/^[0-9a-f-]{36}$/i.test(adminId)) {
      throw new MissionActionError("unauthenticated", "Sign in with an admin wallet to change campaign status.", 401);
    }

    if (status !== "draft" && status !== "open") {
      throw new MissionActionError("invalid-request", "Campaign status must be draft or open.", 400);
    }

    await assertMissionCreator(adminId);

    return applyMissionStatus(missionId, status);
  } catch (error) {
    if (preserveExpectedError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("update mission status");
  }
}

/**
 * Shared lifecycle core: the persisted Draft/Open transition is identical
 * whether authorized as a global admin or as an organization's owner/admin.
 * Only the authorization differs. Reward settlement and points are untouched.
 */
export async function applyMissionStatus(
  missionId: string,
  status: MissionStatusTransition,
): Promise<MissionStatusOutcome> {
  const database = getDatabase();
  const [existing] = await database
    .select({ id: missions.id, status: missions.status })
    .from(missions)
    .where(eq(missions.id, missionId))
    .limit(1);

  if (!existing) {
    throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
  }

  if (existing.status !== "draft" && existing.status !== "open") {
    throw new MissionActionError("invalid-transition", "This mission is not in a draft/open lifecycle state.", 409);
  }

  const now = new Date();
  const [updated] = await database
    .update(missions)
    .set({ status, updatedAt: now })
    .where(eq(missions.id, missionId))
    .returning({ id: missions.id, status: missions.status, title: missions.title });

  if (!updated) {
    throw toDatabaseUnavailableError("update mission status");
  }

  return {
    mission: {
      id: updated.id,
      status: updated.status as MissionStatusTransition,
      title: updated.title,
    },
  };
}
