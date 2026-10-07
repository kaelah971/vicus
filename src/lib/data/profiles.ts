import { and, asc, eq, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import { assets, badges, circleMemberships, circles, stellarWallets, users } from "@/db/schema";
import type { ProfileBadge, ProfileMembership, UserProfile } from "@/lib/data/types";
import { mapCircle } from "@/lib/data/circles";
import { getUserContributions } from "@/lib/data/missions";
import { getUserRewardStates } from "@/lib/data/rewards";

async function buildUserProfile(
  database: ReturnType<typeof getDatabase>,
  user: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
  },
  includeWallets: boolean,
): Promise<UserProfile> {
  const walletRowsPromise = includeWallets
    ? database
        .select({
          id: stellarWallets.id,
          network: stellarWallets.network,
          publicKey: stellarWallets.publicKey,
          verifiedAt: stellarWallets.verifiedAt,
        })
        .from(stellarWallets)
        .where(eq(stellarWallets.userId, user.id))
        .orderBy(asc(stellarWallets.createdAt))
    : Promise.resolve([]);

  const [membershipRows, badgeRows, participation, walletRows] = await Promise.all([
    database
      .select({ membership: circleMemberships, circle: circles, asset: assets })
      .from(circleMemberships)
      .innerJoin(circles, eq(circleMemberships.circleId, circles.id))
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .where(and(eq(circleMemberships.userId, user.id), isNull(circleMemberships.leftAt)))
      .orderBy(asc(circleMemberships.joinedAt)),
    database
      .select({ badge: badges, circle: circles, asset: assets })
      .from(badges)
      .leftJoin(circles, eq(badges.circleId, circles.id))
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .where(and(eq(badges.userId, user.id), isNull(badges.revokedAt)))
      .orderBy(asc(badges.awardedAt)),
    getUserContributions(user.id),
    walletRowsPromise,
  ]);
  const rewards = includeWallets ? await getUserRewardStates(user.id, walletRows[0]?.publicKey ?? null) : [];

  const memberships: ProfileMembership[] = membershipRows.map(({ membership, circle, asset }) => ({
    id: membership.id,
    role: membership.role,
    source: membership.source,
    joinedAt: membership.joinedAt,
    circle: mapCircle({ circle, asset }),
  }));

  const profileBadges: ProfileBadge[] = badgeRows.map(({ badge, circle, asset }) => ({
    id: badge.id,
    badgeType: badge.badgeType,
    metadata: badge.metadata,
    awardedAt: badge.awardedAt,
    circle: circle ? mapCircle({ circle, asset }) : null,
  }));

  return {
    user,
    wallets: walletRows,
    memberships,
    badges: profileBadges,
    contributions: participation.contributions,
    rewards,
    approvedPoints: participation.approvedPoints,
  };
}

export async function getUserProfileByHandle(handle: string): Promise<UserProfile | null> {
  const normalizedHandle = handle.trim().toLowerCase();

  if (!normalizedHandle || normalizedHandle.length > 80) {
    return null;
  }

  try {
    const database = getDatabase();
    const [user] = await database
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
      })
      .from(users)
      .where(eq(users.handle, normalizedHandle))
      .limit(1);

    return user ? buildUserProfile(database, user, false) : null;
  } catch {
    throw toDatabaseUnavailableError("get user profile");
  }
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return null;
  }

  try {
    const database = getDatabase();
    const [user] = await database
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ? buildUserProfile(database, user, true) : null;
  } catch {
    throw toDatabaseUnavailableError("get authenticated user profile");
  }
}
