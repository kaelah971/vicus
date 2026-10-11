import { and, count, eq, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  activityEvents,
  assets,
  campaigns,
  circleMemberships,
  circles,
  missionSubmissions,
  missions,
} from "@/db/schema";
import type { AdminMissionRecord, AdminSummary } from "@/lib/data/types";
import { mapCircle } from "@/lib/data/circles";

export async function getAdminSummary(): Promise<AdminSummary> {
  try {
    const database = getDatabase();
    const [
      circleRows,
      campaignRows,
      missionRows,
      membershipRows,
      watcherRows,
      activityRows,
      pendingSubmissionRows,
      approvedSubmissionRows,
    ] = await Promise.all([
      database.select({ count: count() }).from(circles),
      database.select({ count: count() }).from(campaigns),
      database.select({ count: count() }).from(missions),
      database
        .select({ count: count() })
        .from(circleMemberships)
        .where(isNull(circleMemberships.leftAt)),
      database
        .select({ count: count() })
        .from(circleMemberships)
        .where(and(isNull(circleMemberships.leftAt), eq(circleMemberships.role, "watcher"))),
      database.select({ count: count() }).from(activityEvents),
      database
        .select({ count: count() })
        .from(missionSubmissions)
        .where(eq(missionSubmissions.status, "pending")),
      database
        .select({ count: count() })
        .from(missionSubmissions)
        .where(eq(missionSubmissions.status, "approved")),
    ]);

    return {
      circles: Number(circleRows[0]?.count ?? 0),
      campaigns: Number(campaignRows[0]?.count ?? 0),
      missions: Number(missionRows[0]?.count ?? 0),
      memberships: Number(membershipRows[0]?.count ?? 0),
      watchers: Number(watcherRows[0]?.count ?? 0),
      activityEvents: Number(activityRows[0]?.count ?? 0),
      pendingSubmissions: Number(pendingSubmissionRows[0]?.count ?? 0),
      approvedSubmissions: Number(approvedSubmissionRows[0]?.count ?? 0),
      activeMissions: 0,
      openRewardExposureXlm: "0",
    };
  } catch {
    throw toDatabaseUnavailableError("get admin summary");
  }
}

export async function getAdminOverview(): Promise<AdminSummary> {
  const summary = await getAdminSummary();

  try {
    const database = getDatabase();
    const openMissions = await database
      .select({ rewardAsset: missions.rewardAsset, rewardAmount: missions.rewardAmount })
      .from(missions)
      .where(eq(missions.status, "open"));

    let exposure = 0;
    for (const mission of openMissions) {
      if (mission.rewardAsset?.toUpperCase() === "XLM" && mission.rewardAmount) {
        const amount = Number(mission.rewardAmount);
        if (Number.isFinite(amount) && amount > 0) {
          exposure += amount;
        }
      }
    }

    return {
      ...summary,
      activeMissions: openMissions.length,
      openRewardExposureXlm: exposure.toFixed(7).replace(/0+$/, "").replace(/\.$/, ".0"),
    };
  } catch {
    throw toDatabaseUnavailableError("get admin overview");
  }
}

export async function getAdminMissions(): Promise<AdminMissionRecord[]> {
  try {
    const database = getDatabase();
    const missionRows = await database
      .select({ mission: missions, circle: circles, asset: assets })
      .from(missions)
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .orderBy(missions.createdAt);
    const submissionRows = await database
      .select({
        missionId: missionSubmissions.missionId,
        status: missionSubmissions.status,
        value: count(),
      })
      .from(missionSubmissions)
      .groupBy(missionSubmissions.missionId, missionSubmissions.status);

    const countsByMission = new Map<string, { pending: number; needsRevision: number; approved: number; rejected: number; total: number }>();
    for (const row of submissionRows) {
      const entry = countsByMission.get(row.missionId) ?? { pending: 0, needsRevision: 0, approved: 0, rejected: 0, total: 0 };
      const value = Number(row.value ?? 0);
      entry.total += value;
      if (row.status === "pending") entry.pending += value;
      else if (row.status === "needs_revision") entry.needsRevision += value;
      else if (row.status === "approved") entry.approved += value;
      else if (row.status === "rejected") entry.rejected += value;
      countsByMission.set(row.missionId, entry);
    }

    return missionRows.map(({ mission, circle, asset }) => ({
      id: mission.id,
      title: mission.title,
      type: mission.type,
      status: mission.status,
      points: mission.points,
      rewardAsset: mission.rewardAsset,
      rewardAmount: mission.rewardAmount ? String(mission.rewardAmount) : null,
      reviewMode: mission.reviewMode,
      createdAt: mission.createdAt.toISOString(),
      circle: mapCircle({ circle, asset }),
      submissions: countsByMission.get(mission.id) ?? { pending: 0, needsRevision: 0, approved: 0, rejected: 0, total: 0 },
    }));
  } catch {
    throw toDatabaseUnavailableError("get admin missions");
  }
}

export async function getAdminMissionDetail(missionId: string): Promise<AdminMissionRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
    return null;
  }

  const records = await getAdminMissions();
  return records.find((record) => record.id === missionId) ?? null;
}
