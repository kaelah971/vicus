import { and, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { missionSubmissions, missions, users } from "@/db/schema";
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
        reviewedBy: reviewer.id,
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
  } catch (error) {
    if (preserveExpectedError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("review mission submission");
  }
}
