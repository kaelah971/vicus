import { and, count, eq, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  activityEvents,
  campaigns,
  circleMemberships,
  circles,
  missionSubmissions,
  missions,
} from "@/db/schema";
import type { AdminSummary } from "@/lib/data/types";

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
    };
  } catch {
    throw toDatabaseUnavailableError("get admin summary");
  }
}
