import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import { activityEvents, assets, circles, missions } from "@/db/schema";
import type { MissionPreview } from "@/lib/vicus-data";
import { getSubmissionStatesForUser } from "@/lib/data/missions";
import type { ActivityRecord, CircleDetail, CircleRecord, MissionRecord } from "@/lib/data/types";
import type { SubmissionState } from "@/lib/missions/types";

const supportedActions = ["Read the Passport", "Watch circle", "Review source material"];

type CircleRow = typeof circles.$inferSelect;
type AssetRow = typeof assets.$inferSelect;
type MissionRow = typeof missions.$inferSelect;

type JoinedCircle = {
  circle: CircleRow;
  asset: AssetRow | null;
};

function stateFor(circle: CircleRow) {
  if (circle.status === "education-only") {
    return { state: "education" as const, stateLabel: "Education only" };
  }

  if (circle.status === "community" || circle.officialStatus === "community") {
    return { state: "community" as const, stateLabel: "Community" };
  }

  if (circle.officialStatus === "official") {
    return { state: "source-review" as const, stateLabel: "Official" };
  }

  return { state: "source-review" as const, stateLabel: "Source review" };
}

function stringMetadata(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function mapMission(mission: MissionRow, submission: SubmissionState | null = null): MissionRecord {
  const reward =
    mission.rewardAsset && mission.rewardAmount
      ? `${mission.rewardAmount} ${mission.rewardAsset}`
      : "No reward configured";

  const preview: MissionPreview = {
    title: mission.title,
    description: mission.description,
    type: mission.type,
    review:
      mission.reviewMode === "manual"
        ? "Manual review"
        : mission.reviewMode === "not-connected"
          ? "Preview only"
          : mission.reviewMode,
    reward,
  };

  return {
    ...preview,
    id: mission.id,
    points: mission.points,
    status: mission.status,
    submissionStatus: submission?.status ?? null,
    submissionScore: submission?.score ?? null,
  };
}

function mapActivity(event: typeof activityEvents.$inferSelect): ActivityRecord {
  const metadata = event.metadata;

  return {
    id: event.id,
    label: stringMetadata(metadata, "label") ?? "Database activity",
    title: stringMetadata(metadata, "title") ?? "Circle activity is ready to be connected",
    detail:
      stringMetadata(metadata, "detail") ??
      "This event does not include additional public detail.",
  };
}

export function mapCircle({ circle, asset }: JoinedCircle): CircleRecord {
  const state = stateFor(circle);
  const sourceUrl = asset?.verificationSourceUrl ?? asset?.officialUrl ?? "";
  const hasAsset = Boolean(asset);
  const verificationMode = asset?.verificationMode ?? null;
  const verificationEnabled = Boolean(
    verificationMode === "classic-asset" &&
      asset?.stellarNetwork &&
      asset.stellarAssetCode &&
      asset.stellarIssuerAccount,
  );

  return {
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    code: asset?.code ?? "Education",
    network: asset?.chain ?? "Stellar",
    category: circle.category,
    state: state.state,
    stateLabel: state.stateLabel,
    summary: circle.tagline ?? "This circle does not have a summary yet.",
    description:
      asset?.description ??
      "This is an education-only circle without a specific asset record attached.",
    intendedUse:
      asset?.intendedUse ??
      "Use category-level context to build better questions without treating this as an asset record.",
    eligibilityNote:
      asset?.eligibilityNote ?? "There is no asset eligibility to verify on this circle.",
    riskNote:
      asset?.riskNote ??
      "Educational material can inform questions but cannot replace official disclosures or professional advice.",
    issuerSource: asset?.issuer ?? (hasAsset ? "Issuer source review pending" : "No issuer attached"),
    sourceStatus: asset?.sourceStatus ?? "No asset source attached",
    sourceUrl,
    sourceLabel: sourceUrl ? "Official source" : "No source attached",
    lastVerified: asset?.lastVerifiedAt
      ? asset.lastVerifiedAt.toISOString().slice(0, 10)
      : "Not verified in this database",
    availability: {
      watch: "available",
      learn: "available",
      role: verificationEnabled ? "available" : "not-wired",
    },
    actions: verificationEnabled ? [...supportedActions, "Verify your role"] : supportedActions,
    verification: {
      enabled: verificationEnabled,
      mode: verificationMode,
      network: asset?.stellarNetwork ?? null,
      assetCode: asset?.stellarAssetCode ?? null,
      sourceUrl: asset?.verificationSourceUrl ?? null,
    },
    mission: null,
  };
}

async function getJoinedCircleBySlug(slug: string): Promise<JoinedCircle | null> {
  const database = getDatabase();
  const [row] = await database
    .select({ circle: circles, asset: assets })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(eq(circles.slug, slug))
    .limit(1);

  return row ?? null;
}

export async function listCircles(): Promise<CircleRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database
      .select({ circle: circles, asset: assets })
      .from(circles)
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .orderBy(asc(circles.featuredRank), asc(circles.name));

    return rows.map(mapCircle);
  } catch {
    throw toDatabaseUnavailableError("list circles");
  }
}

export async function getCircleMissions(circleId: string): Promise<MissionRecord[]> {
  try {
    const database = getDatabase();
    const rows = await database
      .select()
      .from(missions)
      .where(eq(missions.circleId, circleId))
      .orderBy(asc(missions.createdAt));

    return rows.map((mission) => mapMission(mission));
  } catch {
    throw toDatabaseUnavailableError("get circle missions");
  }
}

export type CircleVerificationConfig = {
  circleSlug: string;
  circleName: string;
  verificationMode: string | null;
  stellarNetwork: string | null;
  stellarAssetCode: string | null;
  stellarIssuerAccount: string | null;
  stellarContractId: string | null;
  verificationSourceUrl: string | null;
};

export async function getCircleVerificationConfig(
  slug: string,
): Promise<CircleVerificationConfig | null> {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug || normalizedSlug.length > 140) {
    return null;
  }

  try {
    const database = getDatabase();
    const [row] = await database
      .select({
        circleSlug: circles.slug,
        circleName: circles.name,
        verificationMode: assets.verificationMode,
        stellarNetwork: assets.stellarNetwork,
        stellarAssetCode: assets.stellarAssetCode,
        stellarIssuerAccount: assets.stellarIssuerAccount,
        stellarContractId: assets.stellarContractId,
        verificationSourceUrl: assets.verificationSourceUrl,
      })
      .from(circles)
      .leftJoin(assets, eq(circles.assetId, assets.id))
      .where(eq(circles.slug, normalizedSlug))
      .limit(1);

    return row ?? null;
  } catch {
    throw toDatabaseUnavailableError("get circle verification config");
  }
}

export async function getCircleBySlug(
  slug: string,
  userId?: string | null,
): Promise<CircleDetail | null> {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug || normalizedSlug.length > 140) {
    return null;
  }

  try {
    const joinedCircle = await getJoinedCircleBySlug(normalizedSlug);

    if (!joinedCircle) {
      return null;
    }

    const database = getDatabase();
    const [missionRows, activityRows] = await Promise.all([
      database
        .select()
        .from(missions)
        .where(eq(missions.circleId, joinedCircle.circle.id))
        .orderBy(asc(missions.createdAt)),
      database
        .select()
        .from(activityEvents)
        .where(
          and(eq(activityEvents.circleId, joinedCircle.circle.id), eq(activityEvents.type, "pulse")),
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(6),
    ]);

    const mappedCircle = mapCircle(joinedCircle);
    const submissionStates = await getSubmissionStatesForUser(
      missionRows.map((mission) => mission.id),
      userId,
    );
    const mappedMissions = missionRows.map((mission) =>
      mapMission(mission, submissionStates.get(mission.id) ?? null),
    );

    return {
      ...mappedCircle,
      mission: mappedMissions[0] ?? null,
      missions: mappedMissions,
      activity: activityRows.map(mapActivity),
    };
  } catch {
    throw toDatabaseUnavailableError("get circle");
  }
}
