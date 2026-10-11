import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  assets,
  circleMemberships,
  circles,
  missionSubmissions,
  missions,
  stellarRoleVerifications,
  users,
} from "@/db/schema";
import { ecosystemLabel, mapCircle } from "@/lib/data/circles";
import { getSubmissionStatesForUser, mapMissionIndexRecord } from "@/lib/data/missions";
import type { CircleRecord, MissionRecord } from "@/lib/data/types";

export type HubMission = MissionRecord & { circle: { name: string; slug: string } };

export type HubRecentContribution = {
  missionTitle: string;
  circleName: string;
  circleSlug: string;
  participantHandle: string;
  submittedAt: string;
};

export type EcosystemHub = {
  value: string;
  label: string;
  circles: CircleRecord[];
  missions: HubMission[];
  totals: {
    circles: number;
    openMissions: number;
    watchers: number;
    contributions: number;
    verifications: number;
  };
  recentContributions: HubRecentContribution[];
};

/**
 * First-class ecosystem destination data. Only ecosystems backed by real
 * assets resolve; unknown values return null so the route can 404.
 * Missions are OPEN-only: drafts never appear on participant surfaces.
 */
export async function getEcosystemHub(
  ecosystemValue: string,
  userId?: string | null,
): Promise<EcosystemHub | null> {
  const normalized = ecosystemValue.trim().toLowerCase();

  if (!normalized || normalized.length > 32 || !/^[a-z0-9-]+$/.test(normalized)) {
    return null;
  }

  try {
    const database = getDatabase();
    const [ecosystemRow] = await database
      .selectDistinct({ ecosystem: assets.ecosystem })
      .from(assets)
      .innerJoin(circles, eq(circles.assetId, assets.id))
      .where(eq(assets.ecosystem, normalized))
      .limit(1);

    if (!ecosystemRow) {
      return null;
    }

    const label = ecosystemLabel(normalized);
    const [circleRows, watchedRows] = await Promise.all([
      database
        .select({ circle: circles, asset: assets })
        .from(circles)
        .innerJoin(assets, eq(circles.assetId, assets.id))
        .where(eq(assets.ecosystem, normalized))
        .orderBy(asc(circles.featuredRank), asc(circles.name)),
      userId
        ? database
            .select({ circleId: circleMemberships.circleId })
            .from(circleMemberships)
            .where(and(eq(circleMemberships.userId, userId), isNull(circleMemberships.leftAt)))
        : Promise.resolve([]),
    ]);

    const watchedCircleIds = new Set(watchedRows.map(({ circleId }) => circleId));
    const hubCircles = circleRows.map((row) => ({
      ...mapCircle(row),
      watched: watchedCircleIds.has(row.circle.id),
    }));
    const hubCircleIds = hubCircles.map((circle) => circle.id);

    const missionRows =
      hubCircleIds.length > 0
        ? await database
            .select({ mission: missions, circle: circles })
            .from(missions)
            .innerJoin(circles, eq(missions.circleId, circles.id))
            .where(and(inArray(missions.circleId, hubCircleIds), eq(missions.status, "open")))
            .orderBy(asc(missions.createdAt))
        : [];
    const submissionStates = await getSubmissionStatesForUser(
      missionRows.map(({ mission }) => mission.id),
      userId,
    );
    const hubMissions = missionRows.map(({ mission, circle }) =>
      mapMissionIndexRecord(mission, circle, submissionStates.get(mission.id) ?? null),
    );
    const hubMissionIds = hubMissions.map((mission) => mission.id);

    const [watcherRows, verificationRows, approvedRows, recentRows] = await Promise.all([
      hubCircleIds.length > 0
        ? database
            .select({ value: count() })
            .from(circleMemberships)
            .where(and(inArray(circleMemberships.circleId, hubCircleIds), isNull(circleMemberships.leftAt)))
        : Promise.resolve([{ value: 0 }]),
      hubCircleIds.length > 0
        ? database
            .select({ value: count() })
            .from(stellarRoleVerifications)
            .where(inArray(stellarRoleVerifications.circleId, hubCircleIds))
        : Promise.resolve([{ value: 0 }]),
      hubMissionIds.length > 0
        ? database
            .select({ value: count() })
            .from(missionSubmissions)
            .where(
              and(
                inArray(missionSubmissions.missionId, hubMissionIds),
                eq(missionSubmissions.status, "approved"),
              ),
            )
        : Promise.resolve([{ value: 0 }]),
      hubMissionIds.length > 0
        ? database
            .select({
              missionTitle: missions.title,
              circleName: circles.name,
              circleSlug: circles.slug,
              participantHandle: users.handle,
              submittedAt: missionSubmissions.submittedAt,
            })
            .from(missionSubmissions)
            .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
            .innerJoin(circles, eq(missions.circleId, circles.id))
            .innerJoin(users, eq(missionSubmissions.userId, users.id))
            .where(
              and(
                inArray(missionSubmissions.missionId, hubMissionIds),
                eq(missionSubmissions.status, "approved"),
              ),
            )
            .orderBy(desc(missionSubmissions.submittedAt))
            .limit(6)
        : Promise.resolve([]),
    ]);

    return {
      value: normalized,
      label,
      circles: hubCircles,
      missions: hubMissions,
      totals: {
        circles: hubCircles.length,
        openMissions: hubMissions.length,
        watchers: Number(watcherRows[0]?.value ?? 0),
        contributions: Number(approvedRows[0]?.value ?? 0),
        verifications: Number(verificationRows[0]?.value ?? 0),
      },
      recentContributions: recentRows.map((row) => ({
        missionTitle: row.missionTitle,
        circleName: row.circleName,
        circleSlug: row.circleSlug,
        participantHandle: row.participantHandle,
        submittedAt: row.submittedAt.toISOString(),
      })),
    };
  } catch {
    throw toDatabaseUnavailableError("get ecosystem hub");
  }
}
