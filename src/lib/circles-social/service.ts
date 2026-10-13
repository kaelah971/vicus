import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  campaignCompletions,
  campaigns,
  circleAnswers,
  circlePostHelpful,
  circlePosts,
  circles,
  missionSubmissions,
  missions,
  userFollows,
  users,
} from "@/db/schema";
import { getCirclePeople, type PersonCard } from "@/lib/social/service";

/**
 * Asset-circle social read model. Groups real people signals per asset:
 * who follows, who contributes knowledge, who is verified — with watching,
 * holding, participating, and contributing kept strictly distinct.
 *
 * Privacy: handles, display names, and public contribution counts only.
 * Never balances, wallet addresses, amounts, or private contact state.
 * Holding is private by default and NEVER appears here.
 */

export type SocialPerson = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  relationships: string[];
};

export type ContributorSignal = {
  handle: string;
  displayName: string;
  questions: number;
  insights: number;
  sources: number;
  answers: number;
  helpfulReceived: number;
  approvedMissions: number;
};

export type VerifiedParticipant = {
  handle: string;
  displayName: string;
  /** Proof basis — never an amount or transaction. */
  basis: "mission" | "campaign" | "role";
};

export class CircleSocialError extends Error {
  constructor(
    public readonly code: "not-found" | "unavailable",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type CircleSocialSummary = {  slug: string;
  groups: {
    following: SocialPerson[];
    contributors: SocialPerson[];
    verified: SocialPerson[];
    watching: SocialPerson[];
  };
  contributorSignals: ContributorSignal[];
  verifiedParticipants: VerifiedParticipant[];
};

function toSocial(person: PersonCard): SocialPerson {
  return {
    handle: person.user.handle,
    displayName: person.user.displayName,
    avatarUrl: person.user.avatarUrl,
    relationships: [...person.relationships],
  };
}

export async function getCircleSocialSummary(
  circleSlug: string,
  viewerUserId?: string | null,
): Promise<CircleSocialSummary> {
  const slug = circleSlug.trim();
  const database = getDatabase();
  const [circle] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, slug)).limit(1);
  if (!circle) {
    throw new CircleSocialError("not-found", "That asset circle could not be found.", 404);
  }

  const [people, posts, helpfulVotes, missionRows, followedIds] = await Promise.all([
    getCirclePeople(circle.id),
    database
      .select({
        id: circlePosts.id,
        type: circlePosts.type,
        authorUserId: circlePosts.authorUserId,
        handle: users.handle,
        displayName: users.displayName,
      })
      .from(circlePosts)
      .innerJoin(users, eq(circlePosts.authorUserId, users.id))
      .where(and(eq(circlePosts.circleId, circle.id), eq(circlePosts.status, "active")))
      .orderBy(desc(circlePosts.createdAt))
      .limit(200),
    database
      .select({ authorUserId: circlePosts.authorUserId })
      .from(circlePostHelpful)
      .innerJoin(circlePosts, eq(circlePostHelpful.postId, circlePosts.id))
      .where(and(eq(circlePosts.circleId, circle.id), eq(circlePosts.status, "active")))
      .limit(500),
    database
      .select({ userId: missionSubmissions.userId })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .where(and(eq(missions.circleId, circle.id), eq(missionSubmissions.status, "approved")))
      .limit(200),
    viewerUserId && /^[0-9a-f-]{36}$/i.test(viewerUserId)
      ? database
          .select({ followedId: userFollows.followedUserId })
          .from(userFollows)
          .where(eq(userFollows.followerUserId, viewerUserId))
          .limit(200)
      : Promise.resolve([] as { followedId: string }[]),
  ]);

  const followed = new Set(followedIds.map((row) => row.followedId));
  const byHandle = new Map<string, SocialPerson>();
  for (const person of people) {
    const social = toSocial(person);
    if (!byHandle.has(social.handle)) byHandle.set(social.handle, social);
  }

  const isContributor = (p: SocialPerson) => p.relationships.includes("Contributor");
  const isVerified = (p: SocialPerson) =>
    p.relationships.some((rel) => rel === "Verified Holder" || rel === "Verified Trustline");
  const all = [...byHandle.values()];
  const groups = {
    following: all.filter((p) => people.some((person) => person.user.handle === p.handle && followed.has(person.user.id))),
    contributors: all.filter(isContributor),
    verified: all.filter(isVerified),
    watching: all.filter((p) => p.relationships.includes("Watcher")),
  };

  // Contribution signals from real community rows (active only).
  const answers = await database
    .select({ authorUserId: circleAnswers.authorUserId, handle: users.handle, displayName: users.displayName })
    .from(circleAnswers)
    .innerJoin(circlePosts, eq(circleAnswers.postId, circlePosts.id))
    .innerJoin(users, eq(circleAnswers.authorUserId, users.id))
    .where(and(eq(circlePosts.circleId, circle.id), eq(circleAnswers.status, "active"), eq(circlePosts.status, "active")))
    .limit(500);
  const helpfulByAuthor = new Map<string, number>();
  for (const vote of helpfulVotes) {
    helpfulByAuthor.set(vote.authorUserId, (helpfulByAuthor.get(vote.authorUserId) ?? 0) + 1);
  }
  const missionCountByUser = new Map<string, number>();
  for (const row of missionRows) {
    missionCountByUser.set(row.userId, (missionCountByUser.get(row.userId) ?? 0) + 1);
  }
  type Acc = { handle: string; displayName: string; questions: number; insights: number; sources: number; answers: number; helpfulReceived: number; approvedMissions: number };
  const acc = new Map<string, Acc>();
  const ensure = (userId: string, handle: string, displayName: string): Acc => {
    let entry = acc.get(userId);
    if (!entry) {
      entry = { handle, displayName, questions: 0, insights: 0, sources: 0, answers: 0, helpfulReceived: 0, approvedMissions: 0 };
      acc.set(userId, entry);
    }
    return entry;
  };
  for (const post of posts) {
    const entry = ensure(post.authorUserId, post.handle, post.displayName);
    if (post.type === "question") entry.questions += 1;
    else if (post.type === "insight") entry.insights += 1;
    else if (post.type === "source") entry.sources += 1;
  }
  for (const answer of answers) {
    ensure(answer.authorUserId, answer.handle, answer.displayName).answers += 1;
  }
  for (const [userId, count] of helpfulByAuthor) {
    const entry = acc.get(userId);
    if (entry) entry.helpfulReceived = count;
  }
  for (const [userId, count] of missionCountByUser) {
    const known = acc.get(userId);
    if (known) known.approvedMissions = count;
  }
  const contributorSignals: ContributorSignal[] = [...acc.values()]
    .map(({ handle, displayName, questions, insights, sources, answers: answerCount, helpfulReceived, approvedMissions }) => ({
      handle, displayName, questions, insights, sources, answers: answerCount, helpfulReceived, approvedMissions,
    }))
    .sort((a, b) => b.answers + b.helpfulReceived - (a.answers + a.helpfulReceived))
    .slice(0, 12);

  // Verified participation: approved missions, paid campaign completions,
  // role checks — handles only, never amounts or wallets.
  const verifiedByUser = new Map<string, { handle: string; displayName: string; basis: VerifiedParticipant["basis"] }>();
  const [missionUsers, campaignUsers] = await Promise.all([
    database
      .select({ userId: missionSubmissions.userId, handle: users.handle, displayName: users.displayName })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .innerJoin(users, eq(missionSubmissions.userId, users.id))
      .where(and(eq(missions.circleId, circle.id), eq(missionSubmissions.status, "approved")))
      .limit(100),
    database
      .select({ userId: campaignCompletions.userId, handle: users.handle, displayName: users.displayName })
      .from(campaignCompletions)
      .innerJoin(campaigns, eq(campaignCompletions.campaignId, campaigns.id))
      .innerJoin(users, eq(campaignCompletions.userId, users.id))
      .where(and(eq(campaigns.circleId, circle.id), eq(campaignCompletions.status, "paid")))
      .limit(100),
  ]);
  for (const row of missionUsers) {
    if (!verifiedByUser.has(row.userId)) {
      verifiedByUser.set(row.userId, { handle: row.handle, displayName: row.displayName, basis: "mission" });
    }
  }
  for (const row of campaignUsers) {
    if (!verifiedByUser.has(row.userId)) {
      verifiedByUser.set(row.userId, { handle: row.handle, displayName: row.displayName, basis: "campaign" });
    }
  }
  for (const person of people) {
    if (isVerified(toSocial(person)) && !verifiedByUser.has(person.user.id)) {
      const social = toSocial(person);
      verifiedByUser.set(person.user.id, { handle: social.handle, displayName: social.displayName, basis: "role" });
    }
  }

  return {
    slug,
    groups,
    contributorSignals,
    verifiedParticipants: [...verifiedByUser.values()].slice(0, 24),
  };
}
