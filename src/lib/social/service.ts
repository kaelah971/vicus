import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  assets,
  circleMemberships,
  circles,
  missionSubmissions,
  missions,
  organizationMemberships,
  organizations,
  stellarRoleVerifications,
  userFollows,
  users,
} from "@/db/schema";
import { getUserProfileByHandle } from "@/lib/data/profiles";
import { MissionActionError } from "@/lib/missions/errors";
import type { CircleRecord, ProfileContribution, VerifiedRoleSummary } from "@/lib/data/types";

export type PublicContribution = {
  id: string;
  missionId: string;
  missionTitle: string;
  missionType: string;
  circleName: string;
  circleSlug: string;
  score: number | null;
  points: number;
  submittedAt: string;
  reviewedAt: string | null;
};

export type PublicActivityItem = {
  kind: "contribution" | "watch" | "verification";
  label: string;
  title: string;
  detail: string;
  at: string;
};

export type PublicProfile = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    preferredEcosystems: string[];
    assetInterests: string[];
  };
  approvedPoints: number;
  approvedContributionCount: number;
  watchedCircleCount: number;
  contributions: PublicContribution[];
  verifiedRoles: VerifiedRoleSummary[];
  watchedCircles: Array<{ circle: CircleRecord; since: string }>;
  affiliations: Array<{ organizationName: string; organizationSlug: string; role: string }>;
  followers: number;
  following: number;
  viewerFollowing: boolean;
  activity: PublicActivityItem[];
};

export type PersonCard = {
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  relationships: string[];
  approvedContributionCount: number;
  approvedPoints: number;
  recentApprovedAt: string | null;
};

function toPublicContribution(entry: ProfileContribution): PublicContribution {
  return {
    id: entry.id,
    missionId: entry.missionId,
    missionTitle: entry.missionTitle,
    missionType: entry.missionType,
    circleName: entry.circleName,
    circleSlug: entry.circleSlug,
    score: entry.score,
    points: entry.points,
    submittedAt: entry.submittedAt.toISOString(),
    reviewedAt: entry.reviewedAt?.toISOString() ?? null,
  };
}

async function resolveUserId(handle: string): Promise<string | null> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized || normalized.length > 80) return null;
  const database = getDatabase();
  const [row] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(1);
  return row?.id ?? null;
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  try {
    const database = getDatabase();
    const [[followerRow], [followingRow]] = await Promise.all([
      database
        .select({ value: count() })
        .from(userFollows)
        .where(eq(userFollows.followedUserId, userId)),
      database
        .select({ value: count() })
        .from(userFollows)
        .where(eq(userFollows.followerUserId, userId)),
    ]);
    return {
      followers: Number(followerRow?.value ?? 0),
      following: Number(followingRow?.value ?? 0),
    };
  } catch {
    throw toDatabaseUnavailableError("get follow counts");
  }
}

async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  const database = getDatabase();
  const [row] = await database
    .select({ id: userFollows.id })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerUserId, followerId),
        eq(userFollows.followedUserId, followedId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Idempotent follow. Only the signed-in user can create their own follow rows. */
export async function followUser(
  followerId: string | null | undefined,
  handle: string,
): Promise<{ following: boolean }> {
  if (!followerId || !/^[0-9a-f-]{36}$/i.test(followerId)) {
    throw new MissionActionError("unauthenticated", "Sign in to follow people.", 401);
  }
  try {
    const followedId = await resolveUserId(handle);
    if (!followedId) {
      throw new MissionActionError("invalid-request", "That person could not be found.", 404);
    }
    if (followedId === followerId) {
      throw new MissionActionError("invalid-request", "You cannot follow yourself.", 400);
    }
    const database = getDatabase();
    await database
      .insert(userFollows)
      .values({ followerUserId: followerId, followedUserId: followedId })
      .onConflictDoNothing({
        target: [userFollows.followerUserId, userFollows.followedUserId],
      });
    return { following: true };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("follow user");
  }
}

/** Safe unfollow: removing a non-existent relationship still succeeds. */
export async function unfollowUser(
  followerId: string | null | undefined,
  handle: string,
): Promise<{ following: boolean }> {
  if (!followerId || !/^[0-9a-f-]{36}$/i.test(followerId)) {
    throw new MissionActionError("unauthenticated", "Sign in to unfollow people.", 401);
  }
  try {
    const followedId = await resolveUserId(handle);
    if (!followedId) {
      throw new MissionActionError("invalid-request", "That person could not be found.", 404);
    }
    const database = getDatabase();
    await database
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerUserId, followerId),
          eq(userFollows.followedUserId, followedId),
        ),
      );
    return { following: false };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("unfollow user");
  }
}

/**
 * Public-safe profile projection. Enforced in the data loader: approved
 * contributions only (no revision feedback), supported verified roles only
 * (no wallet fields), org affiliation names only (no permission scope), and
 * never wallets, rewards, sessions, or balances.
 */
export async function getPublicProfileByHandle(
  handle: string,
  viewerId?: string | null,
): Promise<PublicProfile | null> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized || normalized.length > 80) return null;
  try {
    const profile = await getUserProfileByHandle(normalized);
    if (!profile) return null;

    const approved = profile.contributions.filter(
      (contribution) => contribution.status === "approved",
    );
    const contributions = approved.map((contribution) =>
      toPublicContribution({
        ...contribution,
        revisionReason: null,
      }),
    );

    const database = getDatabase();
    const [affiliationRows, counts] = await Promise.all([
      database
        .select({ name: organizations.name, slug: organizations.slug, role: organizationMemberships.role })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
        .where(eq(organizationMemberships.userId, profile.user.id))
        .orderBy(asc(organizations.name)),
      getFollowCounts(profile.user.id),
    ]);

    const watchedCircles = profile.memberships.map((membership) => ({
      circle: membership.circle,
      since: membership.joinedAt.toISOString(),
    }));

    const activity: PublicActivityItem[] = [
      ...approved.map((contribution) => ({
        kind: "contribution" as const,
        label: "Approved contribution",
        title: contribution.missionTitle,
        detail: `${contribution.circleName} · ${contribution.points} points`,
        at: (contribution.reviewedAt ?? contribution.submittedAt).toISOString(),
      })),
      ...profile.memberships.map((membership) => ({
        kind: "watch" as const,
        label: "Started watching",
        title: membership.circle.name,
        detail: membership.circle.ecosystemLabel,
        at: membership.joinedAt.toISOString(),
      })),
      ...profile.verifiedRoles.map((verified) => ({
        kind: "verification" as const,
        label: verified.role === "verified-holder" ? "Verified holder" : "Verified trustline",
        title: verified.circle.name,
        detail: verified.network,
        at: verified.verifiedAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 8);

    return {
      user: {
        id: profile.user.id,
        handle: profile.user.handle,
        displayName: profile.user.displayName,
        avatarUrl: profile.user.avatarUrl,
        bio: profile.user.bio,
        preferredEcosystems: profile.user.preferredEcosystems,
        assetInterests: profile.user.assetInterests,
      },
      approvedPoints: profile.approvedPoints,
      approvedContributionCount: approved.length,
      watchedCircleCount: watchedCircles.length,
      contributions,
      verifiedRoles: profile.verifiedRoles,
      watchedCircles,
      affiliations: affiliationRows.map((row) => ({
        organizationName: row.name,
        organizationSlug: row.slug,
        role: row.role,
      })),
      followers: counts.followers,
      following: counts.following,
      viewerFollowing:
        viewerId && viewerId !== profile.user.id
          ? await isFollowing(viewerId, profile.user.id)
          : false,
      activity,
    };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("get public profile");
  }
}

type PersonAccumulator = {
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  relationships: Set<string>;
  approvedContributionCount: number;
  approvedPoints: number;
  recentApprovedAt: string | null;
};

function toPersonCard(entry: PersonAccumulator): PersonCard {
  return {
    user: entry.user,
    relationships: [...entry.relationships],
    approvedContributionCount: entry.approvedContributionCount,
    approvedPoints: entry.approvedPoints,
    recentApprovedAt: entry.recentApprovedAt,
  };
}

/**
 * People in a Circle, collapsed to one card per person from real
 * relationships only: active Watch memberships, approved contributors, and
 * persisted verified-role holders. No wallet addresses leave this loader.
 */
export async function getCirclePeople(circleId: string): Promise<PersonCard[]> {
  if (!/^[0-9a-f-]{36}$/i.test(circleId)) return [];
  try {
    const database = getDatabase();
    const [watchRows, contributionRows, verifiedRows] = await Promise.all([
      database
        .select({ user: users, joinedAt: circleMemberships.joinedAt })
        .from(circleMemberships)
        .innerJoin(users, eq(circleMemberships.userId, users.id))
        .where(and(eq(circleMemberships.circleId, circleId), isNull(circleMemberships.leftAt)))
        .orderBy(asc(circleMemberships.joinedAt)),
      database
        .select({
          user: users,
          points: missions.points,
          submittedAt: missionSubmissions.submittedAt,
        })
        .from(missionSubmissions)
        .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
        .innerJoin(users, eq(missionSubmissions.userId, users.id))
        .where(
          and(
            eq(missions.circleId, circleId),
            eq(missionSubmissions.status, "approved"),
          ),
        )
        .orderBy(desc(missionSubmissions.submittedAt)),
      database
        .select({ user: users, role: stellarRoleVerifications.role })
        .from(stellarRoleVerifications)
        .innerJoin(users, eq(stellarRoleVerifications.userId, users.id))
        .where(eq(stellarRoleVerifications.circleId, circleId)),
    ]);

    const people = new Map<string, PersonAccumulator>();
    const ensure = (user: { id: string; handle: string; displayName: string; avatarUrl: string | null }) => {
      let entry = people.get(user.id);
      if (!entry) {
        entry = {
          user: { id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl },
          relationships: new Set<string>(),
          approvedContributionCount: 0,
          approvedPoints: 0,
          recentApprovedAt: null,
        };
        people.set(user.id, entry);
      }
      return entry;
    };

    for (const row of watchRows) {
      ensure(row.user).relationships.add("Watcher");
    }
    for (const row of contributionRows) {
      const entry = ensure(row.user);
      entry.relationships.add("Contributor");
      entry.approvedContributionCount += 1;
      entry.approvedPoints += row.points;
      const at = row.submittedAt.toISOString();
      if (!entry.recentApprovedAt || entry.recentApprovedAt < at) {
        entry.recentApprovedAt = at;
      }
    }
    for (const row of verifiedRows) {
      ensure(row.user).relationships.add(
        row.role === "verified-holder" ? "Verified Holder" : "Verified Trustline",
      );
    }

    return [...people.values()]
      .map(toPersonCard)
      .sort((a, b) => (b.recentApprovedAt ?? "").localeCompare(a.recentApprovedAt ?? ""));
  } catch {
    throw toDatabaseUnavailableError("get circle people");
  }
}

export type ContributorFilter = {
  ecosystem?: string | null;
  circleId?: string | null;
  interest?: string | null;
  sort?: "recent" | "points" | null;
  limit?: number | null;
};

/**
 * Contributor discovery over real derived data: approved contributions joined
 * to circles (and assets for ecosystem scope). No invented popularity metric;
 * sort is recency or approved points.
 */
export async function listContributors(filters: ContributorFilter = {}): Promise<PersonCard[]> {
  const ecosystem = typeof filters.ecosystem === "string" ? filters.ecosystem.trim().toLowerCase() : "";
  const circleId =
    typeof filters.circleId === "string" && /^[0-9a-f-]{36}$/i.test(filters.circleId)
      ? filters.circleId
      : "";
  const interest = typeof filters.interest === "string" ? filters.interest.trim().toLowerCase() : "";
  const sort = filters.sort === "points" ? "points" : "recent";
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 60);

  try {
    const database = getDatabase();
    const rows = await database
      .select({
        user: users,
        points: missions.points,
        submittedAt: missionSubmissions.submittedAt,
        circleId: missions.circleId,
        ecosystem: assets.ecosystem,
      })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .innerJoin(users, eq(missionSubmissions.userId, users.id))
      .where(eq(missionSubmissions.status, "approved"))
      .orderBy(desc(missionSubmissions.submittedAt))
      .limit(500);

    const people = new Map<string, PersonAccumulator & { interests: string[]; ecosystems: Set<string> }>();
    for (const row of rows) {
      if (ecosystem && (row.ecosystem ?? "stellar") !== ecosystem) continue;
      if (circleId && row.circleId !== circleId) continue;
      let entry = people.get(row.user.id);
      if (!entry) {
        entry = {
          user: { id: row.user.id, handle: row.user.handle, displayName: row.user.displayName, avatarUrl: row.user.avatarUrl },
          relationships: new Set<string>(["Contributor"]),
          approvedContributionCount: 0,
          approvedPoints: 0,
          recentApprovedAt: null,
          interests: [
            ...row.user.preferredEcosystems.map((value: string) => value.toLowerCase()),
            ...row.user.assetInterests.map((value: string) => value.toLowerCase()),
          ],
          ecosystems: new Set<string>(),
        };
        people.set(row.user.id, entry);
      }
      entry.approvedContributionCount += 1;
      entry.approvedPoints += row.points;
      entry.ecosystems.add(row.ecosystem ?? "stellar");
      const at = row.submittedAt.toISOString();
      if (!entry.recentApprovedAt || entry.recentApprovedAt < at) {
        entry.recentApprovedAt = at;
      }
    }

    let cards = [...people.values()];
    if (interest) {
      cards = cards.filter((entry) =>
        entry.interests.some((value) => value.includes(interest)),
      );
    }
    cards.sort((a, b) =>
      sort === "points"
        ? b.approvedPoints - a.approvedPoints
        : (b.recentApprovedAt ?? "").localeCompare(a.recentApprovedAt ?? ""),
    );
    return cards.slice(0, limit).map(toPersonCard);
  } catch {
    throw toDatabaseUnavailableError("list contributors");
  }
}

/** Lightweight ecosystem people: contributors + watchers scoped to an ecosystem. */
export async function getEcosystemPeople(
  ecosystemValue: string,
  limit = 8,
): Promise<PersonCard[]> {
  const normalized = ecosystemValue.trim().toLowerCase();
  if (!normalized) return [];
  try {
    const database = getDatabase();
    const circleRows = await database
      .select({ id: circles.id })
      .from(circles)
      .innerJoin(assets, eq(circles.assetId, assets.id))
      .where(eq(assets.ecosystem, normalized));
    if (circleRows.length === 0) return [];

    const contributors = await listContributors({ ecosystem: normalized, limit, sort: "recent" });
    const known = new Set(contributors.map((card) => card.user.id));

    const watchRows = await database
      .select({ user: users })
      .from(circleMemberships)
      .innerJoin(users, eq(circleMemberships.userId, users.id))
      .where(
        and(
          inArray(
            circleMemberships.circleId,
            circleRows.map((row) => row.id),
          ),
          isNull(circleMemberships.leftAt),
        ),
      )
      .orderBy(desc(circleMemberships.joinedAt))
      .limit(limit * 2);

    const cards = [...contributors];
    for (const row of watchRows) {
      if (known.has(row.user.id) || cards.length >= limit) continue;
      known.add(row.user.id);
      cards.push({
        user: { id: row.user.id, handle: row.user.handle, displayName: row.user.displayName, avatarUrl: row.user.avatarUrl },
        relationships: ["Watcher"],
        approvedContributionCount: 0,
        approvedPoints: 0,
        recentApprovedAt: null,
      });
    }
    return cards.slice(0, limit);
  } catch {
    throw toDatabaseUnavailableError("get ecosystem people");
  }
}
