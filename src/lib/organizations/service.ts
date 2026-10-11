import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  assets,
  circleMemberships,
  circles,
  lessons,
  missionSubmissions,
  missions,
  organizationMemberships,
  organizations,
  users,
} from "@/db/schema";
import { mapCircle } from "@/lib/data/circles";
import {
  getSubmissionStatesForUser,
  mapMissionIndexRecord,
} from "@/lib/data/missions";
import { getCircleParticipation } from "@/lib/data/roles";
import { isHttpUrl } from "@/lib/missions/config";
import { MissionActionError } from "@/lib/missions/errors";
import {
  applyMissionStatus,
  applyReviewDecision,
  createMission,
  type MissionCreateInput,
  type ReviewAction,
} from "@/lib/missions/service";
import type { CircleRecord, MissionRecord } from "@/lib/data/types";

export const orgRoles = ["owner", "admin", "editor"] as const;
export type OrgRole = (typeof orgRoles)[number];

export type OrgSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  websiteUrl: string | null;
  ecosystemFocus: string | null;
  role: OrgRole | "global-admin" | null;
};

export type OrgLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  status: string;
  sources: Array<{ label: string; url: string }>;
  readingMinutes: number;
  circleId: string | null;
  circle: { name: string; slug: string } | null;
};

export type OrgDetail = OrgSummary & {
  circles: CircleRecord[];
  lessons: OrgLesson[];
  missions: Array<MissionRecord & { circle: { name: string; slug: string } }>;
  metrics: { watchers: number; contributions: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asBoundedString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function asSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  if (!slug || slug.length > 140 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

function asRole(value: unknown): OrgRole | null {
  return typeof value === "string" && (orgRoles as readonly string[]).includes(value)
    ? (value as OrgRole)
    : null;
}

function readingMinutesFor(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function mapLesson(
  lesson: typeof lessons.$inferSelect,
  circle: { name: string; slug: string } | null,
): OrgLesson {
  const sources = Array.isArray(lesson.sources) ? lesson.sources : [];
  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    summary: lesson.summary,
    body: lesson.body,
    status: lesson.status,
    sources: sources.filter(
      (source): source is { label: string; url: string } =>
        isRecord(source) && typeof source.label === "string" && typeof source.url === "string",
    ),
    readingMinutes: readingMinutesFor(lesson.body),
    circleId: lesson.circleId,
    circle,
  };
}

export async function isGlobalAdmin(userId: string): Promise<boolean> {
  const database = getDatabase();
  const [row] = await database
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role === "admin";
}

export async function getUserRoleInOrg(userId: string, orgId: string): Promise<OrgRole | null> {
  const database = getDatabase();
  const [row] = await database
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .limit(1);
  return asRole(row?.role) ?? null;
}

/** Server-side org authorization. Global Vicus admins bypass membership. */
export async function requireOrgRoles(
  userId: string | null | undefined,
  orgId: string,
  allowed: readonly OrgRole[],
): Promise<{ orgId: string; role: OrgRole | "global-admin" }> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new MissionActionError(
      "unauthenticated",
      "Sign in to manage this organization.",
      401,
    );
  }
  try {
    if (await isGlobalAdmin(userId)) {
      return { orgId, role: "global-admin" };
    }
    const role = await getUserRoleInOrg(userId, orgId);
    if (!role || !allowed.includes(role)) {
      throw new MissionActionError(
        "forbidden",
        "This wallet is not authorized for this organization.",
        403,
      );
    }
    return { orgId, role };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("authorize organization action");
  }
}

async function getOrgIdBySlug(slug: string): Promise<string | null> {
  const normalized = asSlug(slug);
  if (!normalized) return null;
  const database = getDatabase();
  const [row] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, normalized))
    .limit(1);
  return row?.id ?? null;
}

export async function getOrgIdBySlugOrThrow(slug: string): Promise<string> {
  const orgId = await getOrgIdBySlug(slug);
  if (!orgId) {
    throw new MissionActionError("invalid-request", "That organization could not be found.", 404);
  }
  return orgId;
}

export async function createOrganization(
  input: { name: unknown; slug: unknown; description: unknown; websiteUrl: unknown; ecosystemFocus: unknown },
): Promise<OrgSummary> {
  const name = asBoundedString(input.name, 2, 180);
  const slug = asSlug(input.slug);
  const description = asBoundedString(input.description, 20, 2_000);
  if (!name || !slug || !description) {
    throw new MissionActionError(
      "invalid-request",
      "An organization needs a name, a valid slug, and a description.",
      400,
    );
  }
  const websiteUrl =
    typeof input.websiteUrl === "string" && input.websiteUrl.trim()
      ? input.websiteUrl.trim()
      : null;
  if (websiteUrl && (!isHttpUrl(websiteUrl) || websiteUrl.length > 500)) {
    throw new MissionActionError("invalid-request", "Use a valid http or https website URL.", 400);
  }
  const ecosystemFocus =
    typeof input.ecosystemFocus === "string" && input.ecosystemFocus.trim()
      ? input.ecosystemFocus.trim().toLowerCase()
      : null;
  if (ecosystemFocus && (ecosystemFocus.length > 32 || !/^[a-z0-9-]+$/.test(ecosystemFocus))) {
    throw new MissionActionError("invalid-request", "The ecosystem focus is invalid.", 400);
  }

  try {
    const database = getDatabase();
    const [created] = await database
      .insert(organizations)
      .values({
        id: randomUUID(),
        name,
        slug,
        description,
        websiteUrl,
        ecosystemFocus,
      })
      .onConflictDoNothing({ target: organizations.slug })
      .returning({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        description: organizations.description,
        websiteUrl: organizations.websiteUrl,
        ecosystemFocus: organizations.ecosystemFocus,
      });
    if (!created) {
      throw new MissionActionError("invalid-request", "An organization with this slug already exists.", 409);
    }
    return { ...created, role: null };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("create organization");
  }
}

export async function addOrganizationMember(
  orgId: string,
  targetUserId: unknown,
  roleValue: unknown,
  actorId: string,
): Promise<{ organizationId: string; userId: string; role: OrgRole }> {
  await requireOrgRoles(actorId, orgId, ["owner", "admin"]);
  const role = asRole(roleValue);
  if (!role) {
    throw new MissionActionError("invalid-request", "Role must be owner, admin, or editor.", 400);
  }
  if (typeof targetUserId !== "string" || !/^[0-9a-f-]{36}$/i.test(targetUserId)) {
    throw new MissionActionError("invalid-request", "Choose a valid member.", 400);
  }
  try {
    const database = getDatabase();
    const [target] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!target) {
      throw new MissionActionError("invalid-request", "That member could not be found.", 404);
    }
    const [member] = await database
      .insert(organizationMemberships)
      .values({ id: randomUUID(), organizationId: orgId, userId: target.id, role })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: { role, updatedAt: new Date() },
      })
      .returning({
        organizationId: organizationMemberships.organizationId,
        userId: organizationMemberships.userId,
        role: organizationMemberships.role,
      });
    if (!member || !asRole(member.role)) {
      throw toDatabaseUnavailableError("add organization member");
    }
    return { organizationId: member.organizationId, userId: member.userId, role: member.role as OrgRole };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("add organization member");
  }
}

/**
 * Circle↔org association. Global admins may assign any circle; org
 * owner/admin may only claim a currently unhosted circle, so no one can
 * take over another organization's hosted community.
 */
export async function setCircleOrganization(
  orgId: string,
  circleId: unknown,
  actorId: string,
): Promise<{ circleId: string; organizationId: string }> {
  if (typeof circleId !== "string" || !/^[0-9a-f-]{36}$/i.test(circleId)) {
    throw new MissionActionError("invalid-request", "Choose a valid Circle.", 400);
  }
  try {
    const database = getDatabase();
    const [circle] = await database
      .select({ id: circles.id, organizationId: circles.organizationId })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!circle) {
      throw new MissionActionError("mission-not-found", "That Circle could not be found.", 404);
    }
    if (await isGlobalAdmin(actorId)) {
      // Global admins may assign or reassign freely.
    } else {
      await requireOrgRoles(actorId, orgId, ["owner", "admin"]);
      if (circle.organizationId && circle.organizationId !== orgId) {
        throw new MissionActionError(
          "forbidden",
          "This Circle is already hosted by another organization.",
          403,
        );
      }
    }
    await database
      .update(circles)
      .set({ organizationId: orgId, updatedAt: new Date() })
      .where(eq(circles.id, circle.id));
    return { circleId: circle.id, organizationId: orgId };
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("set circle organization");
  }
}

function parseLessonSources(value: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) {
    throw new MissionActionError("invalid-request", "Add at least one official source.", 400);
  }
  if (value.length < 1 || value.length > 8) {
    throw new MissionActionError("invalid-request", "Add between 1 and 8 sources.", 400);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new MissionActionError("invalid-request", `Source ${index + 1} is invalid.`, 400);
    }
    const label = asBoundedString(entry.label, 2, 120);
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!label || !url || url.length > 500 || !isHttpUrl(url)) {
      throw new MissionActionError(
        "invalid-request",
        `Source ${index + 1} needs a label and a valid http or https URL.`,
        400,
      );
    }
    return { label, url };
  });
}

export type LessonInput = {
  title: unknown;
  slug: unknown;
  summary: unknown;
  body: unknown;
  circleId: unknown;
  status: unknown;
  sources: unknown;
};

async function resolveLessonCircle(orgId: string, circleId: unknown) {
  if (circleId === null || circleId === undefined || circleId === "") return null;
  if (typeof circleId !== "string" || !/^[0-9a-f-]{36}$/i.test(circleId)) {
    throw new MissionActionError("invalid-request", "Choose a valid hosted Circle.", 400);
  }
  const database = getDatabase();
  const [circle] = await database
    .select({ id: circles.id, organizationId: circles.organizationId })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);
  if (!circle) {
    throw new MissionActionError("mission-not-found", "That Circle could not be found.", 404);
  }
  if (circle.organizationId !== orgId) {
    throw new MissionActionError(
      "invalid-request",
      "Lessons can only attach to Circles hosted by this organization.",
      400,
    );
  }
  return circle.id;
}

export async function createLesson(orgId: string, input: LessonInput, actorId: string) {
  await requireOrgRoles(actorId, orgId, ["owner", "admin", "editor"]);
  const title = asBoundedString(input.title, 8, 180);
  const slug = asSlug(input.slug);
  const summary = asBoundedString(input.summary, 20, 500);
  const body = asBoundedString(input.body, 200, 20_000);
  if (!title || !slug || !summary || !body) {
    throw new MissionActionError(
      "invalid-request",
      "A lesson needs a title, slug, summary, and substantive body.",
      400,
    );
  }
  if (input.status !== "draft" && input.status !== "published") {
    throw new MissionActionError("invalid-request", "Lesson status must be draft or published.", 400);
  }
  const sources = parseLessonSources(input.sources);
  const circleDbId = await resolveLessonCircle(orgId, input.circleId);

  try {
    const database = getDatabase();
    const [created] = await database
      .insert(lessons)
      .values({
        id: randomUUID(),
        organizationId: orgId,
        circleId: circleDbId,
        title,
        slug,
        summary,
        body,
        status: input.status,
        sources,
      })
      .onConflictDoNothing({ target: lessons.slug })
      .returning();
    if (!created) {
      throw new MissionActionError("invalid-request", "A lesson with this slug already exists.", 409);
    }
    return mapLesson(created, null);
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("create lesson");
  }
}

export async function updateLesson(
  orgId: string,
  lessonId: string,
  input: LessonInput,
  actorId: string,
) {
  await requireOrgRoles(actorId, orgId, ["owner", "admin", "editor"]);
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) {
    throw new MissionActionError("invalid-request", "That lesson could not be found.", 404);
  }
  const title = asBoundedString(input.title, 8, 180);
  const summary = asBoundedString(input.summary, 20, 500);
  const body = asBoundedString(input.body, 200, 20_000);
  if (!title || !summary || !body) {
    throw new MissionActionError(
      "invalid-request",
      "A lesson needs a title, summary, and substantive body.",
      400,
    );
  }
  if (input.status !== "draft" && input.status !== "published") {
    throw new MissionActionError("invalid-request", "Lesson status must be draft or published.", 400);
  }
  const sources = parseLessonSources(input.sources);
  const circleDbId = await resolveLessonCircle(orgId, input.circleId);

  try {
    const database = getDatabase();
    const [updated] = await database
      .update(lessons)
      .set({ title, summary, body, circleId: circleDbId, status: input.status, sources, updatedAt: new Date() })
      .where(and(eq(lessons.id, lessonId), eq(lessons.organizationId, orgId)))
      .returning();
    if (!updated) {
      throw new MissionActionError(
        "invalid-request",
        "That lesson could not be found in this organization.",
        404,
      );
    }
    return mapLesson(updated, null);
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("update lesson");
  }
}

/** Org mission creation reuses the existing mission pipeline end to end. */
export async function createOrgMission(
  orgId: string,
  input: MissionCreateInput,
  actorId: string,
) {
  await requireOrgRoles(actorId, orgId, ["owner", "admin", "editor"]);
  const circleId = typeof input.circleId === "string" ? input.circleId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(circleId)) {
    throw new MissionActionError("invalid-request", "Choose a hosted Circle for this mission.", 400);
  }
  try {
    const database = getDatabase();
    const [circle] = await database
      .select({ id: circles.id, organizationId: circles.organizationId })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!circle || circle.organizationId !== orgId) {
      throw new MissionActionError(
        "forbidden",
        "Missions can only be created for Circles hosted by this organization.",
        403,
      );
    }
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("authorize organization mission");
  }
  return createMission({ ...input, organizationId: orgId }, actorId);
}

/** Org review reuses grading/points logic; only the authorization differs. */
export async function reviewOrgSubmission(
  orgId: string,
  submissionId: string,
  action: ReviewAction,
  reasonValue: unknown,
  reviewerId?: string | null,
) {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
    throw new MissionActionError("submission-not-found", "That submission could not be found.", 404);
  }
  if (!reviewerId) {
    throw new MissionActionError("unauthenticated", "Sign in to review submissions.", 401);
  }
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ submission: missionSubmissions, mission: missions })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .where(eq(missionSubmissions.id, submissionId))
      .limit(1);
    if (!row) {
      throw new MissionActionError("submission-not-found", "That submission could not be found.", 404);
    }
    if (row.mission.organizationId !== orgId) {
      throw new MissionActionError(
        "forbidden",
        "This submission belongs to another organization's mission.",
        403,
      );
    }
    await requireOrgRoles(reviewerId, orgId, ["owner", "admin"]);
    const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
    if (action !== "approved" && (!reason || reason.length > 1_000)) {
      throw new MissionActionError(
        "invalid-request",
        "Add a review reason of 1,000 characters or fewer.",
        400,
      );
    }
    return applyReviewDecision(database, row, row.submission.id, action, action === "approved" ? null : reason, reviewerId);
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("review organization submission");
  }
}

/** Org lifecycle control reuses the persisted Draft/Open transition. */
export async function setOrgMissionStatus(
  orgId: string,
  missionId: string,
  status: unknown,
  actorId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
    throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
  }
  if (status !== "draft" && status !== "open") {
    throw new MissionActionError("invalid-request", "Campaign status must be draft or open.", 400);
  }
  try {
    const database = getDatabase();
    const [mission] = await database
      .select({ id: missions.id, organizationId: missions.organizationId })
      .from(missions)
      .where(eq(missions.id, missionId))
      .limit(1);
    if (!mission) {
      throw new MissionActionError("mission-not-found", "That mission could not be found.", 404);
    }
    if (mission.organizationId !== orgId) {
      throw new MissionActionError(
        "forbidden",
        "This mission belongs to another organization.",
        403,
      );
    }
    await requireOrgRoles(actorId, orgId, ["owner", "admin"]);
    return applyMissionStatus(missionId, status);
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("update organization mission status");
  }
}

export async function listOrgMembers(orgId: string, actorId: string) {
  await requireOrgRoles(actorId, orgId, ["owner", "admin"]);
  try {
    const database = getDatabase();
    const rows = await database
      .select({
        userId: organizationMemberships.userId,
        role: organizationMemberships.role,
        handle: users.handle,
        displayName: users.displayName,
      })
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .where(eq(organizationMemberships.organizationId, orgId))
      .orderBy(asc(users.handle));
    return rows.map((row) => ({ userId: row.userId, role: asRole(row.role) ?? "editor", handle: row.handle, displayName: row.displayName }));
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("list organization members");
  }
}

export async function listOrgLessons(orgId: string, actorId: string): Promise<OrgLesson[]> {
  await requireOrgRoles(actorId, orgId, ["owner", "admin", "editor"]);
  try {
    const database = getDatabase();
    const rows = await database
      .select({ lesson: lessons, circle: circles })
      .from(lessons)
      .leftJoin(circles, eq(lessons.circleId, circles.id))
      .where(eq(lessons.organizationId, orgId))
      .orderBy(asc(lessons.createdAt));
    return rows.map(({ lesson, circle }) =>
      mapLesson(lesson, circle ? { name: circle.name, slug: circle.slug } : null),
    );
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("list organization lessons");
  }
}

export async function listOrgMissions(orgId: string, actorId: string) {
  await requireOrgRoles(actorId, orgId, ["owner", "admin", "editor"]);
  try {
    const database = getDatabase();
    const rows = await database
      .select({ mission: missions, circle: circles })
      .from(missions)
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .where(eq(missions.organizationId, orgId))
      .orderBy(asc(missions.createdAt));
    return rows.map(({ mission, circle }) => ({
      id: mission.id,
      title: mission.title,
      type: mission.type,
      status: mission.status,
      points: mission.points,
      rewardAsset: mission.rewardAsset,
      rewardAmount: mission.rewardAmount ? String(mission.rewardAmount) : null,
      circleName: circle.name,
      circleSlug: circle.slug,
    }));
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("list organization missions");
  }
}

export async function getOrgReviewQueue(orgId: string, actorId: string) {
  await requireOrgRoles(actorId, orgId, ["owner", "admin"]);
  try {
    const database = getDatabase();
    const orgMissions = await database
      .select({ id: missions.id })
      .from(missions)
      .where(eq(missions.organizationId, orgId));
    const missionIds = orgMissions.map((mission) => mission.id);
    if (missionIds.length === 0) return [];
    const rows = await database
      .select({ submission: missionSubmissions, mission: missions, circle: circles, participant: users })
      .from(missionSubmissions)
      .innerJoin(missions, eq(missionSubmissions.missionId, missions.id))
      .innerJoin(circles, eq(missions.circleId, circles.id))
      .innerJoin(users, eq(missionSubmissions.userId, users.id))
      .where(
        and(
          inArray(missionSubmissions.missionId, missionIds),
          eq(missionSubmissions.status, "pending"),
        ),
      )
      .orderBy(desc(missionSubmissions.submittedAt));
    return rows.map(({ submission, mission, circle, participant }) => ({
      id: submission.id,
      missionId: mission.id,
      missionTitle: mission.title,
      missionType: mission.type,
      missionPoints: mission.points,
      missionRewardAsset: mission.rewardAsset,
      missionRewardAmount: mission.rewardAmount ? String(mission.rewardAmount) : null,
      circleName: circle.name,
      circleSlug: circle.slug,
      participantHandle: participant.handle,
      participantName: participant.displayName,
      content: submission.content,
      evidenceUrl: submission.evidenceUrl,
      score: submission.score,
      status: submission.status as "pending",
      revisionReason: submission.revisionReason,
      submittedAt: submission.submittedAt.toISOString(),
    }));
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("get organization review queue");
  }
}

export async function listOrganizationsForActor(
  actorId: string | null | undefined,
): Promise<OrgSummary[]> {
  try {
    const database = getDatabase();
    if (actorId && /^[0-9a-f-]{36}$/i.test(actorId) && (await isGlobalAdmin(actorId))) {
      const rows = await database
        .select()
        .from(organizations)
        .orderBy(asc(organizations.name));
      return rows.map((org) => ({
        id: org.id,
        slug: org.slug,
        name: org.name,
        description: org.description,
        websiteUrl: org.websiteUrl,
        ecosystemFocus: org.ecosystemFocus,
        role: "global-admin" as const,
      }));
    }
    if (!actorId) return [];
    const rows = await database
      .select({ org: organizations, role: organizationMemberships.role })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(eq(organizationMemberships.userId, actorId))
      .orderBy(asc(organizations.name));
    return rows.map(({ org, role }) => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      description: org.description,
      websiteUrl: org.websiteUrl,
      ecosystemFocus: org.ecosystemFocus,
      role: asRole(role),
    }));
  } catch {
    throw toDatabaseUnavailableError("list organizations");
  }
}

export async function getOrganizationBySlug(
  slug: string,
  userId?: string | null,
): Promise<OrgDetail | null> {
  const normalized = asSlug(slug);
  if (!normalized) return null;
  try {
    const database = getDatabase();
    const [org] = await database
      .select()
      .from(organizations)
      .where(eq(organizations.slug, normalized))
      .limit(1);
    if (!org) return null;

    let role: OrgRole | "global-admin" | null = null;
    if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
      role = (await isGlobalAdmin(userId)) ? "global-admin" : await getUserRoleInOrg(userId, org.id);
    }

    const [circleRows, lessonRows, watchedRows] = await Promise.all([
      database
        .select({ circle: circles, asset: assets })
        .from(circles)
        .leftJoin(assets, eq(circles.assetId, assets.id))
        .where(eq(circles.organizationId, org.id))
        .orderBy(asc(circles.featuredRank), asc(circles.name)),
      database
        .select({ lesson: lessons, circle: circles })
        .from(lessons)
        .leftJoin(circles, eq(lessons.circleId, circles.id))
        .where(and(eq(lessons.organizationId, org.id), eq(lessons.status, "published")))
        .orderBy(asc(lessons.createdAt)),
      userId
        ? database
            .select({ circleId: circleMemberships.circleId })
            .from(circleMemberships)
            .where(and(eq(circleMemberships.userId, userId), isNull(circleMemberships.leftAt)))
        : Promise.resolve([]),
    ]);

    const watched = new Set(watchedRows.map((row) => row.circleId));
    const hosted = circleRows.map((row) => ({
      ...mapCircle({ circle: row.circle, asset: row.asset }),
      watched: watched.has(row.circle.id),
    }));
    const hostedIds = hosted.map((circle) => circle.id);

    const missionRows =
      hostedIds.length > 0
        ? await database
            .select({ mission: missions, circle: circles })
            .from(missions)
            .innerJoin(circles, eq(missions.circleId, circles.id))
            .where(and(inArray(missions.circleId, hostedIds), eq(missions.status, "open")))
            .orderBy(asc(missions.createdAt))
        : [];
    const states = await getSubmissionStatesForUser(
      missionRows.map(({ mission }) => mission.id),
      userId,
    );
    const openMissions = missionRows.map(({ mission, circle }) =>
      mapMissionIndexRecord(mission, circle, states.get(mission.id) ?? null),
    );

    let watchers = 0;
    let contributions = 0;
    for (const circle of hosted) {
      try {
        const participation = await getCircleParticipation(circle.id);
        watchers += Number(participation.watcherCount ?? 0);
        contributions += Number(participation.approvedContributionCount ?? 0);
      } catch {
        // Derived metrics stay best-effort; the page still renders.
      }
    }

    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      description: org.description,
      websiteUrl: org.websiteUrl,
      ecosystemFocus: org.ecosystemFocus,
      role,
      circles: hosted,
      lessons: lessonRows.map(({ lesson, circle }) =>
        mapLesson(lesson, circle ? { name: circle.name, slug: circle.slug } : null),
      ),
      missions: openMissions,
      metrics: { watchers, contributions },
    };
  } catch {
    throw toDatabaseUnavailableError("get organization");
  }
}

export async function getLessonBySlug(
  slug: string,
  userId?: string | null,
): Promise<(OrgLesson & { organization: { name: string; slug: string } }) | null> {
  const normalized = asSlug(slug);
  if (!normalized) return null;
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ lesson: lessons, org: organizations, circle: circles })
      .from(lessons)
      .innerJoin(organizations, eq(lessons.organizationId, organizations.id))
      .leftJoin(circles, eq(lessons.circleId, circles.id))
      .where(eq(lessons.slug, normalized))
      .limit(1);
    if (!row) return null;

    // Participant boundary: drafts are org/admin work-in-progress.
    if (row.lesson.status !== "published") {
      let authorized = false;
      if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
        authorized =
          (await isGlobalAdmin(userId)) ||
          (await getUserRoleInOrg(userId, row.lesson.organizationId)) !== null;
      }
      if (!authorized) return null;
    }

    return {
      ...mapLesson(row.lesson, row.circle ? { name: row.circle.name, slug: row.circle.slug } : null),
      organization: { name: row.org.name, slug: row.org.slug },
    };
  } catch {
    throw toDatabaseUnavailableError("get lesson");
  }
}

export async function getCircleOrganization(
  circleId: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(circleId)) return null;
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ org: organizations })
      .from(circles)
      .innerJoin(organizations, eq(circles.organizationId, organizations.id))
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!row) return null;
    return { id: row.org.id, name: row.org.name, slug: row.org.slug };
  } catch {
    throw toDatabaseUnavailableError("get circle organization");
  }
}
