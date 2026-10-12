import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  assetCapabilities,
  assets,
  circles,
  missions,
  onchainActionProofs,
  users,
} from "../src/db/schema";
import { MissionActionError } from "../src/lib/missions/errors";
import { submitMission } from "../src/lib/missions/service";
import { submitOnchainProof, getActivationMissionLinks } from "../src/lib/activation/service";
import { normalizeTransactionHash } from "../src/lib/activation/verifier";
import { getCircleBySlug } from "../src/lib/data/circles";
import { getPublicProfileByHandle } from "../src/lib/social/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();

// Deterministic fixtures. No real Mainnet transaction is ever required.
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const WALLET_A = `G${"A".repeat(55)}`;
const WALLET_B = `G${"B".repeat(55)}`;
const OTHER_ISSUER = `G${"C".repeat(55)}`;
const HASH = (char: string) => char.repeat(64);
const CREATED_AFTER = "2026-06-01T12:00:00.000Z";
const CREATED_BEFORE = "2025-06-01T12:00:00.000Z";
const PROOF_NOT_BEFORE = "2026-01-01T00:00:00.000Z";
const MINIMUM = "1.0000000";

type MockOp = {
  type: string;
  source_account?: string;
  to?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
};

let scenario: { tx: Record<string, unknown> | null; ops: MockOp[] } | null = null;
let horizonDown = false;

async function mockFetchJson(url: string): Promise<unknown> {
  if (horizonDown) throw new Error("Horizon unreachable in fixture.");
  if (url.includes("/operations")) {
    return { records: scenario?.ops ?? [] };
  }
  return scenario?.tx ?? null;
}

function txFixture(source: string, createdAt: string, successful = true) {
  return {
    hash: HASH("a"),
    successful,
    source_account: source,
    created_at: createdAt,
    ledger: 123456,
  };
}

function paymentOp(overrides: Partial<MockOp> = {}): MockOp {
  return {
    type: "payment",
    source_account: WALLET_A,
    to: WALLET_B,
    asset_type: "credit_alphanum4",
    asset_code: "USDC",
    asset_issuer: USDC_ISSUER,
    amount: "2.5000000",
    ...overrides,
  };
}

const temporaryUserIds: string[] = [];
let probeCircleId = "";
let probeAssetId = "";
let probeMissionId = "";

async function createUser(handle: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({ id, handle, displayName: `${handle} tester`, avatarUrl: null, role: "member" });
  return id;
}

async function setupProbe(tag: string) {
  const [asset] = await database
    .insert(assets)
    .values({
      code: `PRB-${tag}`,
      chain: "stellar",
      ecosystem: "stellar",
      type: "token",
      stellarNetwork: "mainnet",
      stellarAssetCode: "USDC",
      stellarIssuerAccount: USDC_ISSUER,
      verificationMode: "classic-asset",
      name: `Probe asset ${tag}`,
      description: "Throwaway activation-verifier asset.",
      sourceStatus: "test-fixture",
    })
    .returning({ id: assets.id });
  probeAssetId = asset!.id;
  const [circle] = await database
    .insert(circles)
    .values({
      assetId: probeAssetId,
      slug: `activation-probe-${tag}`,
      name: `Activation Probe ${tag}`,
      status: "active",
      category: "test-fixture",
      officialStatus: "fixture",
    })
    .returning({ id: circles.id });
  probeCircleId = circle!.id;
  const [capability] = await database
    .insert(assetCapabilities)
    .values({
      circleId: probeCircleId,
      capabilityType: "send",
      title: "Send",
      shortDescription: "Probe send capability.",
      supportMode: "guide",
      ctaLabel: "Learn how",
      destinationUrl: null,
      sourceUrl: "https://example.com/probe",
      eligibilityNote: null,
      sortOrder: 1,
      active: true,
    })
    .returning({ id: assetCapabilities.id });
  const now = new Date();
  const [mission] = await database
    .insert(missions)
    .values({
      circleId: probeCircleId,
      campaignId: null,
      organizationId: null,
      type: "onchain_action",
      title: `Probe activation ${tag}`,
      description: "Throwaway activation-verifier mission with enough description length.",
      points: 250,
      rewardAsset: "XLM",
      rewardAmount: "0.0500000",
      eligibilityRule: { kind: "fixture" },
      missionConfig: {
        kind: "onchain_action",
        network: "stellar_mainnet",
        action: "payment",
        assetCode: "USDC",
        assetIssuer: USDC_ISSUER,
        minimumAmount: MINIMUM,
        proofNotBefore: PROOF_NOT_BEFORE,
      },
      assetCapabilityId: capability!.id,
      duplicatePolicy: "allow-revision",
      reviewMode: "automatic",
      status: "open",
      startsAt: null,
      endsAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: missions.id });
  probeMissionId = mission!.id;
}

async function cleanup() {
  if (probeCircleId) {
    await database.delete(circles).where(eq(circles.id, probeCircleId));
  }
  if (probeAssetId) {
    await database.delete(assets).where(eq(assets.id, probeAssetId));
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

function asOutcome(value: unknown): { submission: { status: string }; pointsAwarded: number } {
  assert(typeof value === "object" && value !== null, "Expected a submission outcome.");
  const outcome = value as { submission?: { status?: unknown }; pointsAwarded?: unknown };
  assert(typeof outcome.submission?.status === "string" && typeof outcome.pointsAwarded === "number");
  return { submission: { status: outcome.submission.status }, pointsAwarded: outcome.pointsAwarded };
}

async function proofCount(missionId: string) {
  const rows = await database
    .select({ id: onchainActionProofs.id })
    .from(onchainActionProofs)
    .where(eq(onchainActionProofs.missionId, missionId));
  return rows.length;
}

async function verify() {
  const tag = randomUUID().slice(0, 6);
  await setupProbe(tag);
  const alice = await createUser(`activation-alice-${tag}`);
  const bob = await createUser(`activation-bob-${tag}`);
  const carol = await createUser(`activation-carol-${tag}`);

  // Hash normalization.
  assert.equal(normalizeTransactionHash(HASH("a").toUpperCase()), HASH("a"));
  assert.equal(normalizeTransactionHash("short"), null);
  assert.equal(normalizeTransactionHash(null), null);

  // Signed-out proof rejected through the real submission path.
  await expectCode(submitMission(probeMissionId, { transactionHash: HASH("a") }, null), "unauthenticated");

  // Malformed hash rejected before any Horizon request.
  horizonDown = true;
  const malformed = await submitOnchainProof({
    missionId: probeMissionId,
    userId: alice,
    walletPublicKey: WALLET_A,
    transactionHash: "not-a-hash",
    fetchJson: mockFetchJson,
  }).catch((error: unknown) => error);
  horizonDown = false;
  assert(malformed instanceof MissionActionError && malformed.code === "invalid-request");

  // Missing transaction.
  scenario = { tx: null, ops: [] };
  let outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
    transactionHash: HASH("b"), fetchJson: mockFetchJson,
  });
  assert.equal(outcome.submission.status, "needs_revision");
  assert.equal(outcome.pointsAwarded, 0);
  assert.match(outcome.message, /not found/);

  // Failed transaction.
  scenario = { tx: txFixture(WALLET_A, CREATED_AFTER, false), ops: [paymentOp()] };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
    transactionHash: HASH("c"), fetchJson: mockFetchJson,
  });
  assert.equal(outcome.submission.status, "needs_revision");
  assert.match(outcome.message, /did not succeed/);

  // Wrong asset code, wrong issuer, native XLM.
  for (const [label, op] of [
    ["code", paymentOp({ asset_code: "EURC" })],
    ["issuer", paymentOp({ asset_issuer: OTHER_ISSUER })],
    ["native", { type: "payment", source_account: WALLET_A, to: WALLET_B, asset_type: "native", amount: "5.0000000" }],
  ] as const) {
    scenario = { tx: txFixture(WALLET_A, CREATED_AFTER), ops: [op] };
    outcome = await submitOnchainProof({
      missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
      transactionHash: HASH("d"), fetchJson: mockFetchJson,
    });
    assert.equal(outcome.submission.status, "needs_revision", `wrong-asset case ${label}`);
    assert.match(outcome.message, /wrong asset/i, `wrong-asset case ${label}`);
  }

  // Amount below minimum (exact decimal comparison, no floats).
  scenario = { tx: txFixture(WALLET_A, CREATED_AFTER), ops: [paymentOp({ amount: "0.9999999" })] };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
    transactionHash: HASH("e"), fetchJson: mockFetchJson,
  });
  assert.match(outcome.message, /below.*minimum/i);

  // Self-transfer is not a real transfer.
  scenario = {
    tx: txFixture(WALLET_A, CREATED_AFTER),
    ops: [paymentOp({ to: WALLET_A })],
  };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
    transactionHash: HASH("f"), fetchJson: mockFetchJson,
  });
  assert.match(outcome.message, /No qualifying USDC payment/);

  // Transaction predates the campaign boundary.
  scenario = { tx: txFixture(WALLET_A, CREATED_BEFORE), ops: [paymentOp()] };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
    transactionHash: HASH("1"), fetchJson: mockFetchJson,
  });
  assert.match(outcome.message, /predates/);

  // Operation-level source override: tx source matches the session wallet,
  // but the payment operation names someone else — must still reject.
  scenario = {
    tx: txFixture(WALLET_B, CREATED_AFTER),
    ops: [paymentOp({ source_account: WALLET_A })],
  };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: bob, walletPublicKey: WALLET_B,
    transactionHash: HASH("2"), fetchJson: mockFetchJson,
  });
  assert.equal(outcome.submission.status, "needs_revision");
  assert.match(outcome.message, /not sent from the wallet/);

  // Spoofing another wallet's payment is rejected.
  scenario = { tx: txFixture(WALLET_A, CREATED_AFTER), ops: [paymentOp()] };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: bob, walletPublicKey: WALLET_B,
    transactionHash: HASH("3"), fetchJson: mockFetchJson,
  });
  assert.match(outcome.message, /not sent from the wallet/);

  // Qualifying payment need not be operation #1; the used index is persisted.
  scenario = {
    tx: txFixture(WALLET_A, CREATED_AFTER),
    ops: [
      { type: "manage_data", source_account: WALLET_A },
      { type: "payment", source_account: WALLET_A, to: WALLET_B, asset_type: "native", amount: "1.0000000" },
      paymentOp(),
    ],
  };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: alice, walletPublicKey: WALLET_A,
    transactionHash: HASH("4"), fetchJson: mockFetchJson,
  });
  assert.equal(outcome.submission.status, "approved");
  assert.equal(outcome.pointsAwarded, 250);
  const [proof] = await database
    .select()
    .from(onchainActionProofs)
    .where(
      and(
        eq(onchainActionProofs.missionId, probeMissionId),
        eq(onchainActionProofs.transactionHash, HASH("4")),
      ),
    )
    .limit(1);
  assert(proof, "Proof row must persist.");
  assert.equal(proof.operationIndex, 2);
  assert.equal(proof.sourceAccount, WALLET_A);
  assert.equal(proof.destinationAccount, WALLET_B);
  assert.equal(proof.amount, "2.5000000");

  // Reward eligibility follows the existing path: approved submission plus a
  // configured mission reward — the same preconditions the claim flow checks.
  const [rewardMission] = await database
    .select({ rewardAsset: missions.rewardAsset, rewardAmount: missions.rewardAmount })
    .from(missions)
    .where(eq(missions.id, probeMissionId))
    .limit(1);
  assert.equal(rewardMission?.rewardAsset, "XLM");
  assert.equal(rewardMission?.rewardAmount, "0.0500000");

  // Same proof cannot be reused — even by a different user.
  scenario = {
    tx: txFixture(WALLET_B, CREATED_AFTER),
    ops: [paymentOp({ source_account: WALLET_B, to: WALLET_A })],
  };
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: bob, walletPublicKey: WALLET_B,
    transactionHash: HASH("4"), fetchJson: mockFetchJson,
  });
  assert.equal(outcome.pointsAwarded, 0);
  assert.match(outcome.message, /already been used/);
  assert.equal(await proofCount(probeMissionId), 1);

  // Concurrent duplicates cannot double-award: exactly one approval, one proof,
  // and 250 points awarded in total across both racers.
  scenario = {
    tx: txFixture(WALLET_A, CREATED_AFTER),
    ops: [paymentOp()],
  };
  const [r1, r2] = await Promise.all([
    submitOnchainProof({
      missionId: probeMissionId, userId: bob, walletPublicKey: WALLET_A,
      transactionHash: HASH("5"), fetchJson: mockFetchJson,
    }).catch((error: unknown) => error),
    submitOnchainProof({
      missionId: probeMissionId, userId: carol, walletPublicKey: WALLET_A,
      transactionHash: HASH("5"), fetchJson: mockFetchJson,
    }).catch((error: unknown) => error),
  ]);
  assert(!(r1 instanceof Error) && !(r2 instanceof Error), "Racers must resolve with outcomes.");
  const racerApprovals = [asOutcome(r1), asOutcome(r2)].filter(
    (result) => result.submission.status === "approved",
  );
  assert.equal(racerApprovals.length, 1, "Exactly one concurrent approval.");
  assert.equal(
    asOutcome(r1).pointsAwarded + asOutcome(r2).pointsAwarded,
    250,
    "Points awarded exactly once across racers.",
  );
  const hashProofs = await database
    .select({ id: onchainActionProofs.id })
    .from(onchainActionProofs)
    .where(
      and(
        eq(onchainActionProofs.missionId, probeMissionId),
        eq(onchainActionProofs.transactionHash, HASH("5")),
      ),
    );
  assert.equal(hashProofs.length, 1, "Exactly one proof row per hash.");

  // Horizon unavailable → retryable, never a rejection, never points.
  // Uses a fresh user: either racer may have won the approval above, and an
  // approved user cannot resubmit (allow-revision covers needs_revision only).
  horizonDown = true;
  scenario = null;
  const dave = await createUser(`activation-dave-${tag}`);
  outcome = await submitOnchainProof({
    missionId: probeMissionId, userId: dave, walletPublicKey: WALLET_A,
    transactionHash: HASH("6"), fetchJson: mockFetchJson,
  });
  horizonDown = false;
  assert.equal(outcome.submission.status, "needs_revision");
  assert.equal(outcome.pointsAwarded, 0);
  assert.match(outcome.message, /temporarily unavailable/);

  // Circle mission/capability relation scoped correctly.
  const links = await getActivationMissionLinks(probeCircleId);
  assert(links.has("send"), "Probe Send capability must link its activation mission.");
  const [stellarSend] = await database
    .select({ id: assetCapabilities.id })
    .from(assetCapabilities)
    .innerJoin(circles, eq(assetCapabilities.circleId, circles.id))
    .where(and(eq(circles.slug, "usdc-on-stellar"), eq(assetCapabilities.capabilityType, "send")))
    .limit(1);
  assert(stellarSend, "Real USDC Stellar Send capability must exist.");
  await database
    .update(missions)
    .set({ assetCapabilityId: stellarSend.id })
    .where(eq(missions.id, probeMissionId));
  scenario = { tx: txFixture(WALLET_A, CREATED_AFTER), ops: [paymentOp()] };
  await expectCode(
    submitOnchainProof({
      missionId: probeMissionId, userId: dave, walletPublicKey: WALLET_A,
      transactionHash: HASH("7"), fetchJson: mockFetchJson,
    }),
    "unsupported-mission",
  );

  // Public profile never leaks proof details.
  const profile = await getPublicProfileByHandle(`activation-alice-${tag}`);
  assert(profile, "Alice's public profile must resolve.");
  const serialized = JSON.stringify(profile);
  assert(!serialized.includes(HASH("4")), "Transaction hash must not leak publicly.");
  assert(!serialized.includes(WALLET_A), "Wallet address must not leak publicly.");

  // Circle surface carries the open activation mission.
  const circle = await getCircleBySlug(`activation-probe-${tag}`);
  assert(circle?.missions.some((mission) => mission.id === probeMissionId), "Probe mission must list on its Circle.");

  console.log("Activation verification passed", {
    signedOutRejected: true,
    spoofRejected: true,
    malformedRejected: true,
    missingRejected: true,
    failedRejected: true,
    wrongAssetRejected: true,
    wrongIssuerRejected: true,
    nativeRejected: true,
    belowMinimumRejected: true,
    selfTransferRejected: true,
    predatesRejected: true,
    opSourceOverride: true,
    nonFirstOperation: true,
    reuseBlocked: true,
    concurrencySafe: true,
    approvedOnce: true,
    pointsOnce: true,
    rewardEligible: true,
    horizonRetryable: true,
    profileSafe: true,
    relationScoped: true,
  });
}

verify()
  .catch((error) => {
    console.error("Activation verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
