import { and, count, eq, isNull } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  assets,
  circles,
  circleMemberships,
  missions,
  missionSubmissions,
  stellarRoleVerifications,
  stellarWallets,
} from "@/db/schema";
import { getCircleVerificationConfig } from "@/lib/data/circles";
import {
  unsupportedVerificationResult,
  verifyClassicAssetRole,
  type VerificationBalances,
} from "@/lib/stellar/verify-role";
import type { StellarVerificationResult } from "@/lib/stellar/types";

export const SUPPORTED_PERSISTED_ROLES = ["verified-holder", "verified-trustline"] as const;
export type PersistedRoleType = (typeof SUPPORTED_PERSISTED_ROLES)[number];

/**
 * P7.2 freshness policy: a persisted holder check authorizes restricted
 * access for 24 hours. Older rows are history, not permission — any
 * protected boundary must revalidate through requireFreshHolderAccess.
 * Horizon outages always fail closed and never rewrite history.
 */
export const ROLE_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

export function isRoleFresh(lastCheckedAt: Date, now: number = Date.now()): boolean {
  const checked = lastCheckedAt instanceof Date ? lastCheckedAt.getTime() : NaN;
  if (!Number.isFinite(checked) || checked > now) return false;
  return now - checked < ROLE_FRESHNESS_MS;
}

export type FreshHolderAccessVerdict =
  | { ok: true; role: "verified-holder"; fresh: boolean; checkedAt: Date }
  | { ok: false; reason: "no-role" | "trustline-only" | "stale-unqualified" | "unavailable" | "unsupported" | "wallet-unlinked" };

/**
 * Authoritative holder gate for restricted Circle experiences. Fresh
 * persisted holder rows pass without network; anything else triggers a
 * live linked-wallet recheck. A confirmed-negative recheck removes the
 * stale row (history lives on in receipts/completions, not in permission)
 * while outages and unsupported configs fail closed and preserve it.
 * Trustline-only never authorizes holder access.
 */
export async function requireFreshHolderAccess(
  input: LinkedWalletVerificationInput,
  overrides?: LinkedWalletVerificationOverrides & { now?: number },
): Promise<FreshHolderAccessVerdict> {
  const now = overrides?.now ?? Date.now();
  const database = getDatabase();
  try {
    // Wallet-link check first (DB only, no network): the wallet row must
    // still belong to the requesting user, or nothing proceeds.
    const [link] = await database
      .select({ id: stellarWallets.id })
      .from(stellarWallets)
      .where(and(eq(stellarWallets.id, input.walletId), eq(stellarWallets.userId, input.userId)))
      .limit(1);
    if (!link) return { ok: false, reason: "wallet-unlinked" };

    const persisted = await getRoleVerificationForCircle(input.userId, input.circleSlug);
    if (persisted && persisted.role === "verified-holder" && isRoleFresh(persisted.lastCheckedAt, now)) {
      return { ok: true, role: "verified-holder", fresh: true, checkedAt: persisted.lastCheckedAt };
    }
    if (persisted && persisted.role !== "verified-holder" && isRoleFresh(persisted.lastCheckedAt, now)) {
      return { ok: false, reason: "trustline-only" };
    }

    // Stale or missing: live authoritative recheck through the linked
    // wallet (ownership re-verified inside; pasted addresses impossible).
    const { result } = await verifyLinkedWalletForCircle(input, overrides);
    if (result.qualified && result.role === "verified-holder") {
      const fresh = await getRoleVerificationForCircle(input.userId, input.circleSlug);
      return { ok: true, role: "verified-holder", fresh: false, checkedAt: fresh?.lastCheckedAt ?? new Date(now) };
    }
    if (result.status === "verified-trustline") {
      return { ok: false, reason: "trustline-only" };
    }
    if (result.status === "not-qualified" || result.status === "account-not-found") {
      // Confirmed negative from the live chain: the stale row must not
      // authorize anything again. Outages never reach this branch.
      const [circleRow] = await database
        .select({ id: circles.id })
        .from(circles)
        .where(eq(circles.slug, input.circleSlug.trim()))
        .limit(1);
      if (circleRow) {
        await database
          .delete(stellarRoleVerifications)
          .where(
            and(
              eq(stellarRoleVerifications.userId, input.userId),
              eq(stellarRoleVerifications.circleId, circleRow.id),
            ),
          );
      }
      return { ok: false, reason: "stale-unqualified" };
    }
    if (result.status === "unsupported") return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "unavailable" };
  } catch {
    throw toDatabaseUnavailableError("require fresh holder access");
  }
}

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

export type LinkedWalletVerificationOverrides = {
  loadAccount?: (accountId: string) => Promise<{ balances: VerificationBalances } | null>;
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
  overrides?: LinkedWalletVerificationOverrides,
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

  // Ownership boundary FIRST (before any network call): the wallet row must
  // belong to the requesting user. Callers pass session values today, but
  // persistence must never hinge on caller honesty — a mismatched walletId
  // persists nothing, by construction, without touching Horizon.
  try {
    const database = getDatabase();
    const [link] = await database
      .select({ id: stellarWallets.id })
      .from(stellarWallets)
      .where(and(eq(stellarWallets.id, input.walletId), eq(stellarWallets.userId, input.userId)))
      .limit(1);
    if (!link) {
      return {
        result: {
          status: "unsupported",
          role: "none",
          qualified: false,
          reason: "That wallet is not linked to your account.",
          assetCode: config.stellarAssetCode ?? null,
          network: config.stellarNetwork ?? null,
          checkedAt: new Date().toISOString(),
        },
        persisted: null,
      };
    }
  } catch {
    throw toDatabaseUnavailableError("verify wallet link");
  }

  const result = await verifyClassicAssetRole(
    input.walletPublicKey,
    {
      assetCode: config.stellarAssetCode,
      issuerAccount: config.stellarIssuerAccount,
      network: config.stellarNetwork,
    },
    overrides ? { loadAccount: overrides.loadAccount } : undefined,
  );

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
