import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { assetCapabilities, circles } from "@/db/schema";

export const capabilitySupportModes = ["in_vicus", "connected", "guide"] as const;

export type CapabilitySupportMode = (typeof capabilitySupportModes)[number];

export const capabilityTypes = [
  "send",
  "receive",
  "pay",
  "cash_out",
  "swap",
  "transfer",
  "build",
  "invest",
  "redeem",
  "collateral",
  "save",
  "access",
  "move",
  "earn",
  "supply",
  "borrow",
] as const;

export type CapabilityType = (typeof capabilityTypes)[number];

export const supportModeBadge: Record<CapabilitySupportMode, string> = {
  in_vicus: "Available in Vicus",
  connected: "Official flow",
  guide: "Guide",
};

export type AssetCapability = {
  id: string;
  circleId: string;
  circleSlug: string;
  circleName: string;
  capabilityType: string;
  title: string;
  shortDescription: string;
  supportMode: CapabilitySupportMode;
  ctaLabel: string;
  destinationUrl: string | null;
  sourceUrl: string;
  eligibilityNote: string | null;
};

export function isSupportedCapabilityType(value: unknown): value is CapabilityType {
  return typeof value === "string" && (capabilityTypes as readonly string[]).includes(value);
}

export function isSupportedSupportMode(value: unknown): value is CapabilitySupportMode {
  return typeof value === "string" && (capabilitySupportModes as readonly string[]).includes(value);
}

function mapCapability(
  row: typeof assetCapabilities.$inferSelect,
  circle: { slug: string; name: string },
): AssetCapability {
  return {
    id: row.id,
    circleId: row.circleId,
    circleSlug: circle.slug,
    circleName: circle.name,
    capabilityType: row.capabilityType,
    title: row.title,
    shortDescription: row.shortDescription,
    supportMode: row.supportMode as CapabilitySupportMode,
    ctaLabel: row.ctaLabel,
    destinationUrl: row.destinationUrl,
    sourceUrl: row.sourceUrl,
    eligibilityNote: row.eligibilityNote,
  };
}

/**
 * Public utility loader. Only active capabilities, only the exact public
 * key set — no wallet, session, or private data can leak because the table
 * carries none and the mapper selects nothing else.
 *
 * NOTE (activation-campaign foundation): a future activation mission can
 * reference Circle -> Capability -> action/proof -> reward by storing the
 * capability id on the mission row. That relationship is intentionally NOT
 * added here — mission schema stays unchanged until the campaign slice.
 */
export async function getCircleCapabilities(circleSlug: string): Promise<AssetCapability[]> {
  try {
    const database = getDatabase();
    const [circle] = await database
      .select({ id: circles.id, slug: circles.slug, name: circles.name })
      .from(circles)
      .where(eq(circles.slug, circleSlug))
      .limit(1);
    if (!circle) return [];
    const rows = await database
      .select()
      .from(assetCapabilities)
      .where(and(eq(assetCapabilities.circleId, circle.id), eq(assetCapabilities.active, true)))
      .orderBy(asc(assetCapabilities.sortOrder), asc(assetCapabilities.capabilityType));
    return rows.map((row) => mapCapability(row, circle));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("get circle capabilities");
  }
}

export async function getCapabilityDetail(
  circleSlug: string,
  capabilityType: string,
): Promise<AssetCapability | null> {
  if (!isSupportedCapabilityType(capabilityType)) return null;
  const capabilities = await getCircleCapabilities(circleSlug);
  return capabilities.find((entry) => entry.capabilityType === capabilityType) ?? null;
}

export type SpaceCapabilityGroup = {
  circleSlug: string;
  circleName: string;
  capabilities: AssetCapability[];
};

/** Space utility: active capabilities across hosted Circles only. */
export async function getSpaceCapabilities(organizationId: string): Promise<SpaceCapabilityGroup[]> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return [];
  try {
    const database = getDatabase();
    const hosted = await database
      .select({ id: circles.id, slug: circles.slug, name: circles.name })
      .from(circles)
      .where(eq(circles.organizationId, organizationId));
    if (hosted.length === 0) return [];
    const rows = await database
      .select()
      .from(assetCapabilities)
      .where(
        and(
          inArray(
            assetCapabilities.circleId,
            hosted.map((circle) => circle.id),
          ),
          eq(assetCapabilities.active, true),
        ),
      )
      .orderBy(asc(assetCapabilities.sortOrder), asc(assetCapabilities.capabilityType));
    const byCircle = new Map(hosted.map((circle) => [circle.id, circle]));
    const groups = new Map<string, SpaceCapabilityGroup>();
    for (const row of rows) {
      const circle = byCircle.get(row.circleId);
      if (!circle) continue;
      const group = groups.get(circle.id) ?? {
        circleSlug: circle.slug,
        circleName: circle.name,
        capabilities: [],
      };
      group.capabilities.push(mapCapability(row, circle));
      groups.set(circle.id, group);
    }
    return hosted
      .filter((circle) => groups.has(circle.id))
      .map((circle) => groups.get(circle.id)!);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("get space capabilities");
  }
}
