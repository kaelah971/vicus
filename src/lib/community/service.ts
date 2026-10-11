import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import {
  assets,
  circleAnswers,
  circlePostHelpful,
  circlePosts,
  circles,
  organizationMemberships,
  users,
} from "@/db/schema";
import { isHttpUrl } from "@/lib/missions/config";
import { MissionActionError } from "@/lib/missions/errors";

export const communityPostTypes = ["question", "insight", "source"] as const;
export type CommunityPostType = (typeof communityPostTypes)[number];

export type CommunityAuthor = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CommunityPost = {
  id: string;
  circleId: string;
  circleSlug: string;
  type: CommunityPostType;
  title: string;
  body: string;
  sourceUrl: string | null;
  sourceDomain: string | null;
  author: CommunityAuthor;
  helpfulCount: number;
  viewerHelpful: boolean;
  answerCount: number;
  createdAt: string;
};

export type CommunityAnswer = {
  id: string;
  postId: string;
  body: string;
  author: CommunityAuthor;
  createdAt: string;
};

function asBoundedString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function asPostType(value: unknown): CommunityPostType | null {
  return typeof value === "string" &&
    (communityPostTypes as readonly string[]).includes(value)
    ? (value as CommunityPostType)
    : null;
}

function sourceDomainFor(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function toAuthor(user: {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}): CommunityAuthor {
  return { id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl };
}

function requireSessionUser(userId: string | null | undefined, action: string): string {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new MissionActionError("unauthenticated", `Sign in to ${action}.`, 401);
  }
  return userId;
}

async function resolveCircle(circleSlug: string) {
  const normalized = circleSlug.trim().toLowerCase();
  if (!normalized) {
    throw new MissionActionError("invalid-request", "That Circle could not be found.", 404);
  }
  const database = getDatabase();
  const [circle] = await database
    .select({ id: circles.id, slug: circles.slug, organizationId: circles.organizationId })
    .from(circles)
    .where(eq(circles.slug, normalized))
    .limit(1);
  if (!circle) {
    throw new MissionActionError("invalid-request", "That Circle could not be found.", 404);
  }
  return { database, circle };
}

async function getActivePost(postId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) {
    throw new MissionActionError("invalid-request", "That post could not be found.", 404);
  }
  const database = getDatabase();
  const [row] = await database
    .select({ post: circlePosts, circle: circles, author: users })
    .from(circlePosts)
    .innerJoin(circles, eq(circlePosts.circleId, circles.id))
    .innerJoin(users, eq(circlePosts.authorUserId, users.id))
    .where(and(eq(circlePosts.id, postId), eq(circlePosts.status, "active")))
    .limit(1);
  if (!row) {
    throw new MissionActionError("invalid-request", "That post could not be found.", 404);
  }
  return { database, ...row };
}

async function withCounts(
  database: ReturnType<typeof getDatabase>,
  rows: Array<{ post: typeof circlePosts.$inferSelect; author: CommunityAuthor; circleSlug: string }>,
  viewerId: string | null,
): Promise<CommunityPost[]> {
  const postIds = rows.map((row) => row.post.id);
  const [helpfulRows, viewerRows, answerRows] = await Promise.all([
    postIds.length > 0
      ? database
          .select({ postId: circlePostHelpful.postId, value: count() })
          .from(circlePostHelpful)
          .where(inArray(circlePostHelpful.postId, postIds))
          .groupBy(circlePostHelpful.postId)
      : Promise.resolve([] as Array<{ postId: string; value: number }>),
    viewerId && postIds.length > 0
      ? database
          .select({ postId: circlePostHelpful.postId })
          .from(circlePostHelpful)
          .where(
            and(
              inArray(circlePostHelpful.postId, postIds),
              eq(circlePostHelpful.userId, viewerId),
            ),
          )
      : Promise.resolve([] as Array<{ postId: string }>),
    postIds.length > 0
      ? database
          .select({ postId: circleAnswers.postId, value: count() })
          .from(circleAnswers)
          .where(
            and(
              inArray(circleAnswers.postId, postIds),
              eq(circleAnswers.status, "active"),
            ),
          )
          .groupBy(circleAnswers.postId)
      : Promise.resolve([] as Array<{ postId: string; value: number }>),
  ]);

  const helpfulByPost = new Map(helpfulRows.map((row) => [row.postId, Number(row.value ?? 0)]));
  const viewerSet = new Set(viewerRows.map((row) => row.postId));
  const answersByPost = new Map(answerRows.map((row) => [row.postId, Number(row.value ?? 0)]));

  return rows.map(({ post, author, circleSlug }) => ({
    id: post.id,
    circleId: post.circleId,
    circleSlug,
    type: post.type as CommunityPostType,
    title: post.title,
    body: post.body,
    sourceUrl: post.sourceUrl,
    sourceDomain: sourceDomainFor(post.sourceUrl),
    author: toAuthor(author),
    helpfulCount: helpfulByPost.get(post.id) ?? 0,
    viewerHelpful: viewerSet.has(post.id),
    answerCount: answersByPost.get(post.id) ?? 0,
    createdAt: post.createdAt.toISOString(),
  }));
}

/** Authenticated users can post questions, insights, and sourced context. */
export async function createCommunityPost(
  userId: string | null | undefined,
  circleSlug: string,
  input: { type: unknown; title: unknown; body: unknown; sourceUrl: unknown },
): Promise<CommunityPost> {
  const authorId = requireSessionUser(userId, "contribute to this Circle");
  const type = asPostType(input.type);
  const title = asBoundedString(input.title, 8, 180);
  const body = asBoundedString(input.body, 20, 5_000);
  if (!type || !title || !body) {
    throw new MissionActionError(
      "invalid-request",
      "A community post needs a type, a title, and a substantive body.",
      400,
    );
  }

  let sourceUrl: string | null = null;
  if (type === "source") {
    const raw = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
    if (!raw || raw.length > 2_000 || !isHttpUrl(raw)) {
      throw new MissionActionError(
        "invalid-request",
        "Source posts require a valid http or https URL plus an explanation of why it matters.",
        400,
      );
    }
    sourceUrl = raw;
  }

  try {
    const { database, circle } = await resolveCircle(circleSlug);
    const [author] = await database
      .select({ id: users.id, handle: users.handle, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);
    if (!author) {
      throw new MissionActionError("unauthenticated", "Your Vicus session is no longer valid.", 401);
    }
    const [created] = await database
      .insert(circlePosts)
      .values({
        id: randomUUID(),
        circleId: circle.id,
        authorUserId: author.id,
        type,
        title,
        body,
        sourceUrl,
        status: "active",
      })
      .returning();
    if (!created) {
      throw toDatabaseUnavailableError("create community post");
    }
    const [post] = await withCounts(
      database,
      [{ post: created, author, circleSlug: circle.slug }],
      authorId,
    );
    if (!post) {
      throw toDatabaseUnavailableError("create community post");
    }
    return post;
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("create community post");
  }
}

export async function listCirclePosts(
  circleSlug: string,
  type: CommunityPostType | null,
  viewerId?: string | null,
  limit = 30,
): Promise<CommunityPost[]> {
  try {
    const { database, circle } = await resolveCircle(circleSlug);
    const conditions = [eq(circlePosts.circleId, circle.id), eq(circlePosts.status, "active")];
    if (type) {
      conditions.push(eq(circlePosts.type, type));
    }
    const rows = await database
      .select({ post: circlePosts, author: users })
      .from(circlePosts)
      .innerJoin(users, eq(circlePosts.authorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(circlePosts.createdAt))
      .limit(Math.min(Math.max(limit, 1), 60));
    return withCounts(
      database,
      rows.map((row) => ({ ...row, circleSlug: circle.slug })),
      viewerId && /^[0-9a-f-]{36}$/i.test(viewerId) ? viewerId : null,
    );
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("list community posts");
  }
}

export async function getCommunityPostDetail(
  circleSlug: string,
  postId: string,
  viewerId?: string | null,
): Promise<{ post: CommunityPost; answers: CommunityAnswer[] } | null> {
  try {
    const normalized = circleSlug.trim().toLowerCase();
    let active: Awaited<ReturnType<typeof getActivePost>>;
    try {
      active = await getActivePost(postId);
    } catch (error) {
      // Missing, malformed, or removed posts read as not-found.
      if (error instanceof MissionActionError && !isDatabaseUnavailableError(error)) {
        return null;
      }
      throw error;
    }
    const { database, post, circle, author } = active;
    if (circle.slug !== normalized) return null;
    const [mapped] = await withCounts(
      database,
      [{ post, author, circleSlug: circle.slug }],
      viewerId && /^[0-9a-f-]{36}$/i.test(viewerId) ? viewerId : null,
    );
    if (!mapped) return null;
    const answerRows = await database
      .select({ answer: circleAnswers, author: users })
      .from(circleAnswers)
      .innerJoin(users, eq(circleAnswers.authorUserId, users.id))
      .where(and(eq(circleAnswers.postId, post.id), eq(circleAnswers.status, "active")))
      .orderBy(asc(circleAnswers.createdAt));
    return {
      post: mapped,
      answers: answerRows.map(({ answer, author: answerAuthor }) => ({
        id: answer.id,
        postId: answer.postId,
        body: answer.body,
        author: toAuthor(answerAuthor),
        createdAt: answer.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("get community post");
  }
}

/** Answers target active questions only. One level, no nested replies. */
export async function createCommunityAnswer(
  userId: string | null | undefined,
  postId: string,
  bodyValue: unknown,
): Promise<CommunityAnswer> {
  const authorId = requireSessionUser(userId, "answer this question");
  const body = asBoundedString(bodyValue, 10, 5_000);
  if (!body) {
    throw new MissionActionError("invalid-request", "An answer needs 10 to 5,000 characters.", 400);
  }
  try {
    const { database, post } = await getActivePost(postId);
    if (post.type !== "question") {
      throw new MissionActionError("invalid-request", "Only questions can receive answers.", 400);
    }
    const [author] = await database
      .select({ id: users.id, handle: users.handle, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);
    if (!author) {
      throw new MissionActionError("unauthenticated", "Your Vicus session is no longer valid.", 401);
    }
    const [created] = await database
      .insert(circleAnswers)
      .values({ id: randomUUID(), postId: post.id, authorUserId: author.id, body, status: "active" })
      .returning();
    if (!created) {
      throw toDatabaseUnavailableError("create community answer");
    }
    return {
      id: created.id,
      postId: created.postId,
      body: created.body,
      author: toAuthor(author),
      createdAt: created.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("create community answer");
  }
}

/** Idempotent Helpful mark/unmark on active posts. */
export async function setPostHelpful(
  userId: string | null | undefined,
  postId: string,
  helpful: boolean,
): Promise<{ helpful: boolean; helpfulCount: number }> {
  const actorId = requireSessionUser(userId, "mark posts Helpful");
  try {
    const { database, post } = await getActivePost(postId);
    if (helpful) {
      await database
        .insert(circlePostHelpful)
        .values({ postId: post.id, userId: actorId })
        .onConflictDoNothing({
          target: [circlePostHelpful.postId, circlePostHelpful.userId],
        });
    } else {
      await database
        .delete(circlePostHelpful)
        .where(
          and(
            eq(circlePostHelpful.postId, post.id),
            eq(circlePostHelpful.userId, actorId),
          ),
        );
    }
    const [countRow] = await database
      .select({ value: count() })
      .from(circlePostHelpful)
      .where(eq(circlePostHelpful.postId, post.id));
    return { helpful, helpfulCount: Number(countRow?.value ?? 0) };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("mark post helpful");
  }
}

async function canModerateCircle(
  database: ReturnType<typeof getDatabase>,
  userId: string,
  circle: { id: string; organizationId: string | null },
  authorUserId: string,
): Promise<boolean> {
  if (authorUserId === userId) return true;
  const [user] = await database
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.role === "admin") return true;
  if (!circle.organizationId) return false;
  const [membership] = await database
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, circle.organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .limit(1);
  return membership?.role === "owner" || membership?.role === "admin";
}

/** Page-level helper: may this viewer remove content in this Circle? */
export async function canModerateCircleContent(
  userId: string | null | undefined,
  circleId: string,
  authorUserId: string,
): Promise<boolean> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  try {
    const database = getDatabase();
    const [circle] = await database
      .select({ id: circles.id, organizationId: circles.organizationId })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!circle) return false;
    return canModerateCircle(database, userId, circle, authorUserId);
  } catch {
    return false;
  }
}

/**
 * Removal is status-based, never destructive: the author, a global admin, or
 * an owner/admin of the Circle's host organization may remove content.
 * Removed content stays out of every public loader.
 */
export async function removeCommunityPost(
  userId: string | null | undefined,
  postId: string,
): Promise<{ removed: boolean }> {
  const actorId = requireSessionUser(userId, "moderate community content");
  if (!/^[0-9a-f-]{36}$/i.test(postId)) {
    throw new MissionActionError("invalid-request", "That post could not be found.", 404);
  }
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ post: circlePosts, circle: circles })
      .from(circlePosts)
      .innerJoin(circles, eq(circlePosts.circleId, circles.id))
      .where(eq(circlePosts.id, postId))
      .limit(1);
    if (!row || row.post.status !== "active") {
      throw new MissionActionError("invalid-request", "That post could not be found.", 404);
    }
    const allowed = await canModerateCircle(database, actorId, row.circle, row.post.authorUserId);
    if (!allowed) {
      throw new MissionActionError("forbidden", "You cannot remove this post.", 403);
    }
    await database
      .update(circlePosts)
      .set({ status: "removed", updatedAt: new Date() })
      .where(and(eq(circlePosts.id, postId), eq(circlePosts.status, "active")));
    return { removed: true };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("remove community post");
  }
}

export async function removeCommunityAnswer(
  userId: string | null | undefined,
  answerId: string,
): Promise<{ removed: boolean }> {
  const actorId = requireSessionUser(userId, "moderate community content");
  if (!/^[0-9a-f-]{36}$/i.test(answerId)) {
    throw new MissionActionError("invalid-request", "That answer could not be found.", 404);
  }
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ answer: circleAnswers, circle: circles })
      .from(circleAnswers)
      .innerJoin(circlePosts, eq(circleAnswers.postId, circlePosts.id))
      .innerJoin(circles, eq(circlePosts.circleId, circles.id))
      .where(eq(circleAnswers.id, answerId))
      .limit(1);
    if (!row || row.answer.status !== "active") {
      throw new MissionActionError("invalid-request", "That answer could not be found.", 404);
    }
    const allowed = await canModerateCircle(database, actorId, row.circle, row.answer.authorUserId);
    if (!allowed) {
      throw new MissionActionError("forbidden", "You cannot remove this answer.", 403);
    }
    await database
      .update(circleAnswers)
      .set({ status: "removed", updatedAt: new Date() })
      .where(and(eq(circleAnswers.id, answerId), eq(circleAnswers.status, "active")));
    return { removed: true };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("remove community answer");
  }
}

export type UserCommunityItem = {
  kind: "post" | "answer";
  id: string;
  postId: string;
  circleSlug: string;
  type: CommunityPostType | null;
  title: string;
  body: string;
  createdAt: string;
};

/** Active community contributions by handle for public profiles. */
export async function getUserCommunityContributions(handle: string): Promise<UserCommunityItem[]> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized || normalized.length > 80) return [];
  try {
    const database = getDatabase();
    const [user] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, normalized))
      .limit(1);
    if (!user) return [];
    const [postRows, answerRows] = await Promise.all([
      database
        .select({ post: circlePosts, circle: circles })
        .from(circlePosts)
        .innerJoin(circles, eq(circlePosts.circleId, circles.id))
        .where(and(eq(circlePosts.authorUserId, user.id), eq(circlePosts.status, "active")))
        .orderBy(desc(circlePosts.createdAt))
        .limit(20),
      database
        .select({ answer: circleAnswers, post: circlePosts, circle: circles })
        .from(circleAnswers)
        .innerJoin(circlePosts, eq(circleAnswers.postId, circlePosts.id))
        .innerJoin(circles, eq(circlePosts.circleId, circles.id))
        .where(and(eq(circleAnswers.authorUserId, user.id), eq(circleAnswers.status, "active")))
        .orderBy(desc(circleAnswers.createdAt))
        .limit(20),
    ]);
    return [
      ...postRows.map(({ post, circle }) => ({
        kind: "post" as const,
        id: post.id,
        postId: post.id,
        circleSlug: circle.slug,
        type: post.type as CommunityPostType,
        title: post.title,
        body: post.body,
        createdAt: post.createdAt.toISOString(),
      })),
      ...answerRows.map(({ answer, post, circle }) => ({
        kind: "answer" as const,
        id: answer.id,
        postId: post.id,
        circleSlug: circle.slug,
        type: null,
        title: post.title,
        body: answer.body,
        createdAt: answer.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    throw toDatabaseUnavailableError("get user community contributions");
  }
}

export type EcosystemCommunityItem = {
  id: string;
  postId: string;
  circleSlug: string;
  circleName: string;
  kind: "post" | "answer";
  type: CommunityPostType | null;
  title: string;
  authorHandle: string;
  createdAt: string;
};

/** Recent active community items scoped to one ecosystem. No feed algorithm. */
export async function getEcosystemCommunityActivity(
  ecosystemValue: string,
  limit = 4,
): Promise<EcosystemCommunityItem[]> {
  const normalized = ecosystemValue.trim().toLowerCase();
  if (!normalized) return [];
  try {
    const database = getDatabase();
    const [postRows, answerRows] = await Promise.all([
      database
        .select({
          post: circlePosts,
          circle: circles,
          author: users,
          ecosystem: assets.ecosystem,
        })
        .from(circlePosts)
        .innerJoin(circles, eq(circlePosts.circleId, circles.id))
        .innerJoin(users, eq(circlePosts.authorUserId, users.id))
        .leftJoin(assets, eq(circles.assetId, assets.id))
        .where(eq(circlePosts.status, "active"))
        .orderBy(desc(circlePosts.createdAt))
        .limit(60),
      database
        .select({
          answer: circleAnswers,
          post: circlePosts,
          circle: circles,
          author: users,
          ecosystem: assets.ecosystem,
        })
        .from(circleAnswers)
        .innerJoin(circlePosts, eq(circleAnswers.postId, circlePosts.id))
        .innerJoin(circles, eq(circlePosts.circleId, circles.id))
        .innerJoin(users, eq(circleAnswers.authorUserId, users.id))
        .leftJoin(assets, eq(circles.assetId, assets.id))
        .where(eq(circleAnswers.status, "active"))
        .orderBy(desc(circleAnswers.createdAt))
        .limit(60),
    ]);
    return [
      ...postRows
        .filter((row) => (row.ecosystem ?? "stellar") === normalized)
        .map(({ post, circle, author }) => ({
          id: post.id,
          postId: post.id,
          circleSlug: circle.slug,
          circleName: circle.name,
          kind: "post" as const,
          type: post.type as CommunityPostType,
          title: post.title,
          authorHandle: author.handle,
          createdAt: post.createdAt.toISOString(),
        })),
      ...answerRows
        .filter((row) => (row.ecosystem ?? "stellar") === normalized)
        .map(({ answer, post, circle, author }) => ({
          id: answer.id,
          postId: post.id,
          circleSlug: circle.slug,
          circleName: circle.name,
          kind: "answer" as const,
          type: null,
          title: post.title,
          authorHandle: author.handle,
          createdAt: answer.createdAt.toISOString(),
        })),
    ]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, Math.min(Math.max(limit, 1), 8));
  } catch {
    throw toDatabaseUnavailableError("get ecosystem community activity");
  }
}
