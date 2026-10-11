import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { circles, missionSubmissions, missions, rewardClaims, users } from "../src/db/schema";
import { getCircleBySlug, listEcosystems } from "../src/lib/data/circles";
import { getEcosystemHub } from "../src/lib/data/ecosystems";
import { getMissionById, listMissions } from "../src/lib/data/missions";
import { MissionActionError } from "../src/lib/missions/errors";
import { createMission, updateMissionStatus } from "../src/lib/missions/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const createdMissionIds: string[] = [];

async function cleanup() {
  if (createdMissionIds.length > 0) {
    await database
      .delete(missionSubmissions)
      .where(inArray(missionSubmissions.missionId, createdMissionIds));
    await database.delete(missions).where(inArray(missions.id, createdMissionIds));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
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

async function verify() {
  // Only real DB-backed ecosystems resolve as hubs.
  const ecosystems = await listEcosystems();
  assert(ecosystems.length >= 4, "Stellar, Ethereum, Base, and Solana hubs are expected.");
  for (const expected of ["stellar", "ethereum", "base", "solana"]) {
    assert(
      ecosystems.some((entry) => entry.value === expected),
      `The ${expected} ecosystem must be DB-backed.`,
    );
  }

  // Unknown or malformed ecosystems fail safely (route 404s on null).
  assert.equal(await getEcosystemHub("dogechain"), null);
  assert.equal(await getEcosystemHub(""), null);
  assert.equal(await getEcosystemHub("bitcoin"), null);

  // URL values are normalized the way sidebar/hub links produce them.
  const upper = await getEcosystemHub("BASE");
  assert(upper && upper.value === "base", "Hub lookup must normalize URL casing.");

  for (const { value, label } of ecosystems) {
    const hub = await getEcosystemHub(value);
    assert(hub, `The ${value} hub must resolve.`);
    assert.equal(hub.value, value);
    assert.equal(hub.label, label);

    // Hub assets belong to this ecosystem only — Solana never renders Base.
    assert(hub.circles.length > 0, `The ${value} hub must list real Circles.`);
    for (const circle of hub.circles) {
      assert.equal(
        circle.ecosystem,
        value,
        `Circle ${circle.slug} does not belong in the ${value} hub.`,
      );
    }

    // Hub missions belong to this ecosystem only and are open-only.
    for (const mission of hub.missions) {
      const [row] = await database
        .select({ circleId: missions.circleId, status: missions.status })
        .from(missions)
        .where(eq(missions.id, mission.id))
        .limit(1);
      const [circle] = row
        ? await database
            .select({ slug: circles.slug })
            .from(circles)
            .where(eq(circles.id, row.circleId))
            .limit(1)
        : [];
      assert(row, `Hub mission ${mission.id} must exist.`);
      assert.equal(row.status, "open", `Draft mission ${mission.id} must not appear in the hub.`);
      assert(
        hub.circles.some((hubCircle) => hubCircle.slug === circle?.slug),
        `Hub mission ${mission.id} must attach to a ${value} Circle.`,
      );
      // Reward labels preserve the settlement distinction server-side.
      if (mission.reward !== "No reward configured") {
        assert(
          /XLM/.test(mission.reward),
          `Hub mission ${mission.id} reward must name the XLM settlement asset.`,
        );
      }
    }

    // Totals are derived, never invented.
    assert.equal(hub.totals.circles, hub.circles.length);
    assert.equal(hub.totals.openMissions, hub.missions.length);
    for (const total of [hub.totals.watchers, hub.totals.contributions, hub.totals.verifications]) {
      assert(Number.isInteger(total) && total >= 0, `Hub totals must be real counts.`);
    }
    for (const entry of hub.recentContributions) {
      assert(entry.missionTitle && entry.circleName && entry.participantHandle);
    }
  }

  // Stellar keeps real holder verification; other hubs expose no fake checks.
  const stellar = await getEcosystemHub("stellar");
  assert(
    stellar?.circles.some((circle) => circle.verification.enabled),
    "The Stellar hub must keep role verification available.",
  );
  for (const value of ["ethereum", "base", "solana"]) {
    const hub = await getEcosystemHub(value);
    assert(
      hub?.circles.every((circle) => !circle.verification.enabled),
      `The ${value} hub must not expose fake holder verification.`,
    );
  }

  // A fresh draft never leaks into its ecosystem hub.
  const adminId = randomUUID();
  const memberId = randomUUID();
  temporaryUserIds.push(adminId, memberId);
  await database.insert(users).values({
    id: adminId,
    handle: `hub-verify-admin-${adminId.slice(0, 6)}`,
    displayName: "Hub verification admin",
    avatarUrl: null,
    role: "admin",
  });
  await database.insert(users).values({
    id: memberId,
    handle: `hub-verify-member-${memberId.slice(0, 6)}`,
    displayName: "Hub verification member",
    avatarUrl: null,
    role: "member",
  });
  const [baseCircle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, "usdc-on-base"))
    .limit(1);
  assert(baseCircle, "The Base circle is required for the draft-exclusion check.");
  const draft = await createMission(
    {
      circleId: baseCircle.id,
      title: "Hub verification draft mission",
      description: "A draft that must stay in Campaign Studio and out of the Base hub.",
      type: "text",
      points: 5,
      status: "draft",
      rewardEnabled: false,
      rewardAmount: null,
      questions: [],
      evidenceRequired: false,
      evidencePrompt: "Link the official source that supports your response.",
    },
    adminId,
  );
  createdMissionIds.push(draft.mission.id);
  const baseHub = await getEcosystemHub("base");
  assert(
    !baseHub?.missions.some((mission) => mission.id === draft.mission.id),
    "Draft missions must be excluded from ecosystem hubs.",
  );

  // Lifecycle is identical on every chain: draft hidden everywhere, open
  // visible everywhere, re-draft hidden again, no claim rows created.
  for (const entry of [
    { slug: "usdc-on-stellar", ecosystem: "stellar" },
    { slug: "usdc-on-ethereum", ecosystem: "ethereum" },
    { slug: "usdc-on-base", ecosystem: "base" },
    { slug: "usdc-on-solana", ecosystem: "solana" },
  ]) {
    const [circle] = await database
      .select({ id: circles.id })
      .from(circles)
      .where(eq(circles.slug, entry.slug))
      .limit(1);
    assert(circle, `The ${entry.slug} circle is required for lifecycle checks.`);
    const lifecycle = await createMission(
      {
        circleId: circle.id,
        title: `Hub lifecycle ${entry.ecosystem} mission`,
        description: "Per-chain lifecycle check: hidden as draft, visible as open, hidden again.",
        type: "text",
        points: 5,
        status: "draft",
        rewardEnabled: false,
        rewardAmount: null,
        questions: [],
        evidenceRequired: false,
        evidencePrompt: "Link the official source that supports your response.",
      },
      adminId,
    );
    createdMissionIds.push(lifecycle.mission.id);
    const lifecycleId = lifecycle.mission.id;

    await expectCode(updateMissionStatus(lifecycleId, "open", memberId), "forbidden");

    const draftHub = await getEcosystemHub(entry.ecosystem, memberId);
    assert(
      !draftHub?.missions.some((mission) => mission.id === lifecycleId),
      `Draft must be hidden from the ${entry.ecosystem} hub.`,
    );
    const draftCircle = await getCircleBySlug(entry.slug, memberId);
    assert(
      !draftCircle?.missions.some((mission) => mission.id === lifecycleId),
      `Draft must be hidden from the ${entry.slug} circle.`,
    );
    const draftCenter = await listMissions(memberId);
    assert(
      !draftCenter.some((mission) => mission.id === lifecycleId),
      `Draft must be hidden from the Mission Center (${entry.ecosystem}).`,
    );
    assert.equal(
      await getMissionById(lifecycleId, memberId),
      null,
      `Direct draft access must not leak config (${entry.ecosystem}).`,
    );
    const draftAdminView = await getMissionById(lifecycleId, adminId);
    assert(draftAdminView, `Admin must see the draft (${entry.ecosystem}).`);
    assert.equal(
      JSON.stringify(draftAdminView.config).includes("correctAnswer"),
      false,
      `Answer keys must never leak (${entry.ecosystem}).`,
    );

    const opened = await updateMissionStatus(lifecycleId, "open", adminId);
    assert.equal(opened.mission.status, "open");
    const openedHub = await getEcosystemHub(entry.ecosystem, memberId);
    assert(
      openedHub?.missions.some((mission) => mission.id === lifecycleId),
      `Opened mission must appear in the ${entry.ecosystem} hub.`,
    );
    const openedCircle = await getCircleBySlug(entry.slug, memberId);
    assert(
      openedCircle?.missions.some((mission) => mission.id === lifecycleId),
      `Opened mission must appear in ${entry.slug}.`,
    );
    const openedCenter = await listMissions(memberId);
    assert(
      openedCenter.some((mission) => mission.id === lifecycleId),
      `Opened mission must appear in the Mission Center (${entry.ecosystem}).`,
    );

    const redrafted = await updateMissionStatus(lifecycleId, "draft", adminId);
    assert.equal(redrafted.mission.status, "draft");
    const redraftedHub = await getEcosystemHub(entry.ecosystem, memberId);
    assert(
      !redraftedHub?.missions.some((mission) => mission.id === lifecycleId),
      `Re-drafted mission must leave the ${entry.ecosystem} hub.`,
    );
    const redraftedCenter = await listMissions(memberId);
    assert(
      !redraftedCenter.some((mission) => mission.id === lifecycleId),
      `Re-drafted mission must leave the Mission Center (${entry.ecosystem}).`,
    );
    const [lifecycleClaim] = await database
      .select({ id: rewardClaims.id })
      .from(rewardClaims)
      .where(eq(rewardClaims.missionId, lifecycleId))
      .limit(1);
    assert(!lifecycleClaim, `Status changes must not create claims (${entry.ecosystem}).`);
  }

  console.log("Ecosystem hub verification passed", {
    hubsResolve: ecosystems.map((entry) => entry.value),
    unknownFailsSafely: true,
    assetsScoped: true,
    missionsScoped: true,
    draftsExcluded: true,
    rewardDistinction: true,
    stellarVerification: true,
    nonStellarNoFakeVerification: true,
    perChainLifecycle: ["stellar", "ethereum", "base", "solana"],
    nonAdminStatusBlocked: true,
    noClaimOnStatusChange: true,
  });
}

verify()
  .catch((error) => {
    console.error("Ecosystem hub verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
