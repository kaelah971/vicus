import { and, asc, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError } from "@/db";
import { assetLifecycleSteps, circles } from "@/db/schema";
import { supportModeBadge, type CapabilitySupportMode } from "@/lib/utility/service";

export const lifecycleStages = ["access", "hold", "use", "earn", "exit"] as const;

export type LifecycleStage = (typeof lifecycleStages)[number];

export const lifecycleAccessModes = ["official", "venue", "vicus_router"] as const;

export type LifecycleAccessMode = (typeof lifecycleAccessModes)[number];

const STAGE_ORDER: Record<LifecycleStage, number> = {
  access: 0,
  hold: 1,
  use: 2,
  earn: 3,
  exit: 4,
};

export function isLifecycleStage(value: unknown): value is LifecycleStage {
  return (
    typeof value === "string" &&
    (lifecycleStages as readonly string[]).includes(value)
  );
}

export function isLifecycleAccessMode(value: unknown): value is LifecycleAccessMode {
  return (
    typeof value === "string" &&
    (lifecycleAccessModes as readonly string[]).includes(value)
  );
}

export type LifecycleStep = {
  id: string;
  circleId: string;
  circleSlug: string;
  stage: LifecycleStage;
  title: string;
  shortDescription: string;
  supportMode: CapabilitySupportMode;
  supportModeLabel: string;
  accessMode: LifecycleAccessMode | null;
  ctaLabel: string | null;
  destinationUrl: string | null;
  sourceUrl: string;
  eligibilityNote: string | null;
};

function mapStep(
  row: typeof assetLifecycleSteps.$inferSelect,
  circleSlug: string,
): LifecycleStep {
  const supportMode = (
    ["in_vicus", "connected", "guide"] as const
  ).includes(row.supportMode as CapabilitySupportMode)
    ? (row.supportMode as CapabilitySupportMode)
    : ("guide" as const);
  return {
    id: row.id,
    circleId: row.circleId,
    circleSlug,
    stage: row.stage as LifecycleStage,
    title: row.title,
    shortDescription: row.shortDescription,
    supportMode,
    supportModeLabel: supportModeBadge[supportMode],
    accessMode: isLifecycleAccessMode(row.accessMode) ? row.accessMode : null,
    ctaLabel: row.ctaLabel,
    destinationUrl: row.destinationUrl,
    sourceUrl: row.sourceUrl,
    eligibilityNote: row.eligibilityNote,
  };
}

/**
 * Active lifecycle steps for a Circle, in deterministic ACCESS → EXIT order.
 * Public asset metadata only — no user, wallet, or session data involved.
 */
export async function getCircleLifecycle(circleSlug: string): Promise<LifecycleStep[]> {
  if (typeof circleSlug !== "string" || !circleSlug.trim()) return [];
  try {
    const database = getDatabase();
    const rows = await database
      .select({
        step: assetLifecycleSteps,
        circleSlug: circles.slug,
      })
      .from(assetLifecycleSteps)
      .innerJoin(circles, eq(assetLifecycleSteps.circleId, circles.id))
      .where(
        and(
          eq(circles.slug, circleSlug.trim()),
          eq(assetLifecycleSteps.active, true),
        ),
      )
      .orderBy(asc(assetLifecycleSteps.sortOrder), asc(assetLifecycleSteps.stage));
    return rows
      .map((row) => mapStep(row.step, row.circleSlug))
      .filter((step) => isLifecycleStage(step.stage))
      .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    return [];
  }
}
