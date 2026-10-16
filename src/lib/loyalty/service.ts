import "server-only";
import { getUserContributions } from "@/lib/data/missions";
import { computeLoyalty, orderLoyaltyEvents, type LoyaltyEvent, type LoyaltyProgress } from "@/lib/loyalty/rules";

/**
 * P6.3 — Loyalty read model. Derived live from approved mission
 * submissions (via the existing contributions read path): no new tables,
 * no writes, no competing balances. Reuses approved mission points, so
 * P6.1/P6.2 guarantees flow through untouched.
 */

export type LoyaltyActivityItem = {
  id: string;
  missionId: string;
  missionTitle: string;
  circleName: string;
  points: number;
  at: Date;
};

export type LoyaltySummary = {
  progress: LoyaltyProgress;
  /** Most recent approved actions first (deterministic). */
  recent: LoyaltyActivityItem[];
  counts: { approved: number; pending: number; needsWork: number };
};

export async function getLoyaltySummary(userId: string, now: Date = new Date()): Promise<LoyaltySummary> {
  const { contributions } = await getUserContributions(userId);
  const approved = contributions.filter((c) => c.status === "approved");
  const events: LoyaltyEvent[] = approved.map((c) => ({
    id: c.id,
    points: c.points,
    at: c.reviewedAt ?? c.submittedAt,
  }));
  const progress = computeLoyalty(events, now);
  const recent: LoyaltyActivityItem[] = orderLoyaltyEvents(events)
    .slice(0, 5)
    .map((event) => {
      const source = approved.find((c) => c.id === event.id)!;
      return {
        id: event.id,
        missionId: source.missionId,
        missionTitle: source.missionTitle,
        circleName: source.circleName,
        points: event.points,
        at: event.at,
      };
    });
  return {
    progress,
    recent,
    counts: {
      approved: contributions.filter((c) => c.status === "approved").length,
      pending: contributions.filter((c) => c.status === "pending").length,
      needsWork: contributions.filter((c) => c.status === "needs_revision" || c.status === "rejected").length,
    },
  };
}
