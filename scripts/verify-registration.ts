import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  assetRegistrations,
  assets,
  organizationMemberships,
  organizations,
  spaceApplications,
  users,
} from "../src/db/schema";
import {
  countFinancialAttachments,
  createAssetRegistration,
  getAssetRegistrationForApplicant,
  listMyAssetRegistrations,
  listPendingAssetRegistrations,
  reviewAssetRegistration,
  validateRegistrationInput,
} from "../src/lib/registrations/service";
import {
  reviewSpaceApplication,
  submitSpaceApplication,
} from "../src/lib/organizations/service";
import { MissionActionError } from "../src/lib/missions/errors";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryApplicationIds: string[] = [];
const temporaryRegistrationIds: string[] = [];
const temporaryAssetIds: string[] = [];
const temporaryOrgIds: string[] = [];

async function createUser(handle: string, role = "member") {
  const id = randomUUID();
  const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
  await database.insert(users).values({ id, handle: uniqueHandle, displayName: handle, avatarUrl: null, role });
  temporaryUserIds.push(id);
  return { id, handle: uniqueHandle };
}

const FIXTURE_ISSUER = `G${"A".repeat(55)}`;
const FIXTURE_MINT = `1${"A".repeat(43)}`;
const FIXTURE_EVM = `0x${"1".repeat(40)}`;

function stellarFixture(overrides: Record<string, unknown> = {}) {
  return {
    assetName: "Fixture Token",
    assetType: "stellar-classic",
    network: "stellar",
    identifier: FIXTURE_ISSUER,
    code: "FIXT",
    issuerClaim: "Fixture issuer (applicant-stated)",
    documentationUrls: ["https://example.com/fixture/docs"],
    chainEvidenceUrls: ["https://example.com/fixture/horizon"],
    issuerWebsite: "https://example.com/fixture",
    spaceApplicationId: null,
    ...overrides,
  };
}

async function cleanup() {
  if (temporaryRegistrationIds.length > 0) {
    await database.delete(assetRegistrations).where(inArray(assetRegistrations.id, temporaryRegistrationIds)).catch(() => undefined);
  }
  if (temporaryAssetIds.length > 0) {
    await database.delete(assets).where(inArray(assets.id, temporaryAssetIds)).catch(() => undefined);
  }
  if (temporaryApplicationIds.length > 0) {
    await database.delete(spaceApplications).where(inArray(spaceApplications.id, temporaryApplicationIds)).catch(() => undefined);
  }
  if (temporaryOrgIds.length > 0) {
    await database.delete(organizationMemberships).where(inArray(organizationMemberships.organizationId, temporaryOrgIds)).catch(() => undefined);
    await database.delete(organizations).where(inArray(organizations.id, temporaryOrgIds)).catch(() => undefined);
  }
  if (temporaryUserIds.length > 0) {
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

function trackRegistration(id: string) {
  temporaryRegistrationIds.push(id);
}

async function main() {
  const admin = await createUser("reg-admin", "admin");
  const alice = await createUser("reg-alice");
  const bob = await createUser("reg-bob");

  // 1. Valid shape → pending with explicit UNVERIFIED finding. Never verified on submit.
  const created = await createAssetRegistration(alice.id, stellarFixture());
  trackRegistration(created.id);
  assert.equal(created.status, "pending", "valid shape queues as pending");
  assert.ok(
    created.validationFindings.some((finding) => finding.code === "unverified"),
    "every accepted request carries an UNVERIFIED finding",
  );
  assert.equal(created.registeredAssetId, null, "no registry row on submit");

  // 2. Missing official documentation rejected.
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ documentationUrls: [] })),
    "invalid-request",
    "missing documentation rejected",
  );

  // 3. Missing chain evidence rejected.
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ chainEvidenceUrls: [] })),
    "invalid-request",
    "missing chain evidence rejected",
  );

  // 4. Invalid URLs rejected.
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ documentationUrls: ["not-a-url"] })),
    "invalid-request",
    "bad documentation URL rejected",
  );

  // 5. Malformed issuer rejected.
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ identifier: "GSHORT" })),
    "invalid-request",
    "malformed Stellar issuer rejected",
  );

  // 6. Wrong network for type rejected.
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ assetType: "evm", network: "solana", identifier: FIXTURE_EVM })),
    "invalid-request",
    "wrong network rejected",
  );

  // 7. Unknown network rejected (no expansion by request).
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ assetType: "evm", network: "polygon", identifier: FIXTURE_EVM })),
    "invalid-request",
    "unsupported network rejected",
  );

  // 8. Mismatched identifier for type rejected (mint where a contract belongs).
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ assetType: "evm", network: "base", identifier: FIXTURE_MINT })),
    "invalid-request",
    "mismatched identifier rejected",
  );

  // 9. Bad EVM contract shape rejected.
  await expectCode(
    createAssetRegistration(alice.id, stellarFixture({ assetType: "evm", network: "base", identifier: "0x123" })),
    "invalid-request",
    "malformed EVM contract rejected",
  );

  // 10. Cross-applicant isolation: bob cannot file against alice's application.
  const app = await submitSpaceApplication(alice.id, {
    proposedName: "Fixture Space",
    proposedSlug: `fx-reg-${randomUUID().slice(0, 8)}`,
    description: "A fixture Space application carrying an asset claim for registration tests.",
    websiteUrl: "https://example.com/fixture",
    projectType: "issuer",
    ecosystemFocus: "stellar",
    requestedPurpose: "Test asset registration isolation.",
    affiliationNote: "Fixture",
  });
  temporaryApplicationIds.push(app.id);
  await expectCode(
    createAssetRegistration(bob.id, stellarFixture({ spaceApplicationId: app.id })),
    "invalid-request",
    "stranger cannot file against another applicant's application",
  );
  const linked = await createAssetRegistration(
    alice.id,
    stellarFixture({ spaceApplicationId: app.id, identifier: `G${"B".repeat(55)}`, code: "FIX2" }),
  );
  trackRegistration(linked.id);
  assert.equal(linked.originApplication?.id, app.id, "owner can link their own application");

  // 11. Forged approval flags ignored: client cannot set status or registry links.
  const spoofed = await createAssetRegistration(
    alice.id,
    stellarFixture({ identifier: `G${"C".repeat(55)}`, code: "FIX3", status: "approved", registeredAssetId: randomUUID() }),
  );
  trackRegistration(spoofed.id);
  assert.equal(spoofed.status, "pending", "client cannot set status");
  assert.equal(spoofed.registeredAssetId, null, "client cannot forge registry links");

  // 12. Stranger cannot read another applicant's request; anonymous rejected.
  await expectCode(getAssetRegistrationForApplicant(bob.id, created.id), "invalid-request", "stranger read rejected");
  await expectCode(getAssetRegistrationForApplicant(null, created.id), "unauthenticated", "anonymous read rejected");
  const mine = await listMyAssetRegistrations(alice.id);
  assert.ok(mine.some((row) => row.id === created.id), "applicant sees their own request");
  const bobs = await listMyAssetRegistrations(bob.id);
  assert.ok(!bobs.some((row) => row.id === created.id), "requests never leak across applicants");

  // 13. Unauthorized review forbidden.
  await expectCode(reviewAssetRegistration(created.id, "approved", null, bob.id), "forbidden", "non-admin review rejected");

  // 14. Admin can park for evidence; applicant sees why it is still unverified.
  const parked = await reviewAssetRegistration(created.id, "needs_review", "Chain link did not resolve — provide a Horizon record.", admin.id);
  assert.equal(parked.status, "needs_review", "parks as needs_review");
  assert.equal(parked.reviewNote, "Chain link did not resolve — provide a Horizon record.", "reviewer note persisted");
  const pendingQueue = await listPendingAssetRegistrations(admin.id);
  assert.ok(pendingQueue.some((row) => row.id === created.id), "parked requests stay in the admin queue");
  const applicantView = await getAssetRegistrationForApplicant(alice.id, created.id);
  assert.equal(applicantView.status, "needs_review", "applicant sees parked status");
  assert.ok(applicantView.reviewNote, "applicant sees the reviewer reason");

  // 15. Rejection hides the record: never in the catalogue, out of the queue, visible to the applicant.
  const rejected = await reviewAssetRegistration(linked.id, "rejected", "Issuer relationship unclear.", admin.id);
  assert.equal(rejected.status, "rejected", "rejection lands");
  const queueAfterReject = await listPendingAssetRegistrations(admin.id);
  assert.ok(!queueAfterReject.some((row) => row.id === linked.id), "rejected leaves the queue");
  const assetRows = await database.select({ id: assets.id }).from(assets).where(eq(assets.stellarIssuerAccount, `G${"B".repeat(55)}`));
  assert.equal(assetRows.length, 0, "rejected claims never reach the registry");

  // 16. Existing catalogue collision fails closed: a curated row with the same
  // identity cannot be re-registered or overwritten.
  const curatedMint = `2${"A".repeat(43)}`;
  const now = new Date();
  const [curated] = await database
    .insert(assets)
    .values({
      code: "CUR",
      issuer: "Curated Issuer",
      chain: "solana",
      ecosystem: "solana",
      type: "tokenized asset",
      stellarNetwork: null,
      stellarAssetCode: null,
      stellarIssuerAccount: null,
      stellarContractId: curatedMint,
      verificationMode: "solana-mint",
      verificationSourceUrl: "https://example.com/curated",
      name: "Curated Fixture",
      description: "Curated catalogue row for collision tests.",
      intendedUse: null,
      officialUrl: "https://example.com/curated",
      riskNote: "Fixture.",
      eligibilityNote: null,
      sourceStatus: "Curated source",
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: assets.id });
  temporaryAssetIds.push(curated!.id);
  const collisionReq = await createAssetRegistration(
    bob.id,
    {
      assetName: "Curated Copy",
      assetType: "solana",
      network: "solana",
      identifier: curatedMint,
      code: "CUR",
      issuerClaim: "Applicant claims to be the issuer",
      documentationUrls: ["https://example.com/curated/docs"],
      chainEvidenceUrls: ["https://example.com/curated/explorer"],
      issuerWebsite: null,
      spaceApplicationId: null,
    },
  );
  trackRegistration(collisionReq.id);
  await expectCode(reviewAssetRegistration(collisionReq.id, "approved", null, admin.id), "invalid-request", "catalogue collision fails closed");
  const stillPending = await getAssetRegistrationForApplicant(bob.id, collisionReq.id);
  assert.equal(stillPending.status, "pending", "collision preserves pending state (no silent write)");
  assert.equal(stillPending.registeredAssetId, null, "collision writes no registry link");
  const catalogueAfter = await database.select({ id: assets.id }).from(assets).where(eq(assets.stellarContractId, curatedMint));
  assert.equal(catalogueAfter.length, 1, "existing catalogue rows never overwritten");

  // 17. Approval writes exactly one honest registry row: no official labels, no circle, no capabilities.
  const approvalReq = await createAssetRegistration(
    alice.id,
    stellarFixture({ identifier: `G${"D".repeat(55)}`, code: "FIXD" }),
  );
  trackRegistration(approvalReq.id);
  const approved = await reviewAssetRegistration(approvalReq.id, "approved", "Sources checked: issuer docs + Horizon account.", admin.id);
  assert.equal(approved.status, "approved", "approval lands");
  assert.ok(approved.registeredAssetId, "approval links the registry row");
  temporaryAssetIds.push(approved.registeredAssetId!);
  const [registered] = await database.select().from(assets).where(eq(assets.id, approved.registeredAssetId!));
  assert.ok(registered, "registry row exists");
  assert.equal(registered.sourceStatus, "Studio-registered (issuer unverified)", "never labeled official");
  assert.ok(!/official|verified issuer/i.test(`${registered.sourceStatus} ${registered.name}`.replace("issuer unverified", "")), "no official/verified-issuer labels");
  assert.ok(
    /does not verify issuer endorsement/i.test(registered.description ?? ""),
    "registry copy disclaims verification",
  );
  assert.equal(registered.lastVerifiedAt, null, "approval is not verification");
  const attachments = await countFinancialAttachments(approved.registeredAssetId!);
  assert.equal(attachments.capabilities, 0, "no capabilities enabled");
  assert.equal(attachments.campaigns, 0, "no campaigns enabled");

  // 18. Replay safe: approving twice returns the same outcome with one registry row.
  const replayed = await reviewAssetRegistration(approvalReq.id, "approved", "Again.", admin.id);
  assert.equal(replayed.registeredAssetId, approved.registeredAssetId, "replay returns the same registry row");
  const dupAssets = await database
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.stellarIssuerAccount, `G${"D".repeat(55)}`));
  assert.equal(dupAssets.length, 1, "replay creates no duplicate asset");

  // 19. Duplicate registration blocked at both layers: same canonical identity
  // cannot register twice, whether the twin is still pending or already approved.
  const twin = await createAssetRegistration(
    bob.id,
    stellarFixture({ assetName: "Fixture Twin", identifier: `G${"E".repeat(55)}`, code: "FIXE" }),
  );
  trackRegistration(twin.id);
  const rival = await createAssetRegistration(
    alice.id,
    stellarFixture({ assetName: "Fixture Rival", identifier: `G${"E".repeat(55)}`, code: "FIXE" }),
  );
  trackRegistration(rival.id);
  const twinApproved = await reviewAssetRegistration(twin.id, "approved", "Twin sources checked.", admin.id);
  temporaryAssetIds.push(twinApproved.registeredAssetId!);
  await expectCode(reviewAssetRegistration(rival.id, "approved", null, admin.id), "invalid-request", "second approval of the same identity fails closed");
  const rivalStillPending = await getAssetRegistrationForApplicant(alice.id, rival.id);
  assert.equal(rivalStillPending.status, "pending", "losing twin stays pending, nothing written");
  await expectCode(
    createAssetRegistration(bob.id, stellarFixture({ identifier: `G${"E".repeat(55)}`, code: "FIXE" })),
    "invalid-request",
    "already-registered identity rejected at create",
  );

  // 20. Hosting approval grants no registration authority (structural).
  const regCountBefore = await database.select({ id: assetRegistrations.id }).from(assetRegistrations);
  const hosted = await reviewSpaceApplication(app.id, "approved", "Hosting ok.", admin.id);
  temporaryOrgIds.push(hosted.organizationId!);
  const regCountAfter = await database.select({ id: assetRegistrations.id }).from(assetRegistrations);
  assert.equal(regCountAfter.length, regCountBefore.length, "Space approval creates no registrations");

  // 21. Units reject bad shapes without touching the DB.
  assert.equal(validateRegistrationInput("nope").ok, false, "non-object rejected");
  assert.equal(validateRegistrationInput({ ...stellarFixture(), assetType: "polygon" }).ok, false, "unknown type rejected");
  assert.equal(validateRegistrationInput({ ...stellarFixture(), identifier: "0x123" }).ok, false, "bad identifier rejected");

  console.log("registration:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(cleanup);
