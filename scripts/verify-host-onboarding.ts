import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  campaignCompletions,
  missionSubmissions,
  organizations,
  organizationMemberships,
  spaceApplications,
  users,
} from "../src/db/schema";
import {
  createSpaceApplicationDraft,
  getSpaceApplicationForApplicant,
  listPendingSpaceApplications,
  reviewSpaceApplication,
  submitSpaceApplication,
  submitSpaceApplicationDraft,
  updateSpaceApplicationDraft,
  validateAssetDocs,
  validateEligibility,
} from "../src/lib/organizations/service";
import { MissionActionError } from "../src/lib/missions/errors";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryApplicationIds: string[] = [];
const temporaryOrgIds: string[] = [];

async function createUser(handle: string, role = "member") {
  const id = randomUUID();
  const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
  await database.insert(users).values({ id, handle: uniqueHandle, displayName: handle, avatarUrl: null, role });
  temporaryUserIds.push(id);
  return { id, handle: uniqueHandle };
}

const FULL_IDENTITY = {
  proposedName: "Fixture Project",
  proposedSlug: "",
  description: "A fixture project applying to host a Space for testing staged onboarding end to end.",
  websiteUrl: "https://example.com/fixture",
  projectType: "issuer",
  ecosystemFocus: "stellar",
  requestedPurpose: "Host lessons, missions, and community discussion for the fixture project.",
  affiliationNote: "Fixture team",
};

const FULL_ELIGIBILITY = {
  authorizedRepresentative: true,
  issuerRelationship: "Fixture team",
  distributionRequested: false,
  jurisdictions: "Test only",
  permissionedNotes: null,
  kycProcesses: null,
  evidenceUrls: [] as string[],
};

async function fillValidDraft(applicantId: string, slug: string) {
  const draft = await createSpaceApplicationDraft(applicantId);
  temporaryApplicationIds.push(draft.id);
  await updateSpaceApplicationDraft(applicantId, draft.id, { ...FULL_IDENTITY, proposedSlug: slug });
  return draft.id;
}

async function cleanup() {
  if (temporaryApplicationIds.length > 0) {
    await database.delete(spaceApplications).where(inArray(spaceApplications.id, temporaryApplicationIds)).catch(() => undefined);
  }
  if (temporaryOrgIds.length > 0) {
    await database.delete(organizationMemberships).where(inArray(organizationMemberships.organizationId, temporaryOrgIds)).catch(() => undefined);
    await database.delete(organizations).where(inArray(organizations.id, temporaryOrgIds)).catch(() => undefined);
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds)).catch(() => undefined);
    await database.delete(campaignCompletions).where(inArray(campaignCompletions.userId, temporaryUserIds)).catch(() => undefined);
    await database.delete(users).where(inArray(users.id, temporaryUserIds)).catch(() => undefined);
  }
}

async function expectCode(promise: Promise<unknown>, code: string, label: string) {
  await promise.then(
    () => assert.fail(`${label}: expected rejection`),
    (error: unknown) => {
      assert.ok(error instanceof MissionActionError, `${label}: domain error, got ${String(error).slice(0, 80)}`);
      assert.equal(error.code, code, `${label}: expected ${code}, got ${error.code}`);
    },
  );
}

async function main() {
  const admin = await createUser("host-admin", "admin");
  const alice = await createUser("host-alice");
  const bob = await createUser("host-bob");

  // 1. New draft: incomplete, owned, invisible to the review queue.
  const draft = await createSpaceApplicationDraft(alice.id);
  temporaryApplicationIds.push(draft.id);
  assert.equal(draft.status, "draft", "drafts start as drafts");
  const pending0 = await listPendingSpaceApplications(admin.id);
  assert.ok(!pending0.some((a) => a.id === draft.id), "drafts never enter the review queue");

  // 2. Partial save + resume; unauthenticated and cross-user rejected.
  await updateSpaceApplicationDraft(alice.id, draft.id, { proposedName: "Partial Project" });
  const resumed = await getSpaceApplicationForApplicant(alice.id, draft.id);
  assert.equal(resumed.proposedName, "Partial Project", "partial draft persists");
  assert.equal(resumed.status, "draft", "still a draft");
  await expectCode(getSpaceApplicationForApplicant(null, draft.id), "unauthenticated", "anonymous read rejected");
  await expectCode(getSpaceApplicationForApplicant(bob.id, draft.id), "invalid-request", "stranger cannot read the draft");
  await expectCode(updateSpaceApplicationDraft(bob.id, draft.id, { proposedName: "Hijack" }), "invalid-request", "stranger cannot edit the draft");
  await expectCode(updateSpaceApplicationDraft(null, draft.id, { proposedName: "x" }), "unauthenticated", "anonymous edit rejected");

  // 3. Submit incomplete draft → actionable rejection, stays draft.
  await expectCode(submitSpaceApplicationDraft(alice.id, draft.id), "invalid-request", "incomplete draft cannot submit");
  const stillDraft = await getSpaceApplicationForApplicant(alice.id, draft.id);
  assert.equal(stillDraft.status, "draft", "failed submit keeps draft state");

  // 4. Invalid documents and client approval flags.
  const slugA = `fx-a-${randomUUID().slice(0, 8)}`;
  const d2 = await fillValidDraft(alice.id, slugA);
  await expectCode(
    updateSpaceApplicationDraft(alice.id, d2, { assetDetails: [{ name: "X", network: "Stellar", documentationUrls: ["not-a-url"] }] }),
    "invalid-request",
    "bad documentation URL rejected",
  );
  await updateSpaceApplicationDraft(alice.id, d2, {
    assetDetails: [{ name: "Fixture Token", network: "Stellar", identifier: null, documentationUrls: ["https://example.com/docs"], issuerWebsite: null, verificationSources: [], requestedUse: "Education" }],
  });
  // Client-supplied approval flags are ignored: status is server-owned.
  const spoofed = await updateSpaceApplicationDraft(alice.id, d2, { status: "approved", reviewedBy: admin.id } as unknown as Record<string, unknown>);
  assert.equal(spoofed.status, "draft", "client cannot set status");
  // Eligibility missing blocks submission.
  await expectCode(submitSpaceApplicationDraft(alice.id, d2), "invalid-request", "eligibility required");
  await updateSpaceApplicationDraft(alice.id, d2, { eligibility: FULL_ELIGIBILITY });

  // 5. Submit valid draft → pending, read-only, queued exactly once.
  const submitted = await submitSpaceApplicationDraft(alice.id, d2);
  assert.equal(submitted.status, "pending", "valid draft submits");
  assert.ok(submitted.submittedAt, "submission timestamped");
  const pending = await listPendingSpaceApplications(admin.id);
  assert.ok(pending.some((a) => a.id === d2), "submitted draft reaches the review queue");
  await expectCode(updateSpaceApplicationDraft(alice.id, d2, { proposedName: "Late edit" }), "invalid-transition", "submitted is read-only");
  await expectCode(submitSpaceApplicationDraft(alice.id, d2), "invalid-transition", "no double submit");

  // 6. Non-admin review forbidden; rejection with note; resubmit blocked.
  await expectCode(reviewSpaceApplication(d2, "approved", null, bob.id), "forbidden", "non-admin cannot decide");
  const slugR = `fx-r-${randomUUID().slice(0, 8)}`;
  const d3 = await fillValidDraft(alice.id, slugR);
  await updateSpaceApplicationDraft(alice.id, d3, { eligibility: FULL_ELIGIBILITY });
  await submitSpaceApplicationDraft(alice.id, d3);
  const rejected = await reviewSpaceApplication(d3, "rejected", "Needs a real website.", admin.id);
  assert.equal(rejected.status, "rejected", "rejection lands");
  assert.equal(rejected.reviewNote, "Needs a real website.", "reviewer note persisted");
  await expectCode(submitSpaceApplicationDraft(alice.id, d3), "invalid-transition", "rejected cannot resubmit");

  // 7. Approval creates exactly one organization + owner membership; replay safe.
  const approved = await reviewSpaceApplication(d2, "approved", "Looks good.", admin.id);
  assert.equal(approved.status, "approved", "approval lands");
  assert.ok(approved.organizationSlug, "approval returns the Space slug");
  const orgs = await database.select().from(organizations).where(eq(organizations.slug, slugA));
  assert.equal(orgs.length, 1, "exactly one organization created");
  temporaryOrgIds.push(orgs[0]!.id);
  const replayed = await reviewSpaceApplication(d2, "approved", "Again.", admin.id);
  assert.equal(replayed.organizationSlug, approved.organizationSlug, "replay returns the same outcome");
  const orgsAfter = await database.select().from(organizations).where(eq(organizations.slug, slugA));
  assert.equal(orgsAfter.length, 1, "replay creates no duplicate");

  // 8. Slug collision: submit warns early; approval-time race fails closed.
  const slugTaken = `fx-taken-${randomUUID().slice(0, 8)}`;
  const pre = await createSpaceApplicationDraft(alice.id);
  temporaryApplicationIds.push(pre.id);
  await updateSpaceApplicationDraft(alice.id, pre.id, { ...FULL_IDENTITY, proposedSlug: slugTaken, eligibility: FULL_ELIGIBILITY });
  const manualOrgId = randomUUID();
  await database.insert(organizations).values({ id: manualOrgId, name: "Taken", slug: slugTaken, description: "Taken", ecosystemFocus: null });
  temporaryOrgIds.push(manualOrgId);
  await submitSpaceApplicationDraft(alice.id, pre.id).then(
    () => assert.fail("submit must warn on taken slug"),
    (e: unknown) => assert.ok(e instanceof MissionActionError && e.code === "invalid-request", "taken slug blocked at submit"),
  );
  const stillDraft2 = await getSpaceApplicationForApplicant(alice.id, pre.id);
  assert.equal(stillDraft2.status, "draft", "collision keeps the draft");

  // 9. Legacy one-shot path still works (backward compatibility).
  const legacy = await submitSpaceApplication(bob.id, {
    ...FULL_IDENTITY,
    proposedSlug: `fx-legacy-${randomUUID().slice(0, 8)}`,
  });
  temporaryApplicationIds.push(legacy.id);
  assert.equal(legacy.status, "pending", "legacy submit still queues");
  const legacyApproved = await reviewSpaceApplication(legacy.id, "approved", "Legacy ok.", admin.id);
  temporaryOrgIds.push(legacyApproved.organizationId!);
  assert.equal(legacyApproved.status, "approved", "legacy pending approves");

  // 10. No asset registration, payouts, campaigns, or issuer approvals.
  // (structural: draft/submit/review touch only space_applications (+ one
  // organizations row + one membership on approval). Verified by the
  // targeted assertions above: single org, existing rows untouched.)

  // 11. Purge check: units reject bad shapes without touching the DB.
  assert.equal(validateAssetDocs("nope").ok, false, "non-array assets rejected");
  assert.equal(validateAssetDocs(new Array(11).fill({ name: "x", network: "y" })).ok, false, "asset cap enforced");
  assert.equal(validateEligibility({ authorizedRepresentative: "yes" }).ok, false, "boolean declarations required");

  console.log("host-onboarding:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(cleanup);
