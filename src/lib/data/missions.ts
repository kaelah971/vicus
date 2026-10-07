import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { assets, circles, missionSubmissions, missions, users } from "@/db/schema";
import {
  getMissionAvailability,
  parseMissionConfig,
  publicMissionConfig,
} from "@/lib/missions/config";
import { MissionActionError } from "@/lib/missions/errors";
import type {
  MissionDetailRecord,
  SubmissionState,
  SubmissionStatus,
} from "@/lib/missions/types";
import { submissionStatuses } from "@/lib/missions/types";
import type { MissionRecord, ProfileContribution, SubmissionReviewRecord } from "@/lib/data/types";

type MissionRow = typeof missions.$inferSelect;
type SubmissionRow = typeof missionSubmissions.$inferSelect;

export type MissionParticipant = {
  id: string;
  handle: string;
  displayName: string;
};

export type MissionSubmissionContext = {
  mission: MissionRow;
  participant: MissionParticipant | null;
  submission: SubmissionRow | null;
};

function isSubmissionStatus(value: string): value is SubmissionStatus {
  return submissionStatuses.includes(value as SubmissionStatus);
}

export function mapSubmissionState(submission: SubmissionRow | null): SubmissionState | null {
  if (!submission || !isSubmissionStatus(submission.status)) {
    return null;
  }

  return {
    id: submission.id,
    status: submission.status,
    score: submission.score,
    evidenceUrl: submission.evidenceUrl,
    revisionReason: submission.revisionReason,
    submittedAt: submission.submittedAt.toISOString(),
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
  };
}

async function findParticipant(
  database: ReturnType<typeof getDatabase>,
  userId: string,
): Promise<MissionParticipant | null> {
  const [participant] = await database
    .select({ id: users.id, handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return participant ?? null;
}

export async function getMissionSubmissionContext(
  missionId: string,
  userId?: string | null,
): Promise<MissionSubmissionContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
    return null;
  }

  try {
    const database = getDatabase();
    const [mission] = await database
      .select()
      .from(missions)
      .where(eq(missions.id, missionId))
      .limit(1);

    if (!mission) {
      return null;
    }

    const participant = userId ? await findParticipant(database, userId) : null;
    let submission: SubmissionRow | null = null;

    if (participant) {
      const [participantSubmission] = await database
        .select()
        .from(missionSubmissions)
        .where(
          and(
            eq(missionSubmissions.missionId, mission.id),
            eq(missionSubmissions.userId, participant.id),
          ),
        )
        .limit(1);
      submission = participantSubmission ?? null;
    }

    return { mission, participant, submission };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("get mission submission context");
  }
}

export async function getMissionById(
  missionId: string,
  userId?: string | null,
): Promise<MissionDetailRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
    return null;
  }

  try {
    const database = getDatabase();
    const [row] = await database
      .select({ mission: missions, circle: circles, asset: assets })
      .from(missions)
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .where(eq(missions.id, missionId))
      .limit(1);

    if (!row) {
      return null;
    }

    const participant = userId ? await findParticipant(database, userId) : null;
    let submission: SubmissionRow | null = null;

    if (participant) {
      const [participantSubmission] = await database
        .select()
        .from(missionSubmissions)
        .where(
          and(
            eq(missionSubmissions.missionId, row.mission.id),
            eq(missionSubmissions.userId, participant.id),
          ),
        )
        .limit(1);
      submission = participantSubmission ?? null;
    }
    const config = parseMissionConfig(row.mission.missionConfig);

    return {
      id: row.mission.id,
      circle: { name: row.circle.name, slug: row.circle.slug },
      type: row.mission.type,
      title: row.mission.title,
      description: row.mission.description,
      points: row.mission.points,
      rewardNote:
        row.mission.rewardAsset && row.mission.rewardAmount
          ? `${row.mission.rewardAmount} ${row.mission.rewardAsset}`
          : "No reward configured. Mission points are offchain; no blockchain reward is created.",
      eligibilityNote:
        row.asset?.eligibilityNote ??
        "This education-only mission has no asset eligibility requirement.",
      reviewMode: row.mission.reviewMode,
      duplicatePolicy: row.mission.duplicatePolicy,
      status: row.mission.status,
      startsAt: row.mission.startsAt?.toISOString() ?? null,
      endsAt: row.mission.endsAt?.toISOString() ?? null,
      availability: getMissionAvailability(
        row.mission.status,
        row.mission.startsAt,
        row.mission.endsAt,
      ),
      config: publicMissionConfig(config),
      viewer: {
        authenticated: Boolean(participant),
        handle: participant?.handle ?? null,
      },
      submission: mapSubmissionState(submission),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      throw error;
    }

    throw toDatabaseUnavailableError("get mission");
  }
}

function mapMissionIndexRecord(
  mission: MissionRow,
  circle: { name: string; slug: string },
  submission: SubmissionState | null,
): MissionRecord & { circle: { name: string; slug: string } } {
  const review =
    mission.reviewMode === "manual"
      ? "Manual review"
      : mission.reviewMode === "automatic"
        ? "Automatic grading"
        : mission.reviewMode === "not-connected"
          ? "Preview only"
          : mission.reviewMode;
  const reward = mission.rewardAsset && mission.rewardAmount
    ? `${mission.rewardAmount} ${mission.rewardAsset}`
    : "No reward configured";

  return {
    id: mission.id,
    title: mission.title,
    description: mission.description,
    type: mission.type,
    review,
    reward,
    points: mission.points,
    status: mission.status,
    submissionStatus: submission?.status ?? null,
    submissionScore: submission?.score ?? null,
    circle,
  };
}

export async function listMissions(
  userId?: string | null,
): Promise<Array<MissionRecord & { circle: { name: string; slug: string } }>> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({ mission: missions, circle: circles })
      .from(missions)
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .orderBy(asc(missions.status), asc(missions.createdAt));
    const submissionStates = await getSubmissionStatesForUser(
      rows.map(({ mission }) => mission.id),
      userId,
    );

    return rows.map(({ mission, circle }) =>
      mapMissionIndexRecord(mission, circle, submissionStates.get(mission.id) ?? null),
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("list missions");
  }
}

export async function getSubmissionStatesForUser(
  missionIds: string[],
  userId?: string | null,
): Promise<Map<string, SubmissionState>> {
  if (missionIds.length === 0 || !userId) {
    return new Map();
  }

  try {
    const database = getDatabase();
    const rows = await database
      .select()
      .from(missionSubmissions)
      .where(
        and(
          eq(missionSubmissions.userId, userId),
          inArray(missionSubmissions.missionId, missionIds),
        ),
      );
    const states = new Map<string, SubmissionState>();

    for (const row of rows) {
      const state = mapSubmissionState(row);
      if (state) {
        states.set(row.missionId, state);
      }
    }

    return states;
  } catch {
    throw toDatabaseUnavailableError("get mission submission states");
  }
}

export async function getUserContributions(
  userId: string,
): Promise<{ contributions: ProfileContribution[]; approvedPoints: number }> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({ submission: missionSubmissions, mission: missions, circle: circles })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .where(eq(missionSubmissions.userId, userId))
      .orderBy(desc(missionSubmissions.submittedAt));

    const contributions = rows.flatMap(({ submission, mission, circle }) => {
      if (!isSubmissionStatus(submission.status)) {
        return [];
      }

      return [
        {
          id: submission.id,
          missionId: mission.id,
          missionTitle: mission.title,
          missionType: mission.type,
          circleName: circle.name,
          circleSlug: circle.slug,
          status: submission.status,
          score: submission.score,
          points: submission.status === "approved" ? mission.points : 0,
          submittedAt: submission.submittedAt,
          reviewedAt: submission.reviewedAt,
          revisionReason: submission.revisionReason,
        },
      ];
    });
    const approvedPoints = contributions.reduce((total, contribution) => total + contribution.points, 0);

    return { contributions, approvedPoints };
  } catch {
    throw toDatabaseUnavailableError("get user contributions");
  }
}

export async function getAdminSubmissionQueue(): Promise<SubmissionReviewRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({ submission: missionSubmissions, mission: missions, circle: circles, participant: users })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .innerJoin(users, eq(missionSubmissions.userId, users.id))
      .where(eq(missionSubmissions.status, "pending"))
      .orderBy(asc(missionSubmissions.submittedAt));

    return rows.flatMap(({ submission, mission, circle, participant }) => {
      if (!isSubmissionStatus(submission.status)) {
        return [];
      }

      return [
        {
          id: submission.id,
          missionId: mission.id,
          missionTitle: mission.title,
          missionType: mission.type,
          missionPoints: mission.points,
          circleName: circle.name,
          circleSlug: circle.slug,
          participantHandle: participant.handle,
          participantName: participant.displayName,
          content: submission.content,
          evidenceUrl: submission.evidenceUrl,
          score: submission.score,
          status: submission.status,
          revisionReason: submission.revisionReason,
          submittedAt: submission.submittedAt.toISOString(),
        },
      ];
    });
  } catch {
    throw toDatabaseUnavailableError("get submission review queue");
  }
}

export function assertOpenMission(mission: MissionRow) {
  const availability = getMissionAvailability(mission.status, mission.startsAt, mission.endsAt);
  if (availability !== "open") {
    throw new MissionActionError(
      "mission-closed",
      availability === "scheduled"
        ? "This mission is not open yet."
        : "This mission is closed for new submissions.",
      409,
    );
  }
}
