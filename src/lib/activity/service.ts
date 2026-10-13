import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  assets,
  campaignCompletions,
  campaigns,
  circleAnswers,
  circlePosts,
  circles,
  missionSubmissions,
  missions,
  theses,
  userFollows,
  users,
} from "@/db/schema";
import { listWatchedCircleIds } from "@/lib/data/watch";
import { getStellarPositions } from "@/lib/positions/service";
import { listEligibleProofs } from "@/lib/campaigns/service";

/**
 * Personalized Activity V1 — "what changed around the assets I care
 * about?" Read-only relevance over native Vicus truth: watched circles,
 * Stellar holdings (private), followed people, participated circles, and
 * own authorship. No event table, no scores, no engagement ranking.
 * Transaction execution state stays in Watch Center — never duplicated here.
 */

export type ActivityReason =
  | { kind: "watch"; circleSlug: string; circleName: string }
  | { kind: "hold"; circleSlug: string; circleName: string }
  | { kind: "follow"; handle: string }
  | { kind: "participated"; circleSlug: string; circleName: string }
  | { kind: "own" };

export type ActivityItem = {
  id: string;
  group: "thesis" | "community" | "campaign" | "personal";
  title: string;
  detail: string;
  href: string;
  actorHandle: string | null;
  circleSlug: string | null;
  circleName: string | null;
  createdAt: string;
  /** Always present: why this user sees this item. */
  reason: string;
};

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

export type PersonalActivity = {
  attention: AttentionItem[];
  changed: ActivityItem[];
  counts: { attention: number; changed: number };
};

export class ActivityError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "unavailable",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new ActivityError("unauthenticated", "Sign in to see your activity.", 401);
  }
  return userId;
}

function reasonLabel(reason: ActivityReason): string {
  switch (reason.kind) {
    case "watch":
      return `Because you watch ${reason.circleName}`;
    case "hold":
      return `Because you hold ${reason.circleName}`;
    case "follow":
      return `Because you follow @${reason.handle}`;
    case "participated":
      return `Because you contributed to ${reason.circleName}`;
    case "own":
      return "Your own activity";
  }
}

type CircleInfo = { id: string; slug: string; name: string; ecosystem: string };

export async function getPersonalActivity(
  userId: string | null | undefined,
  sessionStellarWallet?: string | null,
): Promise<PersonalActivity> {
  const owner = requireUserId(userId);
  const database = getDatabase();

  const [
    watchedIds,
    followedRows,
    missionCircles,
    campaignCircles,
    authoredPosts,
    authoredTheses,
  ] = await Promise.all([
    listWatchedCircleIds(owner).catch(() => [] as string[]),
    database
      .select({ id: users.id, handle: users.handle })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followedUserId, users.id))
      .where(eq(userFollows.followerUserId, owner))
      .limit(100)
      .catch(() => [] as { id: string; handle: string }[]),
    database
      .select({ circleId: missions.circleId })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .where(and(eq(missionSubmissions.userId, owner), eq(missionSubmissions.status, "approved")))
      .limit(100)
      .catch(() => [] as { circleId: string }[]),
    database
      .select({ circleId: campaigns.circleId })
      .from(campaignCompletions)
      .innerJoin(campaigns, eq(campaignCompletions.campaignId, campaigns.id))
      .where(and(eq(campaignCompletions.userId, owner), eq(campaignCompletions.status, "paid")))
      .limit(100)
      .catch(() => [] as { circleId: string }[]),
    database
      .select({ circleId: circlePosts.circleId })
      .from(circlePosts)
      .where(and(eq(circlePosts.authorUserId, owner), eq(circlePosts.status, "active")))
      .limit(100)
      .catch(() => [] as { circleId: string }[]),
    database
      .select({ id: theses.id, status: theses.status, closesAt: theses.closesAt, title: theses.title, circleId: theses.circleId })
      .from(theses)
      .where(eq(theses.authorUserId, owner))
      .orderBy(desc(theses.createdAt))
      .limit(50)
      .catch(() => [] as { id: string; status: string; closesAt: Date | null; title: string; circleId: string | null }[]),
  ]);

  // Private Stellar holdings personalize silently — never surfaced.
  let heldSlugs = new Set<string>();
  if (sessionStellarWallet && /^G[A-Z2-7]{55}$/.test(sessionStellarWallet)) {
    try {
      const { positions } = await getStellarPositions(sessionStellarWallet);
      heldSlugs = new Set(positions.map((position) => position.assetSlug));
    } catch {
      heldSlugs = new Set();
    }
  }

  const relevantIds = new Set<string>([
    ...watchedIds,
    ...missionCircles.map((row) => row.circleId),
    ...campaignCircles.map((row) => row.circleId),
    ...authoredPosts.map((row) => row.circleId),
  ]);
  if (relevantIds.size === 0) {
    return { attention: [], changed: [], counts: { attention: 0, changed: 0 } };
  }
  const ids = [...relevantIds];
  const circleRows = await database
    .select({ id: circles.id, slug: circles.slug, name: circles.name, ecosystem: assets.ecosystem })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(inArray(circles.id, ids))
    .limit(100)
    .catch(() => [] as { id: string; slug: string; name: string; ecosystem: string | null }[]);
  const byId = new Map<string, CircleInfo>();
  for (const row of circleRows) {
    byId.set(row.id, { id: row.id, slug: row.slug, name: row.name, ecosystem: row.ecosystem ?? "stellar" });
  }
  const watchedSet = new Set(watchedIds);
  const participatedSet = new Set([...missionCircles, ...campaignCircles, ...authoredPosts].map((row) => row.circleId));
  const followedIds = new Set(followedRows.map((row) => row.id));
  const followedHandles = new Map(followedRows.map((row) => [row.id, row.handle]));

  const items: (ActivityItem & { relevance: number; stellarFirst: number })[] = [];
  const push = (item: Omit<ActivityItem, "reason"> & { reason: ActivityReason; relevance: number; stellarFirst?: number }) => {
    items.push({ ...item, reason: reasonLabel(item.reason), stellarFirst: item.stellarFirst ?? 0 });
  };

  // Community: recent posts + answers in relevant circles (bounded).
  const [recentPosts, recentAnswers] = await Promise.all([
    database
      .select({
        id: circlePosts.id,
        circleId: circlePosts.circleId,
        type: circlePosts.type,
        title: circlePosts.title,
        authorUserId: circlePosts.authorUserId,
        handle: users.handle,
        createdAt: circlePosts.createdAt,
      })
      .from(circlePosts)
      .innerJoin(users, eq(circlePosts.authorUserId, users.id))
      .where(and(inArray(circlePosts.circleId, ids), eq(circlePosts.status, "active")))
      .orderBy(desc(circlePosts.createdAt))
      .limit(30)
      .catch(() => []),
    database
      .select({
        id: circleAnswers.id,
        postId: circleAnswers.postId,
        authorUserId: circleAnswers.authorUserId,
        handle: users.handle,
        createdAt: circleAnswers.createdAt,
      })
      .from(circleAnswers)
      .innerJoin(circlePosts, eq(circleAnswers.postId, circlePosts.id))
      .innerJoin(users, eq(circleAnswers.authorUserId, users.id))
      .where(and(inArray(circlePosts.circleId, ids), eq(circleAnswers.status, "active"), eq(circlePosts.status, "active")))
      .orderBy(desc(circleAnswers.createdAt))
      .limit(30)
      .catch(() => []),
  ]);
  const postTitles = new Map(recentPosts.map((post) => [post.id, post.title]));
  const postCircles = new Map(recentPosts.map((post) => [post.id, post.circleId]));
  for (const post of recentPosts) {
    const info = byId.get(post.circleId);
    if (!info) continue;
    const reasons: ActivityReason[] = [];
    if (watchedSet.has(post.circleId)) reasons.push({ kind: "watch", circleSlug: info.slug, circleName: info.name });
    else if (participatedSet.has(post.circleId)) reasons.push({ kind: "participated", circleSlug: info.slug, circleName: info.name });
    else reasons.push({ kind: "watch", circleSlug: info.slug, circleName: info.name });
    if (followedIds.has(post.authorUserId)) {
      push({
        id: `post-follow:${post.id}`,
        group: "community",
        title: `New ${post.type} in ${info.name}`,
        detail: post.title.slice(0, 120),
        href: `/circles/${info.slug}/community`,
        actorHandle: post.handle,
        circleSlug: info.slug,
        circleName: info.name,
        createdAt: post.createdAt.toISOString(),
        reason: { kind: "follow", handle: followedHandles.get(post.authorUserId) ?? post.handle },
        relevance: 4,
        stellarFirst: info.ecosystem === "stellar" ? 0 : 1,
      });
      continue;
    }
    push({
      id: `post:${post.id}`,
      group: "community",
      title: `New ${post.type} in ${info.name}`,
      detail: post.title.slice(0, 120),
      href: `/circles/${info.slug}/community`,
      actorHandle: post.handle,
      circleSlug: info.slug,
      circleName: info.name,
      createdAt: post.createdAt.toISOString(),
      reason: reasons[0]!,
      relevance: heldSlugs.has(info.slug) ? 3 : 2,
      stellarFirst: info.ecosystem === "stellar" ? 0 : 1,
    });
  }
  for (const answer of recentAnswers) {
    const circleId = postCircles.get(answer.postId);
    const info = circleId ? byId.get(circleId) : undefined;
    if (!info || !followedIds.has(answer.authorUserId)) continue;
    push({
      id: `answer-follow:${answer.id}`,
      group: "community",
      title: `Answer in ${info.name}`,
      detail: (postTitles.get(answer.postId) ?? "A question").slice(0, 120),
      href: `/circles/${info.slug}/community`,
      actorHandle: answer.handle,
      circleSlug: info.slug,
      circleName: info.name,
      createdAt: answer.createdAt.toISOString(),
      reason: { kind: "follow", handle: followedHandles.get(answer.authorUserId) ?? answer.handle },
      relevance: 4,
      stellarFirst: info.ecosystem === "stellar" ? 0 : 1,
    });
  }

  // Conviction: theses in relevant circles + followed authors anywhere.
  const [circleTheses, followedTheses] = await Promise.all([
    database
      .select({
        id: theses.id,
        circleId: theses.circleId,
        title: theses.title,
        confidence: theses.confidence,
        status: theses.status,
        authorUserId: theses.authorUserId,
        handle: users.handle,
        createdAt: theses.createdAt,
      })
      .from(theses)
      .innerJoin(users, eq(theses.authorUserId, users.id))
      .where(inArray(theses.circleId, ids))
      .orderBy(desc(theses.createdAt))
      .limit(30)
      .catch(() => []),
    followedIds.size > 0
      ? database
          .select({
            id: theses.id,
            circleId: theses.circleId,
            title: theses.title,
            confidence: theses.confidence,
            status: theses.status,
            authorUserId: theses.authorUserId,
            handle: users.handle,
            createdAt: theses.createdAt,
          })
          .from(theses)
          .innerJoin(users, eq(theses.authorUserId, users.id))
          .where(inArray(theses.authorUserId, [...followedIds]))
          .orderBy(desc(theses.createdAt))
          .limit(30)
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const seenTheses = new Set<string>();
  for (const thesis of [...circleTheses, ...followedTheses]) {
    if (seenTheses.has(thesis.id)) continue;
    seenTheses.add(thesis.id);
    const info = thesis.circleId ? byId.get(thesis.circleId) : undefined;
    const fromFollow = followedIds.has(thesis.authorUserId);
    push({
      id: `thesis:${thesis.id}`,
      group: "thesis",
      title: thesis.status === "resolved" ? "Thesis resolved" : "New thesis",
      detail: `${thesis.title.slice(0, 120)} · ${thesis.confidence}%`,
      href: info ? `/circles/${info.slug}/conviction/${thesis.id}` : "/discover",
      actorHandle: thesis.handle,
      circleSlug: info?.slug ?? null,
      circleName: info?.name ?? null,
      createdAt: thesis.createdAt.toISOString(),
      reason: fromFollow
        ? { kind: "follow", handle: followedHandles.get(thesis.authorUserId) ?? thesis.handle }
        : info
          ? watchedSet.has(info.id)
            ? { kind: "watch", circleSlug: info.slug, circleName: info.name }
            : { kind: "participated", circleSlug: info.slug, circleName: info.name }
          : { kind: "own" },
      relevance: fromFollow ? 4 : 3,
      stellarFirst: info && info.ecosystem !== "stellar" ? 1 : 0,
    });
  }

  // Campaigns: activated/ending in relevant circles + claimable rewards.
  const relevantCampaigns = await database
    .select({
      id: campaigns.id,
      circleId: campaigns.circleId,
      objective: campaigns.objective,
      status: campaigns.status,
      endsAt: campaigns.endsAt,
      rewardPerCompletion: campaigns.rewardPerCompletion,
      rewardAsset: campaigns.rewardAsset,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(inArray(campaigns.circleId, ids))
    .orderBy(desc(campaigns.createdAt))
    .limit(30)
    .catch(() => []);
  const attention: AttentionItem[] = [];
  for (const campaign of relevantCampaigns) {
    const info = byId.get(campaign.circleId);
    if (!info) continue;
    if (campaign.status === "active") {
      push({
        id: `campaign:${campaign.id}`,
        group: "campaign",
        title: `Active campaign in ${info.name}`,
        detail: campaign.objective.slice(0, 120),
        href: `/campaigns/${campaign.id}`,
        actorHandle: null,
        circleSlug: info.slug,
        circleName: info.name,
        createdAt: campaign.createdAt.toISOString(),
        reason: watchedSet.has(info.id)
          ? { kind: "watch", circleSlug: info.slug, circleName: info.name }
          : { kind: "participated", circleSlug: info.slug, circleName: info.name },
        relevance: 3,
        stellarFirst: info.ecosystem === "stellar" ? 0 : 1,
      });
      if (campaign.endsAt && campaign.endsAt.getTime() - Date.now() < 7 * 86400000 && campaign.endsAt.getTime() > Date.now()) {
        attention.push({
          id: `campaign-ending:${campaign.id}`,
          title: `Campaign in ${info.name} ends soon`,
          detail: `Ends ${campaign.endsAt.toISOString().slice(0, 10)} — complete the verified action in time.`,
          href: `/campaigns/${campaign.id}`,
        });
      }
      try {
        const eligible = await listEligibleProofs(campaign.id, owner);
        if (eligible.length > 0) {
          attention.push({
            id: `campaign-claim:${campaign.id}`,
            title: `Reward available in ${info.name}`,
            detail: `${eligible.length} verified action${eligible.length === 1 ? "" : "s"} ready to claim.`,
            href: `/campaigns/${campaign.id}`,
          });
        }
      } catch {
        /* claimability stays unknown rather than faked */
      }
    } else if (campaign.status === "completed" || campaign.status === "exhausted") {
      push({
        id: `campaign:${campaign.id}`,
        group: "campaign",
        title: `Campaign ${campaign.status} in ${info.name}`,
        detail: campaign.objective.slice(0, 120),
        href: `/campaigns/${campaign.id}`,
        actorHandle: null,
        circleSlug: info.slug,
        circleName: info.name,
        createdAt: campaign.createdAt.toISOString(),
        reason: watchedSet.has(info.id)
          ? { kind: "watch", circleSlug: info.slug, circleName: info.name }
          : { kind: "participated", circleSlug: info.slug, circleName: info.name },
        relevance: 1,
        stellarFirst: info.ecosystem === "stellar" ? 0 : 1,
      });
    }
  }

  // Personal: own expired theses need review.
  for (const thesis of authoredTheses) {
    if (thesis.status === "open" && thesis.closesAt && thesis.closesAt.getTime() <= Date.now()) {
      attention.push({
        id: `thesis-expired:${thesis.id}`,
        title: "Your thesis expired",
        detail: `${thesis.title.slice(0, 100)} — resolve it with an outcome note or withdraw it.`,
        href: thesis.circleId && byId.get(thesis.circleId) ? `/circles/${byId.get(thesis.circleId)!.slug}/conviction/${thesis.id}` : "/discover",
      });
    }
  }

  // Deterministic ranking: relevance, recency, Stellar parity, id.
  const ranked = [...items].sort((a, b) =>
    b.relevance - a.relevance ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.stellarFirst - b.stellarFirst ||
    a.id.localeCompare(b.id),
  );
  const changed: ActivityItem[] = ranked.slice(0, 40).map((item) => ({
    id: item.id,
    group: item.group,
    title: item.title,
    detail: item.detail,
    href: item.href,
    actorHandle: item.actorHandle,
    circleSlug: item.circleSlug,
    circleName: item.circleName,
    createdAt: item.createdAt,
    reason: item.reason,
  }));

  return {
    attention: attention.slice(0, 10),
    changed,
    counts: { attention: Math.min(attention.length, 10), changed: changed.length },
  };
}
