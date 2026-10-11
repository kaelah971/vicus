import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  circlePostHelpful,
  circlePosts,
  organizationMemberships,
  organizations,
  spaceApplications,
  users,
} from "../src/db/schema";
import { MissionActionError } from "../src/lib/missions/errors";
import { createCommunityPost } from "../src/lib/community/service";
import { getSpacePeople } from "../src/lib/social/service";
import {
  getOrganizationBySlug,
  listMySpaceApplications,
  listPendingSpaceApplications,
  listSpaces,
  reviewSpaceApplication,
  submitSpaceApplication,
} from "../src/lib/organizations/service";
import { getSpaceCommunityActivity } from "../src/lib/community/service";
import OrganizationAliasPage from "../src/app/organizations/[slug]/page";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const createdPostIds: string[] = [];
const createdOrgIds: string[] = [];
const createdApplicationIds: string[] = [];

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
  if (createdPostIds.length > 0) {
    await database.delete(circlePostHelpful).where(inArray(circlePostHelpful.postId, createdPostIds));
    await database.delete(circlePosts).where(inArray(circlePosts.id, createdPostIds));
  }
  if (createdApplicationIds.length > 0) {
    await database.delete(spaceApplications).where(inArray(spaceApplications.id, createdApplicationIds));
  }
  if (createdOrgIds.length > 0) {
    await database
      .delete(organizationMemberships)
      .where(inArray(organizationMemberships.organizationId, createdOrgIds));
    await database.delete(organizations).where(inArray(organizations.id, createdOrgIds));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

function validApplication(tag: string, slug: string) {
  return {
    proposedName: `Test Space ${tag} ${slug}`,
    proposedSlug: `${slug}-${tag}`,
    description: "A verification Space application with enough description length to validate.",
    websiteUrl: "https://example.com/space",
    projectType: "community",
    ecosystemFocus: "base",
    requestedPurpose: "Hosting Asset Circles, Lessons, Missions, and Community for verification.",
    affiliationNote: "Verification affiliation context.",
  };
}

async function verify() {
  const tag = randomUUID().slice(0, 6);
  const adminId = await createUser(`spaces-admin-${tag}`, "admin");
  const applicantId = await createUser(`spaces-applicant-${tag}`, "member");
  const outsiderId = await createUser(`spaces-outsider-${tag}`, "member");

  // Directory lists real Spaces with derived counts and no private info.
  const spaces = await listSpaces();
  const circleSpace = spaces.find((entry) => entry.slug === "circle");
  assert(circleSpace, "The seeded Circle Space must appear in /spaces.");
  assert(circleSpace.hostedCircleCount >= 4);
  assert(circleSpace.publishedLessonCount >= 1);
  assert(Number.isInteger(circleSpace.openMissionCount) && circleSpace.openMissionCount >= 0);
  const directoryLeak = JSON.stringify(spaces);
  for (const forbidden of ["applicant", "reviewNote", "member", "publicKey", "secret", "session", "wallet"]) {
    assert(!new RegExp(`"${forbidden}"`, "i").test(directoryLeak), `Directory must not expose ${forbidden}.`);
  }

  const circleDetail = await getOrganizationBySlug("circle", outsiderId);
  assert(circleDetail, "The Circle Space page data must resolve.");
  assert.equal(circleDetail.role, null, "Outsiders must not carry a Space role.");

  // Compatibility alias redirects to the canonical Space route.
  try {
    await OrganizationAliasPage({ params: Promise.resolve({ slug: "circle" }) });
    assert.fail("The organizations alias must redirect.");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("NEXT_REDIRECT"),
      "The organizations alias must redirect to /spaces/[slug].",
    );
  }

  // Signed-out applications are blocked; validation applies.
  await expectCode(submitSpaceApplication(null, validApplication(tag, "nova")), "unauthenticated");
  await expectCode(
    submitSpaceApplication(applicantId, { ...validApplication(tag, "nova"), projectType: "dao" }),
    "invalid-request",
  );

  // Authenticated submit works; duplicates are handled; isolation holds.
  const first = await submitSpaceApplication(applicantId, validApplication(tag, "nova"));
  createdApplicationIds.push(first.id);
  assert.equal(first.status, "pending");
  await expectCode(submitSpaceApplication(applicantId, validApplication(tag, "nova")), "invalid-request");
  const second = await submitSpaceApplication(applicantId, validApplication(tag, "orbit"));
  createdApplicationIds.push(second.id);

  const mine = await listMySpaceApplications(applicantId);
  assert(mine.some((entry) => entry.id === first.id));
  assert(mine.some((entry) => entry.id === second.id));
  const outsiderMine = await listMySpaceApplications(outsiderId);
  assert(!outsiderMine.some((entry) => entry.id === first.id), "Applications must stay applicant-private.");

  // Non-admins cannot review or even list the queue.
  await expectCode(listPendingSpaceApplications(applicantId), "forbidden");
  await expectCode(reviewSpaceApplication(first.id, "approved", null, applicantId), "forbidden");
  await expectCode(reviewSpaceApplication(first.id, "approved", null, outsiderId), "forbidden");

  const queue = await listPendingSpaceApplications(adminId);
  assert(queue.some((entry) => entry.id === first.id), "Pending applications must reach admins.");

  // Approval creates the Space and exactly one owner membership.
  const approved = await reviewSpaceApplication(first.id, "approved", "Welcome aboard.", adminId);
  assert.equal(approved.status, "approved");
  assert(approved.organizationSlug, "Approval must report the Space slug.");
  const [createdOrg] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, approved.organizationSlug!))
    .limit(1);
  assert(createdOrg, "Approval must create the Space.");
  createdOrgIds.push(createdOrg.id);
  const orgCount = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, approved.organizationSlug!));
  assert.equal(orgCount.length, 1, "The Space must be created exactly once.");
  const ownerRows = await database
    .select()
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, createdOrg.id));
  assert.equal(ownerRows.length, 1, "The applicant must receive exactly one owner membership.");
  assert.equal(ownerRows[0]?.userId, applicantId);
  assert.equal(ownerRows[0]?.role, "owner");

  const publicSpace = await getOrganizationBySlug(approved.organizationSlug!, outsiderId);
  assert(publicSpace, "The approved Space must be publicly visible.");
  const ownerView = await getOrganizationBySlug(approved.organizationSlug!, applicantId);
  assert.equal(ownerView?.role, "owner", "Owners must see the Manage Space path.");
  assert.equal(publicSpace.role, null, "Outsiders must not see the Manage path.");

  // Slug conflicts cannot steal an existing Space.
  const conflict = await submitSpaceApplication(outsiderId, {
    ...validApplication(tag, "steal"),
    proposedSlug: "circle",
    proposedName: "Circle Impersonator",
  });
  createdApplicationIds.push(conflict.id);
  await expectCode(reviewSpaceApplication(conflict.id, "approved", null, adminId), "invalid-request");
  const [stillPending] = await database
    .select({ status: spaceApplications.status })
    .from(spaceApplications)
    .where(eq(spaceApplications.id, conflict.id))
    .limit(1);
  assert.equal(stillPending?.status, "pending", "Conflicted applications must stay pending.");
  const circleOrgs = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "circle"));
  assert.equal(circleOrgs.length, 1, "The existing Space must be untouched.");

  // Rejection creates nothing but records feedback.
  const rejected = await reviewSpaceApplication(second.id, "rejected", "Not yet — add a website.", adminId);
  assert.equal(rejected.status, "rejected");
  const [rejectedOrg] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, second.proposedSlug))
    .limit(1);
  assert(!rejectedOrg, "Rejection must not create a Space.");
  const applicantView = await listMySpaceApplications(applicantId);
  const rejectedView = applicantView.find((entry) => entry.id === second.id);
  assert.equal(rejectedView?.status, "rejected");
  assert.equal(rejectedView?.reviewNote, "Not yet — add a website.");

  // Space People/Community aggregate hosted Circles only.
  const hostedPost = await createCommunityPost(applicantId, "usdc-on-base", {
    type: "insight",
    title: `Scoped insight ${tag} for spaces`,
    body: "A substantive community insight body with enough length to pass validation rules.",
    sourceUrl: null,
  });
  createdPostIds.push(hostedPost.id);
  const spaceCommunity = await getSpaceCommunityActivity(createdOrg.id, 6);
  assert(!spaceCommunity.some((item) => item.postId === hostedPost.id), "Unrelated circles must not leak into Space community.");
  const circleCommunity = await getSpaceCommunityActivity(
    (await database.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, "circle")).limit(1))[0]!.id,
    6,
  );
  assert(circleCommunity.some((item) => item.postId === hostedPost.id), "Hosted circle activity must aggregate.");
  const spacePeople = await getSpacePeople(createdOrg.id, 12);
  assert.deepEqual(spacePeople, [], "A Space with no hosted Circles has no people.");

  console.log("Spaces verification passed", {
    directoryReal: true,
    aliasRedirects: true,
    signedOutBlocked: true,
    duplicateHandled: true,
    applicantIsolation: true,
    nonAdminBlocked: true,
    approvedOnce: true,
    ownerOnce: true,
    publiclyVisible: true,
    studioGating: true,
    conflictSafe: true,
    rejectionClean: true,
    aggregationScoped: true,
  });
}

verify()
  .catch((error) => {
    console.error("Spaces verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
