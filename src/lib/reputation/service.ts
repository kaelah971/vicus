import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { campaignCompletions, campaigns, circles, theses, users } from "@/db/schema";
import { getUserContributions } from "@/lib/data/missions";
import { getUserCommunityContributions } from "@/lib/community/service";
import {
  dedupeVerifiedEvents,
  orderAuthoredItems,
  thesisDisplayStatus,
  type AuthoredItem,
  type VerifiedEvent,
} from "@/lib/reputation/rules";

/**
 * P7.1 — Contribution reputation read model. Assembles verified events
 * (approved submissions, paid completions) and authored items (theses,
 * active posts/answers) from existing record systems. No new tables, no
 * writes, no scores. Visibility "public" strips everything non-public:
 * pending items, review notes, wallets, rewards, balances, contacts.
 */

export type ReputationVisibility = "private" | "public";

export type ReputationSummary = {
  verified: VerifiedEvent[];
  authored: AuthoredItem[];
  counts: { verifiedMissions: number; verifiedCampaigns: number; theses: number; posts: number; answers: number };
  circles: string[];
  pending: number;
};

export async function getReputationSummary(
  userId: string,
  visibility: ReputationVisibility = "private",
): Promise<ReputationSummary> {
  const database = getDatabase();
  const { contributions } = await getUserContributions(userId);

  const missionEvents: VerifiedEvent[] = contributions
    .filter((c) => c.status === "approved")
    .map((c) => ({
      key: `submission:${c.id}`,
      kind: "mission-approved" as const,
      at: c.reviewedAt ?? c.submittedAt,
      proofKey: null,
      circleSlug: c.circleSlug,
      title: c.missionTitle,
    }));

  const completionRows = await database
    .select({ completion: campaignCompletions, campaign: campaigns, circle: circles })
    .from(campaignCompletions)
    .innerJoin(campaigns, eq(campaignCompletions.campaignId, campaigns.id))
    .leftJoin(circles, eq(campaigns.circleId, circles.id))
    .where(and(eq(campaignCompletions.userId, userId), eq(campaignCompletions.status, "paid")))
    .orderBy(desc(campaignCompletions.paidAt));
  const campaignEvents: VerifiedEvent[] = completionRows.map(({ completion, campaign, circle }) => ({
    key: `completion:${completion.id}`,
    kind: "campaign-paid" as const,
    at: completion.paidAt ?? completion.updatedAt,
    proofKey: `${completion.proofKind}:${completion.proofId}`,
    circleSlug: circle?.slug ?? null,
    title: campaign.objective,
  }));

  const verified = dedupeVerifiedEvents([...missionEvents, ...campaignEvents]);

  const thesisRows = await database
    .select({ thesis: theses, circle: circles })
    .from(theses)
    .leftJoin(circles, eq(theses.circleId, circles.id))
    .where(eq(theses.authorUserId, userId))
    .orderBy(desc(theses.createdAt))
    .limit(10);

  const [userRow] = await database.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
  const community = userRow ? await getUserCommunityContributions(userRow.handle) : [];

  const authored: AuthoredItem[] = orderAuthoredItems([
    ...thesisRows.map(({ thesis, circle }) => ({
      key: `thesis:${thesis.id}`,
      kind: "thesis" as const,
      at: thesis.createdAt,
      status: thesisDisplayStatus(thesis.status, thesis.closesAt),
      circleSlug: circle?.slug ?? thesis.linkedAssetSlug ?? null,
      title: thesis.title,
    })),
    ...community.map((item) => ({
      key: `${item.kind}:${item.id}`,
      kind: item.kind as "post" | "answer",
      at: new Date(item.createdAt),
      status: "active",
      circleSlug: item.circleSlug,
      title: item.title,
    })),
  ]);

  const circlesSet = new Set<string>();
  for (const event of verified) if (event.circleSlug) circlesSet.add(event.circleSlug);
  for (const item of authored) if (item.circleSlug) circlesSet.add(item.circleSlug);

  const pending =
    visibility === "private"
      ? contributions.filter((c) => c.status === "pending" || c.status === "needs_revision").length
      : 0;

  return {
    verified,
    authored,
    counts: {
      verifiedMissions: verified.filter((e) => e.kind === "mission-approved").length,
      verifiedCampaigns: verified.filter((e) => e.kind === "campaign-paid").length,
      theses: authored.filter((a) => a.kind === "thesis").length,
      posts: authored.filter((a) => a.kind === "post").length,
      answers: authored.filter((a) => a.kind === "answer").length,
    },
    circles: [...circlesSet].sort(),
    pending,
  };
}
