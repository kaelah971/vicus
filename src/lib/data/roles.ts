import { and, count, eq, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  assets,
  circles,
  circleMemberships,
  missions,
  missionSubmissions,
  stellarRoleVerifications,
} from "@/db/schema";
import { getCircleVerificationConfig } from "@/lib/data/circles";
import {
  unsupportedVerificationResult,
  verifyClassicAssetRole,
} from "@/lib/stellar/verify-role";
import type { StellarVerificationResult } from "@/lib/stellar/types";

export const SUPPORTED_PERSISTED_ROLES = ["verified-holder", "verified-trustline"] as const;
export type PersistedRoleType = (typeof SUPPORTED_PERSISTED_ROLES)[number];

function isPersistedRoleType(role: string): role is PersistedRoleType {
  return (SUPPORTED_PERSISTED_ROLES as readonly string[]).includes(role);
}

export type VerifiedRoleRecord = {
  id: string;
  role: PersistedRoleType;
  lastState: string;
  ecosystem: string;
  network: string;
  verifiedAt: Date;
  lastCheckedAt: Date;
  circle: {
    id: string;
    slug: string;
    name: string;
    category: string;
    ecosystem: string;
    ecosystemLabel: string;
  };
};

export type CircleParticipation = {
  watcherCount: number;
  verificationCount: number;
  approvedContributionCount: number;
};

function ecosystemLabel(ecosystem: string): string {
  if (ecosystem === "stellar") return "Stellar";
  return ecosystem.charAt(0).toUpperCase() + ecosystem.slice(1);
}

export async function getVerifiedRolesForUser(userId: string): Promise<VerifiedRoleRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({
        verification: stellarRoleVerifications,
        circle: circles,
        asset: assets,
      })
      .from(stellarRoleVerifications)
      .innerJoin(circles, eq(stellarRoleVerifications.circleId, circles.id))
      .leftJoin(assets, eq(stellarRoleVerifications.assetId, assets.id))
      .where(eq(stellarRoleVerifications.userId, userId))
      .orderBy(stellarRoleVerifications.lastCheckedAt);

    const records: VerifiedRoleRecord[] = [];
    for (const row of rows) {
      if (!isPersistedRoleType(row.verification.role)) continue;
      const ecosystem = row.verification.ecosystem || row.asset?.ecosystem || "stellar";
      records.push({
        id: row.verification.id,
        role: row.verification.role,
        lastState: row.verification.lastState,
        ecosystem,
        network: row.verification.network,
        verifiedAt: row.verification.verifiedAt,
        lastCheckedAt: row.verification.lastCheckedAt,
        circle: {
          id: row.circle.id,
          slug: row.circle.slug,
          name: row.circle.name,
          category: row.circle.category,
          ecosystem,
          ecosystemLabel: ecosystemLabel(ecosystem),
        },
      });
    }
    return records;
  } catch {
    throw toDatabaseUnavailableError("get verified roles");
  }
}

export async function getRoleVerificationForCircle(
  userId: string,
  circleSlug: string,
): Promise<VerifiedRoleRecord | null> {
  try {
    const database = getDatabase();
    const [row] = await database
      .select({
        verification: stellarRoleVerifications,
        circle: circles,
        asset: assets,
      })
      .from(stellarRoleVerifications)
      .innerJoin(circles, eq(stellarRoleVerifications.circleId, circles.id))
      .leftJoin(assets, eq(stellarRoleVerifications.assetId, assets.id))
      .where(
        and(
          eq(stellarRoleVerifications.userId, userId),
          eq(circles.slug, circleSlug.trim()),
        ),
      )
      .limit(1);

    if (!row || !isPersistedRoleType(row.verification.role)) return null;
    const ecosystem = row.verification.ecosystem || row.asset?.ecosystem || "stellar";
    return {
      id: row.verification.id,
      role: row.verification.role,
      lastState: row.verification.lastState,
      ecosystem,
      network: row.verification.network,
      verifiedAt: row.verification.verifiedAt,
      lastCheckedAt: row.verification.lastCheckedAt,
      circle: {
        id: row.circle.id,
        slug: row.circle.slug,
        name: row.circle.name,
        category: row.circle.category,
        ecosystem,
        ecosystemLabel: ecosystemLabel(ecosystem),
      },
    };
  } catch {
    throw toDatabaseUnavailableError("get circle role verification");
  }
}

export type LinkedWalletVerificationInput = {
  userId: string;
  walletId: string;
  walletPublicKey: string;
  circleSlug: string;
};

export type LinkedWalletVerificationOutcome = {
  result: StellarVerificationResult;
  persisted: VerifiedRoleRecord | null;
};

/**
 * Verify the authenticated user's linked wallet against the circle's canonical
 * Stellar asset and persist ONLY successful supported roles. Pasted-address
 * checks never reach this path.
 */
export async function verifyLinkedWalletForCircle(
  input: LinkedWalletVerificationInput,
): Promise<LinkedWalletVerificationOutcome> {
  const config = await getCircleVerificationConfig(input.circleSlug);

  if (!config) {
    const result: StellarVerificationResult = {
      status: "unsupported",
      role: "none",
      qualified: false,
      reason: "That circle could not be found.",
      assetCode: null,
      network: null,
      checkedAt: new Date().toISOString(),
    };
    return { result, persisted: null };
  }

  if (
    config.verificationMode !== "classic-asset" ||
    config.stellarNetwork !== "mainnet" ||
    !config.stellarAssetCode ||
    !config.stellarIssuerAccount
  ) {
    return {
      result: unsupportedVerificationResult(config.stellarAssetCode, config.stellarNetwork),
      persisted: null,
    };
  }

  const result = await verifyClassicAssetRole(input.walletPublicKey, {
    assetCode: config.stellarAssetCode,
    issuerAccount: config.stellarIssuerAccount,
    network: config.stellarNetwork,
  });

  if (!result.qualified || !isPersistedRoleType(result.role)) {
    return { result, persisted: null };
  }

  try {
    const database = getDatabase();
    const [circleRow] = await database
      .select({ id: circles.id, assetId: circles.assetId, ecosystem: assets.ecosystem })
      .from(circles)
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .where(eq(circles.slug, input.circleSlug.trim()))
      .limit(1);

    if (!circleRow) {
      return { result, persisted: null };
    }

    const now = new Date();
    const ecosystem = circleRow.ecosystem || "stellar";

    await database
      .insert(stellarRoleVerifications)
      .values({
        userId: input.userId,
        walletId: input.walletId,
        circleId: circleRow.id,
        assetId: circleRow.assetId,
        role: result.role,
        ecosystem,
        network: config.stellarNetwork,
        verifiedAt: now,
        lastCheckedAt: now,
        lastState: result.status,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [stellarRoleVerifications.userId, stellarRoleVerifications.circleId],
        set: {
          walletId: input.walletId,
          assetId: circleRow.assetId,
          role: result.role,
          ecosystem,
          network: config.stellarNetwork,
          lastCheckedAt: now,
          lastState: result.status,
          updatedAt: now,
        },
      });

    const persisted = await getRoleVerificationForCircle(input.userId, input.circleSlug);
    return { result, persisted };
  } catch {
    throw toDatabaseUnavailableError("persist role verification");
  }
}

export async function getCircleParticipation(circleId: string): Promise<CircleParticipation> {
  try {
    const database = getDatabase();
    const [[watchers], [verifications], [approved]] = await Promise.all([
      database
        .select({ value: count() })
        .from(circleMemberships)
        .where(
          and(
            eq(circleMemberships.circleId, circleId),
            isNull(circleMemberships.leftAt),
          ),
        ),
      database
        .select({ value: count() })
        .from(stellarRoleVerifications)
        .where(eq(stellarRoleVerifications.circleId, circleId)),
      database
        .select({ value: count() })
        .from(missionSubmissions)
        .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
        .where(
          and(
            eq(missions.circleId, circleId),
            eq(missionSubmissions.status, "approved"),
          ),
        ),
    ]);

    return {
      watcherCount: watchers?.value ?? 0,
      verificationCount: verifications?.value ?? 0,
      approvedContributionCount: approved?.value ?? 0,
    };
  } catch {
    throw toDatabaseUnavailableError("get circle participation");
  }
}
