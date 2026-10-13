import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { circlePosts, circles, theses, users } from "@/db/schema";
import { getSubjectDef } from "@/lib/subjects/config";
import { getStellarPositions } from "@/lib/positions/service";

/**
 * Conviction V1 — structured paper theses with evidence. A thesis is a
 * claim + timeframe + author confidence + cited evidence around one Circle
 * or one subject. Paper means no money at risk and no position claim.
 * Position linking proves existence-only at creation through the Stellar
 * session wallet; agent publishing has a render shape but no fake agents.
 */

export const THESIS_TIMEFRAMES = ["7d", "30d", "90d", "6m", "custom"] as const;
export type ThesisTimeframe = (typeof THESIS_TIMEFRAMES)[number];

export const THESIS_STATUSES = ["open", "resolved", "withdrawn", "expired"] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const THESIS_TYPES = ["paper", "verified-position", "agent-paper"] as const;
export type ThesisType = (typeof THESIS_TYPES)[number];

const TIMEFRAME_DAYS: Record<Exclude<ThesisTimeframe, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "6m": 180,
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type EvidenceRef = {
  kind: "post" | "source";
  label: string;
  url: string | null;
  postId: string | null;
};

export type ThesisView = {
  id: string;
  authorHandle: string;
  authorDisplayName: string;
  circleSlug: string | null;
  subjectSlug: string | null;
  title: string;
  claim: string;
  timeframe: string;
  confidence: number;
  /** Deterministic read state: open past closesAt reads as expired. */
  status: ThesisStatus;
  thesisType: ThesisType;
  evidence: EvidenceRef[];
  positionLinked: boolean;
  linkedAssetSlug: string | null;
  outcomeNote: string | null;
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export class ConvictionError extends Error {
  constructor(
    public readonly code:
      | "unauthenticated"
      | "invalid-request"
      | "not-found"
      | "forbidden"
      | "invalid-transition",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

function preserveExpectedError(error: unknown): boolean {
  return error instanceof ConvictionError || isDatabaseUnavailableError(error);
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new ConvictionError("unauthenticated", "Sign in to publish conviction.", 401);
  }
  return userId;
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function readStatus(row: typeof theses.$inferSelect): ThesisStatus {
  if (row.status === "resolved" || row.status === "withdrawn") return row.status;
  if (row.closesAt && row.closesAt.getTime() <= Date.now()) return "expired";
  return "open";
}

async function authorOf(database: ReturnType<typeof getDatabase>, userId: string) {
  const [row] = await database
    .select({ handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? { handle: "unknown", displayName: "Unknown" };
}

function mapThesisView(
  row: typeof theses.$inferSelect,
  author: { handle: string; displayName: string },
  circleSlug: string | null,
): ThesisView {
  const evidence = (Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []) as EvidenceRef[];
  return {
    id: row.id,
    authorHandle: author.handle,
    authorDisplayName: author.displayName,
    circleSlug,
    subjectSlug: row.subjectSlug,
    title: row.title,
    claim: row.claim,
    timeframe: row.timeframe,
    confidence: row.confidence,
    status: readStatus(row),
    thesisType: (row.thesisType === "verified-position" || row.thesisType === "agent-paper" ? row.thesisType : "paper") as ThesisType,
    evidence: evidence
      .filter((entry) => entry && typeof entry.label === "string")
      .map((entry) => ({
        kind: entry.kind === "post" ? "post" : "source",
        label: entry.label.slice(0, 160),
        url: typeof entry.url === "string" ? entry.url.slice(0, 500) : null,
        postId: typeof entry.postId === "string" ? entry.postId : null,
      })),
    positionLinked: row.positionLinked,
    linkedAssetSlug: row.linkedAssetSlug,
    outcomeNote: row.outcomeNote,
    closesAt: row.closesAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveCircleSlug(
  database: ReturnType<typeof getDatabase>,
  circleId: string | null,
): Promise<string | null> {
  if (!circleId) return null;
  const [row] = await database.select({ slug: circles.slug }).from(circles).where(eq(circles.id, circleId)).limit(1);
  return row?.slug ?? null;
}

type EvidenceInput = { kind?: unknown; label?: unknown; url?: unknown; postId?: unknown };

/**
 * Evidence must already exist inside Vicus: an active post in a bound
 * circle, or an https URL matching a bound circle's official/verification
 * source. Arbitrary URLs are rejected.
 */
async function validateEvidence(
  database: ReturnType<typeof getDatabase>,
  circleIds: string[],
  allowedSources: string[],
  input: unknown,
): Promise<EvidenceRef[]> {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 8) {
    throw new ConvictionError("invalid-request", "Attach up to 8 evidence references.", 400);
  }
  const refs: EvidenceRef[] = [];
  const sources = new Set(allowedSources.map((url) => url.trim().toLowerCase()).filter(Boolean));
  for (const raw of input as EvidenceInput[]) {
    const kind = raw?.kind === "post" ? "post" : raw?.kind === "source" ? "source" : null;
    const label = boundedText(raw?.label, 160);
    if (!kind || !label) {
      throw new ConvictionError("invalid-request", "Each evidence item needs a kind and a label.", 400);
    }
    if (kind === "post") {
      const postId = typeof raw?.postId === "string" && UUID_RE.test(raw.postId) ? raw.postId : null;
      if (!postId) throw new ConvictionError("invalid-request", "Post evidence needs a valid post reference.", 400);
      const [post] = await database
        .select({ id: circlePosts.id, circleId: circlePosts.circleId, status: circlePosts.status })
        .from(circlePosts)
        .where(eq(circlePosts.id, postId))
        .limit(1);
      if (!post || post.status !== "active" || !circleIds.includes(post.circleId)) {
        throw new ConvictionError("invalid-request", "Evidence must be an active post in a bound Circle.", 400);
      }
      refs.push({ kind, label, url: null, postId });
    } else {
      const url = typeof raw?.url === "string" ? raw.url.trim() : "";
      if (!/^https:\/\//i.test(url) || url.length > 500) {
        throw new ConvictionError("invalid-request", "Source evidence must be an https URL.", 400);
      }
      if (!sources.has(url.toLowerCase())) {
        throw new ConvictionError(
          "invalid-request",
          "Source evidence must already be attached to a bound asset in Vicus.",
          400,
        );
      }
      refs.push({ kind, label, url, postId: null });
    }
  }
  return refs;
}

export async function createThesis(
  userId: string | null | undefined,
  sessionStellarWallet: string | null | undefined,
  input: {
    circleSlug?: unknown;
    subjectSlug?: unknown;
    title?: unknown;
    claim?: unknown;
    timeframe?: unknown;
    closesAt?: unknown;
    confidence?: unknown;
    evidence?: unknown;
    linkPosition?: unknown;
    linkedAssetSlug?: unknown;
    agentName?: unknown;
  },
): Promise<ThesisView> {
  try {
    const author = requireUserId(userId);
    // No trusted agent publishing identity exists: agent labels on the user
    // path are rejected, keeping the agent-paper shape render-only.
    if (input.agentName !== undefined && input.agentName !== null) {
      throw new ConvictionError("invalid-request", "Agent publishing is not enabled for user accounts.", 400);
    }
    const database = getDatabase();
    const circleSlug = typeof input.circleSlug === "string" && input.circleSlug.trim() ? input.circleSlug.trim() : null;
    const subjectSlug = typeof input.subjectSlug === "string" && input.subjectSlug.trim() ? input.subjectSlug.trim() : null;
    if ((circleSlug ? 1 : 0) + (subjectSlug ? 1 : 0) !== 1) {
      throw new ConvictionError("invalid-request", "Bind the thesis to exactly one Circle or one subject.", 400);
    }
    let circleId: string | null = null;
    let circleIds: string[] = [];
    const allowedSources: string[] = [];
    if (circleSlug) {
      const [circle] = await database
        .select({ id: circles.id })
        .from(circles)
        .where(eq(circles.slug, circleSlug))
        .limit(1);
      if (!circle) throw new ConvictionError("not-found", "That Circle could not be found.", 404);
      circleId = circle.id;
      circleIds = [circle.id];
      const { assets } = await import("@/db/schema");
      const [asset] = await database
        .select({ officialUrl: assets.officialUrl, verificationSourceUrl: assets.verificationSourceUrl })
        .from(assets)
        .innerJoin(circles, eq(circles.assetId, assets.id))
        .where(eq(circles.id, circle.id))
        .limit(1);
      if (asset?.officialUrl) allowedSources.push(asset.officialUrl);
      if (asset?.verificationSourceUrl) allowedSources.push(asset.verificationSourceUrl);
    } else {
      const def = getSubjectDef(subjectSlug!);
      if (!def) throw new ConvictionError("not-found", "That subject could not be found.", 404);
      const { assets } = await import("@/db/schema");
      for (const assetSlug of def.representations) {
        const [row] = await database
          .select({ id: circles.id, officialUrl: assets.officialUrl, verificationSourceUrl: assets.verificationSourceUrl })
          .from(circles)
          .leftJoin(assets, eq(circles.assetId, assets.id))
          .where(eq(circles.slug, assetSlug))
          .limit(1);
        if (row) {
          circleIds.push(row.id);
          if (row.officialUrl) allowedSources.push(row.officialUrl);
          if (row.verificationSourceUrl) allowedSources.push(row.verificationSourceUrl);
        }
      }
      if (circleIds.length === 0) {
        throw new ConvictionError("invalid-request", "That subject has no resolvable representations in Vicus.", 400);
      }
    }
    const title = boundedText(input.title, 180);
    const claim = boundedText(input.claim, 2000);
    if (!title || !claim) {
      throw new ConvictionError("invalid-request", "A thesis needs a title and a claim.", 400);
    }
    const timeframe = THESIS_TIMEFRAMES.includes(input.timeframe as ThesisTimeframe)
      ? (input.timeframe as ThesisTimeframe)
      : null;
    if (!timeframe) {
      throw new ConvictionError("invalid-request", "Choose a supported timeframe.", 400);
    }
    const confidence = input.confidence;
    if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
      throw new ConvictionError("invalid-request", "Confidence must be an integer from 0 to 100.", 400);
    }
    let closesAt: Date | null = null;
    if (timeframe === "custom") {
      const parsed = typeof input.closesAt === "string" ? new Date(input.closesAt) : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now() || parsed.getTime() > Date.now() + 366 * 86400000) {
        throw new ConvictionError("invalid-request", "Custom timeframes need a future close date within a year.", 400);
      }
      closesAt = parsed;
    } else {
      closesAt = new Date(Date.now() + TIMEFRAME_DAYS[timeframe] * 86400000);
    }
    const evidence = await validateEvidence(database, circleIds, allowedSources, input.evidence);

    // Existence-only position proof through the Stellar session wallet.
    // Watch, follows, and past orders never qualify — only a live positive
    // balance for the exact linked asset. Nothing numeric is persisted.
    let positionLinked = false;
    let linkedAssetSlug: string | null = null;
    if (input.linkPosition === true) {
      const assetSlug = typeof input.linkedAssetSlug === "string" ? input.linkedAssetSlug.trim() : "";
      if (!assetSlug) {
        throw new ConvictionError("invalid-request", "Choose the asset to link.", 400);
      }
      const wallet = typeof sessionStellarWallet === "string" ? sessionStellarWallet : "";
      const { positions } = await getStellarPositions(wallet).catch(() => ({ positions: [] as never[] }));
      const held = (positions as { assetSlug: string }[]).some((position) => position.assetSlug === assetSlug);
      if (!held) {
        throw new ConvictionError(
          "invalid-request",
          "No live Stellar holding for that asset was found in the session wallet.",
          400,
        );
      }
      positionLinked = true;
      linkedAssetSlug = assetSlug;
    }

    const [row] = await database
      .insert(theses)
      .values({
        authorUserId: author,
        circleId,
        subjectSlug,
        title,
        claim,
        timeframe,
        confidence,
        status: "open",
        thesisType: positionLinked ? "verified-position" : "paper",
        evidenceRefs: evidence,
        positionLinked,
        linkedAssetSlug,
        closesAt,
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("create thesis");
    return mapThesisView(row, await authorOf(database, author), circleSlug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create thesis");
  }
}

export async function listCircleTheses(circleSlug: string, limit = 20): Promise<ThesisView[]> {
  const database = getDatabase();
  const [circle] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, circleSlug.trim())).limit(1);
  if (!circle) throw new ConvictionError("not-found", "That Circle could not be found.", 404);
  try {
    const rows = await database
      .select({ thesis: theses, handle: users.handle, displayName: users.displayName })
      .from(theses)
      .innerJoin(users, eq(theses.authorUserId, users.id))
      .where(eq(theses.circleId, circle.id))
      .orderBy(desc(theses.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));
    return rows.map((row) =>
      mapThesisView(row.thesis, { handle: row.handle, displayName: row.displayName }, circleSlug.trim()),
    );
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list theses");
  }
}

export async function listSubjectTheses(subjectSlug: string, limit = 20): Promise<ThesisView[]> {
  const def = getSubjectDef(subjectSlug.trim());
  if (!def) throw new ConvictionError("not-found", "That subject could not be found.", 404);
  try {
    const database = getDatabase();
    const rows = await database
      .select({ thesis: theses, handle: users.handle, displayName: users.displayName })
      .from(theses)
      .innerJoin(users, eq(theses.authorUserId, users.id))
      .where(eq(theses.subjectSlug, def.slug))
      .orderBy(desc(theses.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));
    return rows.map((row) => mapThesisView(row.thesis, { handle: row.handle, displayName: row.displayName }, null));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list theses");
  }
}

export async function getThesis(thesisId: string): Promise<ThesisView> {
  if (!UUID_RE.test(thesisId)) throw new ConvictionError("not-found", "That thesis could not be found.", 404);
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ thesis: theses, handle: users.handle, displayName: users.displayName })
      .from(theses)
      .innerJoin(users, eq(theses.authorUserId, users.id))
      .where(eq(theses.id, thesisId))
      .limit(1);
    if (!row) throw new ConvictionError("not-found", "That thesis could not be found.", 404);
    return mapThesisView(row.thesis, { handle: row.handle, displayName: row.displayName }, await resolveCircleSlug(database, row.thesis.circleId));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read thesis");
  }
}

async function requireAuthorOwned(
  database: ReturnType<typeof getDatabase>,
  thesisId: string,
  userId: string | null | undefined,
) {
  if (!UUID_RE.test(thesisId)) throw new ConvictionError("not-found", "That thesis could not be found.", 404);
  const owner = requireUserId(userId);
  const [row] = await database.select().from(theses).where(eq(theses.id, thesisId)).limit(1);
  if (!row || row.authorUserId !== owner) {
    throw new ConvictionError("forbidden", "Only the author can change this thesis.", 403);
  }
  // Transitions honor the deterministic read state: an open row past its
  // close date already reads as expired and accepts no more changes.
  if (row.status !== "open" || (row.closesAt && row.closesAt.getTime() <= Date.now())) {
    throw new ConvictionError("invalid-transition", "Only open theses can be changed.", 400);
  }
  return row;
}

/** Manual, evidence-backed resolution: authored conclusion, no scores. */
export async function resolveThesis(
  thesisId: string,
  userId: string | null | undefined,
  input: { outcomeNote?: unknown },
): Promise<ThesisView> {
  try {
    const database = getDatabase();
    const row = await requireAuthorOwned(database, thesisId, userId ?? null);
    if (row.status !== "open") {
      throw new ConvictionError("invalid-transition", "Only open theses can be resolved.", 400);
    }
    const outcomeNote = boundedText(input.outcomeNote, 2000);
    if (!outcomeNote) {
      throw new ConvictionError("invalid-request", "Resolution needs a short outcome note.", 400);
    }
    const [next] = await database
      .update(theses)
      .set({ status: "resolved", outcomeNote, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(theses.id, row.id))
      .returning();
    if (!next) throw toDatabaseUnavailableError("resolve thesis");
    return mapThesisView(next, await authorOf(database, next.authorUserId), await resolveCircleSlug(database, next.circleId));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("resolve thesis");
  }
}

export async function withdrawThesis(thesisId: string, userId: string | null | undefined): Promise<ThesisView> {
  try {
    const database = getDatabase();
    const row = await requireAuthorOwned(database, thesisId, userId ?? null);
    if (row.status !== "open") {
      throw new ConvictionError("invalid-transition", "Only open theses can be withdrawn.", 400);
    }
    const [next] = await database
      .update(theses)
      .set({ status: "withdrawn", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(theses.id, row.id))
      .returning();
    if (!next) throw toDatabaseUnavailableError("withdraw thesis");
    return mapThesisView(next, await authorOf(database, next.authorUserId), await resolveCircleSlug(database, next.circleId));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("withdraw thesis");
  }
}

/** Public profile counts — open/total only, never accuracy scoring. */
export async function getProfileThesisSummary(userId: string): Promise<{ open: number; total: number }> {
  if (!UUID_RE.test(userId)) return { open: 0, total: 0 };
  try {
    const database = getDatabase();
    const rows = await database
      .select({ status: theses.status, closesAt: theses.closesAt })
      .from(theses)
      .where(eq(theses.authorUserId, userId))
      .limit(200);
    const open = rows.filter(
      (row) => row.status === "open" && (!row.closesAt || row.closesAt.getTime() > Date.now()),
    ).length;
    return { open, total: rows.length };
  } catch {
    return { open: 0, total: 0 };
  }
}
