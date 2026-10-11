import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  circles,
  lessons,
  missionSubmissions,
  missions,
  organizationMemberships,
  organizations,
  rewardClaims,
  users,
} from "../src/db/schema";
import { getCircleBySlug } from "../src/lib/data/circles";
import { listMissions } from "../src/lib/data/missions";
import { MissionActionError } from "../src/lib/missions/errors";
import { submitMission } from "../src/lib/missions/service";
import {
  addOrganizationMember,
  createLesson,
  createOrganization,
  createOrgMission,
  getLessonBySlug,
  getOrganizationBySlug,
  listOrganizationsForActor,
  reviewOrgSubmission,
  setCircleOrganization,
  setOrgMissionStatus,
  updateLesson,
} from "../src/lib/organizations/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const createdMissionIds: string[] = [];
const createdLessonIds: string[] = [];
const createdOrgIds: string[] = [];
// Circles temporarily re-hosted during checks are restored here, because
// deleting a throwaway test org would otherwise cascade set-null onto them.
const restoreCircleHosting: Array<{ circleId: string; orgId: string }> = [];

async function createUser(handle: string, role: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({
    id,
    handle,
    displayName: `${handle} member`,
    avatarUrl: null,
    role,
  });
  return id;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof MissionActionError, "Expected a MissionActionError.");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`Expected error code ${code}.`);
}

async function cleanup() {
  if (createdMissionIds.length > 0) {
    await database
      .delete(missionSubmissions)
      .where(inArray(missionSubmissions.missionId, createdMissionIds));
    await database.delete(missions).where(inArray(missions.id, createdMissionIds));
  }
  if (createdLessonIds.length > 0) {
    await database.delete(lessons).where(inArray(lessons.id, createdLessonIds));
  }
  if (createdOrgIds.length > 0) {
    await database
      .delete(organizationMemberships)
      .where(inArray(organizationMemberships.organizationId, createdOrgIds));
    await database.delete(organizations).where(inArray(organizations.id, createdOrgIds));
  }
  for (const restore of restoreCircleHosting) {
    await database
      .update(circles)
      .set({ organizationId: restore.orgId, updatedAt: new Date() })
      .where(eq(circles.id, restore.circleId));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

const LESSON_BODY = [
  "Alpha paragraph one with enough words to pass validation easily and stay truthful about the test organization.",
  "Alpha paragraph two continues the lesson with source-backed neutral statements and no fabricated market claims at all.",
  "Alpha paragraph three closes with disclosure language and a reminder that education is not financial advice.",
].join("\n\n");

const SOURCES = [{ label: "Circle USDC docs", url: "https://www.circle.com/usdc" }];

async function verify() {
  const tag = randomUUID().slice(0, 6);
  const globalAdminId = await createUser(`org-verify-gadmin-${tag}`, "admin");
  const ownerId = await createUser(`org-verify-owner-${tag}`, "member");
  const editorId = await createUser(`org-verify-editor-${tag}`, "member");
  const outsiderId = await createUser(`org-verify-outsider-${tag}`, "member");
  const participantId = await createUser(`org-verify-participant-${tag}`, "member");

  // Org creation + readback.
  const org = await createOrganization({
    name: `Verify Org ${tag}`,
    slug: `verify-org-${tag}`,
    description: "A verification organization with enough description length to pass validation.",
    websiteUrl: "https://example.com/org",
    ecosystemFocus: "base",
  });
  createdOrgIds.push(org.id);
  const other = await createOrganization({
    name: `Other Org ${tag}`,
    slug: `other-org-${tag}`,
    description: "A second verification organization used for cross-org isolation checks here.",
    websiteUrl: null,
    ecosystemFocus: null,
  });
  createdOrgIds.push(other.id);
  await expectCode(
    createOrganization({
      name: `Verify Org ${tag}`,
      slug: `verify-org-${tag}`,
      description: "A duplicate slug attempt with enough description length to be validated.",
      websiteUrl: null,
      ecosystemFocus: null,
    }),
    "invalid-request",
  );

  // Membership authorization: owner manages, editor cannot, outsider cannot.
  await database.insert(organizationMemberships).values({
    organizationId: org.id,
    userId: ownerId,
    role: "owner",
  });
  await addOrganizationMember(org.id, editorId, "editor", ownerId);
  await expectCode(addOrganizationMember(org.id, outsiderId, "editor", editorId), "forbidden");
  await expectCode(addOrganizationMember(org.id, outsiderId, "editor", outsiderId), "forbidden");
  await expectCode(addOrganizationMember(org.id, editorId, "superadmin", ownerId), "invalid-request");

  const ownerOrgs = await listOrganizationsForActor(ownerId);
  assert(ownerOrgs.some((entry) => entry.id === org.id && entry.role === "owner"));
  const outsiderOrgs = await listOrganizationsForActor(outsiderId);
  assert(!outsiderOrgs.some((entry) => entry.id === org.id));
  const adminOrgs = await listOrganizationsForActor(globalAdminId);
  assert(adminOrgs.some((entry) => entry.id === org.id && entry.role === "global-admin"));

  // Hosted Circle association: seed data check + claim rules.
  const [baseCircle] = await database
    .select({ id: circles.id, organizationId: circles.organizationId })
    .from(circles)
    .where(eq(circles.slug, "usdc-on-base"))
    .limit(1);
  assert(baseCircle, "The Base circle is required.");
  const circleOrgId = baseCircle.organizationId;
  assert(circleOrgId, "The Base circle must be hosted after org seeding.");
  restoreCircleHosting.push({ circleId: baseCircle.id, orgId: circleOrgId });

  // Claim an unhosted circle requires a circle without org; use a temp claim
  // flow on the org's own mission circle instead: editor cannot associate.
  await expectCode(setCircleOrganization(org.id, baseCircle.id, editorId), "forbidden");
  // Another org's owner cannot steal a hosted circle.
  const otherOwnerId = await createUser(`org-verify-otherowner-${tag}`, "member");
  await database.insert(organizationMemberships).values({
    organizationId: other.id,
    userId: otherOwnerId,
    role: "owner",
  });
  await expectCode(setCircleOrganization(other.id, baseCircle.id, otherOwnerId), "forbidden");
  // Global admin may assign freely.
  const reassigned = await setCircleOrganization(org.id, baseCircle.id, globalAdminId);
  assert.equal(reassigned.organizationId, org.id);

  // Lessons: editor creates draft; draft hidden from outsiders, visible to members.
  const draftLesson = await createLesson(
    org.id,
    {
      title: `Draft lesson ${tag} here`,
      slug: `draft-lesson-${tag}`,
      summary: "A draft lesson summary with enough length to pass validation rules.",
      body: LESSON_BODY,
      circleId: baseCircle.id,
      status: "draft",
      sources: SOURCES,
    },
    editorId,
  );
  createdLessonIds.push(draftLesson.id);
  assert.equal(draftLesson.status, "draft");
  await expectCode(
    createLesson(
      org.id,
      {
        title: `Outsider lesson ${tag} here`,
        slug: `outsider-lesson-${tag}`,
        summary: "An outsider attempt with enough summary length to pass validation.",
        body: LESSON_BODY,
        circleId: null,
        status: "draft",
        sources: SOURCES,
      },
      outsiderId,
    ),
    "forbidden",
  );

  assert.equal(await getLessonBySlug(`draft-lesson-${tag}`), null);
  assert.equal(await getLessonBySlug(`draft-lesson-${tag}`, outsiderId), null);
  const draftAsEditor = await getLessonBySlug(`draft-lesson-${tag}`, editorId);
  assert(draftAsEditor, "Org members must see drafts.");
  assert.equal(draftAsEditor.body, LESSON_BODY);
  assert.deepEqual(draftAsEditor.sources, SOURCES);

  // Publish and check participant visibility + sources preserved.
  const publishedLesson = await updateLesson(
    org.id,
    draftLesson.id,
    {
      title: draftLesson.title,
      slug: draftLesson.slug,
      summary: "A published lesson summary with enough length to pass validation.",
      body: LESSON_BODY,
      circleId: baseCircle.id,
      status: "published",
      sources: SOURCES,
    },
    ownerId,
  );
  assert.equal(publishedLesson.status, "published");
  const publicLesson = await getLessonBySlug(`draft-lesson-${tag}`);
  assert(publicLesson, "Published lessons must be participant-visible.");
  assert.deepEqual(publicLesson.sources, SOURCES);
  assert(publicLesson.readingMinutes >= 1);

  const orgPublic = await getOrganizationBySlug(`verify-org-${tag}`, participantId);
  assert(orgPublic, "The public org page data must resolve.");
  assert(orgPublic.lessons.some((lesson) => lesson.id === draftLesson.id));

  // Org mission uses the existing mission path (quiz, XLM reward, draft first).
  const orgMission = await createOrgMission(
    org.id,
    {
      circleId: baseCircle.id,
      title: `Org verification quiz ${tag}`,
      description: "An organization quiz mission with enough description length to validate.",
      type: "quiz",
      points: 40,
      status: "draft",
      rewardEnabled: true,
      rewardAmount: "0.05",
      questions: [
        { prompt: "Which network settles this mission reward?", choices: ["Stellar Testnet", "Base"], correctAnswer: "Stellar Testnet" },
      ],
      evidenceRequired: false,
      evidencePrompt: "Not used for quizzes.",
    },
    editorId,
  );
  createdMissionIds.push(orgMission.mission.id);
  const [storedMission] = await database
    .select()
    .from(missions)
    .where(eq(missions.id, orgMission.mission.id))
    .limit(1);
  assert.equal(storedMission?.organizationId, org.id);
  assert.equal(storedMission?.rewardAsset, "XLM");

  // Draft org mission hidden from participant surfaces.
  const hiddenCircle = await getCircleBySlug("usdc-on-base", participantId);
  assert(!hiddenCircle?.missions.some((mission) => mission.id === orgMission.mission.id));
  const hiddenCenter = await listMissions(participantId);
  assert(!hiddenCenter.some((mission) => mission.id === orgMission.mission.id));

  // Non-admin editor cannot flip status; owner can Draft -> Open.
  await expectCode(setOrgMissionStatus(org.id, orgMission.mission.id, "open", editorId), "forbidden");
  const opened = await setOrgMissionStatus(org.id, orgMission.mission.id, "open", ownerId);
  assert.equal(opened.mission.status, "open");
  const visibleCircle = await getCircleBySlug("usdc-on-base", participantId);
  assert(visibleCircle?.missions.some((mission) => mission.id === orgMission.mission.id));

  // Existing submission path: participant submits, editor cannot review, owner approves.
  const submission = await submitMission(
    orgMission.mission.id,
    { answers: { q1: "Stellar Testnet" } },
    participantId,
  );
  assert.equal(submission.submission.status, "approved");
  assert.equal(submission.pointsAwarded, 40);

  const textMission = await createOrgMission(
    org.id,
    {
      circleId: baseCircle.id,
      title: `Org verification text ${tag}`,
      description: "An organization text mission with enough description length to validate.",
      type: "text",
      points: 25,
      status: "open",
      rewardEnabled: false,
      rewardAmount: null,
      questions: [],
      evidenceRequired: false,
      evidencePrompt: "Link the official source that supports your response.",
    },
    ownerId,
  );
  createdMissionIds.push(textMission.mission.id);
  const manual = await submitMission(
    textMission.mission.id,
    { content: "A neutral source-linked note about the hosted circle for review-flow checks here." },
    participantId,
  );
  assert.equal(manual.submission.status, "pending");
  await expectCode(
    reviewOrgSubmission(org.id, manual.submission.id, "approved", null, editorId),
    "forbidden",
  );
  const approved = await reviewOrgSubmission(org.id, manual.submission.id, "approved", null, ownerId);
  assert.equal(approved.submission.status, "approved");
  assert.equal(approved.pointsAwarded, 25);

  // Approval creates eligibility but never auto-settles.
  const [autoClaim] = await database
    .select({ id: rewardClaims.id })
    .from(rewardClaims)
    .where(eq(rewardClaims.missionSubmissionId, manual.submission.id))
    .limit(1);
  assert(!autoClaim, "Approval must not automatically create a reward claim.");

  // Cross-org isolation: another org cannot review, flip, or read drafts here.
  await expectCode(
    reviewOrgSubmission(other.id, manual.submission.id, "approved", null, otherOwnerId),
    "forbidden",
  );
  await expectCode(
    setOrgMissionStatus(other.id, textMission.mission.id, "draft", otherOwnerId),
    "forbidden",
  );

  // Back to draft hides the mission again; status change creates no claims.
  const redrafted = await setOrgMissionStatus(org.id, textMission.mission.id, "draft", ownerId);
  assert.equal(redrafted.mission.status, "draft");
  const goneCircle = await getCircleBySlug("usdc-on-base", participantId);
  assert(!goneCircle?.missions.some((mission) => mission.id === textMission.mission.id));
  const [statusClaim] = await database
    .select({ id: rewardClaims.id })
    .from(rewardClaims)
    .where(eq(rewardClaims.missionId, textMission.mission.id))
    .limit(1);
  assert(!statusClaim, "Status changes must not create reward claims.");

  // No secret/wallet leakage in public org payloads.
  const leaked = JSON.stringify({ orgPublic, publicLesson });
  assert(!/publicKey/i.test(leaked), "Public org payloads must not leak wallet keys.");
  assert(!/secret/i.test(leaked), "Public org payloads must not leak secrets.");

  console.log("Organization verification passed", {
    orgReadback: true,
    membershipBoundaries: true,
    circleAssociation: true,
    draftLessonHidden: true,
    publishedLessonVisible: true,
    sourcesPreserved: true,
    orgMissionExistingPath: true,
    editorReviewBlocked: true,
    ownerReviewApproved: true,
    noAutoSettle: true,
    crossOrgIsolated: true,
    lifecycleScoped: true,
    noLeakage: true,
  });
}

verify()
  .catch((error) => {
    console.error("Organization verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
