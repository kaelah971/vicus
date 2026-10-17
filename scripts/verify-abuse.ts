import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray, like, ne } from "drizzle-orm";
import { Keypair } from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import {
  abuseRateLimits,
  assetTransfers,
  campaignCompletions,
  campaigns,
  circles,
  missionSubmissions,
  missions,
  rewardClaims,
  stellarWallets,
  users,
} from "../src/db/schema";
import type { AuthenticatedSession } from "../src/lib/auth/session";
import { consumeAbuseQuota } from "../src/lib/abuse/rate-limit";
import { submitMission, reviewMissionSubmission } from "../src/lib/missions/service";
import { MissionActionError } from "../src/lib/missions/errors";
import { claimRewardForSession } from "../src/lib/rewards/service";
import { RewardActionError } from "../src/lib/rewards/errors";
import type { ConfirmedRewardSettlement } from "../src/lib/rewards/settlement";
import {
  CampaignActionError,
  claimCampaignReward,
  createCampaign,
} from "../src/lib/campaigns/service";
import type { CampaignHorizonTransaction } from "../src/lib/campaigns/settlement";
import { CAMPAIGN_REWARD_ISSUER } from "../src/lib/campaigns/config";
import { getAdminSubmissionQueue } from "../src/lib/data/missions";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryWalletIds: string[] = [];
const temporaryCampaignIds: string[] = [];

const BENJI_ISSUER = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
const USDC_ISSUER = CAMPAIGN_REWARD_ISSUER;
const REWARD_MISSION = "00000000-0000-0000-0000-000000000401";
const distributor = Keypair.random();
const TREASURY = distributor.publicKey();
const TEST_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  VICUS_CAMPAIGN_DISTRIBUTOR_SECRET: distributor.secret(),
  VICUS_CAMPAIGN_MAX_USDC: "1000",
};

function txHash(): string {
  return (randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")).slice(0, 64);
}

function mockHorizon(dest: string) {
  const transactions = new Map<string, CampaignHorizonTransaction>();
  const fundDest = (address: string) => {
    transactions.set(`fund-${address}`, {
      hash: "c".repeat(64), ledger: 100, successful: true, createdAt: new Date().toISOString(), operations: [],
    });
  };
  return {
    fundDest,
    async loadAccount(address: string) {
      if (address === TREASURY) return { sequence: "100", balances: [{ assetType: "native", balance: "100" }] };
      if (address === dest) {
        return {
          sequence: "50",
          balances: [
            { assetType: "native", balance: "10" },
            { assetType: "credit_alphanum4", assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "0", authorized: true },
          ],
        };
      }
      return null;
    },
    async submitTransaction() {
      const hash = txHash();
      transactions.set(hash, { hash, ledger: 999, successful: true, createdAt: new Date().toISOString(), operations: [] });
      return { hash, ledger: 999 };
    },
    async getTransaction(hash: string) {
      return transactions.get(hash.toLowerCase()) ?? null;
    },
  };
}

async function createUser(handle: string, role = "member") {
  const id = randomUUID();
  const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
  await database.insert(users).values({ id, handle: uniqueHandle, displayName: uniqueHandle, avatarUrl: null, role });
  temporaryUserIds.push(id);
  return { id, handle: uniqueHandle };
}

async function circleId(slug: string): Promise<string> {
  const [row] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, slug)).limit(1);
  assert.ok(row, `${slug} seeded`);
  return row!.id;
}

async function proofTransfer(ownerId: string, dest: string, circle: string): Promise<string> {
  const id = randomUUID();
  await database.insert(assetTransfers).values({
    id, senderUserId: ownerId, network: "stellar_mainnet", circleId: circle,
    assetCode: "BENJI", assetIssuer: BENJI_ISSUER, amount: "5.0000000",
    destinationAddress: dest, status: "confirmed", transactionHash: txHash(), ledger: 111, confirmedAt: new Date(),
  });
  return id;
}

function rewardSession(userId: string, handle: string, walletId: string, publicKey: string): AuthenticatedSession {
  return {
    sessionId: randomUUID(),
    user: { id: userId, handle, displayName: "Abuse tester", avatarUrl: null, role: "member" },
    wallet: { id: walletId, network: "mainnet", publicKey, verifiedAt: new Date() },
    expiresAt: new Date(Date.now() + 60_000),
  };
}

async function cleanup() {
  if (temporaryCampaignIds.length > 0) {
    await database.delete(campaignCompletions).where(inArray(campaignCompletions.campaignId, temporaryCampaignIds)).catch(() => undefined);
    await database.delete(campaigns).where(inArray(campaigns.id, temporaryCampaignIds)).catch(() => undefined);
  }
  await database.delete(assetTransfers).where(inArray(assetTransfers.senderUserId, temporaryUserIds)).catch(() => undefined);
  await database.delete(rewardClaims).where(inArray(rewardClaims.userId, temporaryUserIds)).catch(() => undefined);
  await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds)).catch(() => undefined);
  await database.delete(stellarWallets).where(inArray(stellarWallets.id, temporaryWalletIds)).catch(() => undefined);
  await database.delete(users).where(inArray(users.id, temporaryUserIds)).catch(() => undefined);
  await database.delete(abuseRateLimits).where(like(abuseRateLimits.bucketKey, "p62:%")).catch(() => undefined);
}

async function expectCode(promise: Promise<unknown>, code: string, label: string) {
  await promise.then(
    () => assert.fail(`${label}: expected rejection`),
    (error: unknown) => {
      const actual =
        error instanceof CampaignActionError || error instanceof MissionActionError || error instanceof RewardActionError
          ? error.code
          : `unexpected:${String(error).slice(0, 80)}`;
      assert.equal(actual, code, `${label}: expected ${code}, got ${actual}`);
    },
  );
}

async function main() {
  const benji = await circleId("benji-on-stellar");
  const usdc = await circleId("usdc-on-stellar");
  const admin = await createUser("abuse-admin", "admin");
  const alice = await createUser("abuse-alice");
  const bob = await createUser("abuse-bob");
  const DEST = Keypair.random().publicKey();
  const horizon = mockHorizon(DEST);
  horizon.fundDest(DEST);

  // 1. Limiter unit: allow-to-limit, block past it, isolate buckets, recover.
  const u = randomUUID();
  for (let i = 0; i < 3; i++) {
    const r = await consumeAbuseQuota({ scope: "mission-submit", userId: u, qualifier: "q1", limit: 3, windowMs: 60_000 });
    assert.equal(r.allowed, true, `attempt ${i + 1} allowed`);
    assert.equal(r.remaining, 2 - i, "remaining counts down");
  }
  const blocked = await consumeAbuseQuota({ scope: "mission-submit", userId: u, qualifier: "q1", limit: 3, windowMs: 60_000 });
  assert.equal(blocked.allowed, false, "4th attempt throttled");
  assert.ok(blocked.retryAfterMs > 0, "retry hint present, nothing else touched");
  const isolated = await consumeAbuseQuota({ scope: "mission-submit", userId: u, qualifier: "q2", limit: 3, windowMs: 60_000 });
  assert.equal(isolated.allowed, true, "different qualifier is a different bucket (shared-IP-safe keying)");
  const recovered = await consumeAbuseQuota({ scope: "mission-submit", userId: u, qualifier: "q1", limit: 3, windowMs: 60_000, now: Date.now() + 61_000 });
  assert.equal(recovered.allowed, true, "quota recovers after the window rolls");

  // 2. Service enforcement: pre-filled buckets reject before any side effect.
  for (const [scope, user, qualifier] of [["mission-submit", alice.id, REWARD_MISSION]] as const) {
    for (let i = 0; i < 30; i++) {
      await consumeAbuseQuota({ scope, userId: user, qualifier });
    }
  }
  await expectCode(submitMission(REWARD_MISSION, {}, alice.id), "rate-limited", "submit throttled pre-validation");
  const throttleCampaign = await createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Throttle probe", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  temporaryCampaignIds.push(throttleCampaign.id);
  const throttleQualifier = throttleCampaign.id;
  for (let i = 0; i < 30; i++) {
    await consumeAbuseQuota({ scope: "campaign-claim", userId: alice.id, qualifier: throttleQualifier });
  }
  await expectCode(
    claimCampaignReward(throttleCampaign.id, alice.id, DEST, { kind: "send", id: randomUUID() }, horizon, TEST_ENV),
    "rate-limited",
    "claim throttled before reservation",
  );
  const throttleRows = await database
    .select()
    .from(campaignCompletions)
    .where(eq(campaignCompletions.campaignId, throttleCampaign.id));
  assert.equal(throttleRows.length, 0, "throttled claim reserves nothing");
  const rewardProbeSubmission = randomUUID();
  for (let i = 0; i < 30; i++) {
    await consumeAbuseQuota({ scope: "reward-claim", userId: alice.id, qualifier: rewardProbeSubmission });
  }
  await expectCode(
    claimRewardForSession(rewardProbeSubmission, rewardSession(alice.id, alice.handle, randomUUID(), Keypair.random().publicKey())),
    "rate-limited",
    "reward claim throttled pre-read",
  );

  // 2b. Counting: 30 invalid attempts exhaust, 31st throttles (same bucket).
  const counting = await createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Counting probe", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  temporaryCampaignIds.push(counting.id);
  await database.update(campaigns).set({ status: "active", fundedAmount: "10.0000000" }).where(eq(campaigns.id, counting.id));
  for (let i = 0; i < 30; i++) {
    await expectCode(
      claimCampaignReward(counting.id, bob.id, DEST, { kind: "send", id: randomUUID() }, horizon, TEST_ENV),
      "proof-invalid",
      `invalid attempt ${i + 1} rejected on merit`,
    );
  }
  await expectCode(
    claimCampaignReward(counting.id, bob.id, DEST, { kind: "send", id: randomUUID() }, horizon, TEST_ENV),
    "rate-limited",
    "31st attempt throttled",
  );

  // 3. Legit mission claim pays; same-campaign retry idempotent; cross-campaign reuse rejected.
  const [anyMission] = await database
    .select({ id: missions.id, slug: circles.slug })
    .from(missions)
    .innerJoin(circles, eq(missions.circleId, circles.id))
    .limit(1);
  assert.ok(anyMission, "seeded mission with circle");
  const missionCircleSlug = anyMission!.slug;
  const missionCampaignA = await createCampaign(
    admin.id,
    { circleSlug: missionCircleSlug, objective: "Mission pool A", targetAction: "mission", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  const missionCampaignB = await createCampaign(
    admin.id,
    { circleSlug: missionCircleSlug, objective: "Mission pool B", targetAction: "mission", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  temporaryCampaignIds.push(missionCampaignA.id, missionCampaignB.id);
  for (const c of [missionCampaignA, missionCampaignB]) {
    // Backdate the window start: the Neon server clock runs ahead of the
    // app clock (~300ms observed), so app-stamped proof times would
    // otherwise fall microseconds before DB-stamped campaign creation.
    await database.update(campaigns).set({ status: "active", fundedAmount: "10.0000000", createdAt: new Date(Date.now() - 3_600_000) }).where(eq(campaigns.id, c.id));
  }
  const approvalId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: approvalId, missionId: anyMission!.id, userId: alice.id,
    content: "Abuse fixture approval.", evidenceUrl: null, score: 5, status: "approved",
    reviewedBy: admin.id, reviewedAt: new Date(), revisionReason: null,
  });
  const paidA = await claimCampaignReward(missionCampaignA.id, alice.id, DEST, { kind: "mission", id: approvalId }, horizon, TEST_ENV);
  assert.equal(paidA.status, "paid", "legit mission proof pays (approved-flow regression)");
  const repaidA = await claimCampaignReward(missionCampaignA.id, alice.id, DEST, { kind: "mission", id: approvalId }, horizon, TEST_ENV);
  assert.equal(repaidA.id, paidA.id, "same-campaign retry resumes the same completion");
  await expectCode(
    claimCampaignReward(missionCampaignB.id, alice.id, DEST, { kind: "mission", id: approvalId }, horizon, TEST_ENV),
    "proof-reused",
    "one proof cannot earn two campaign rewards",
  );
  const bRows = await database
    .select()
    .from(campaignCompletions)
    .where(eq(campaignCompletions.campaignId, missionCampaignB.id));
  assert.equal(bRows.length, 0, "reused-proof rejection reserves and pays nothing");

  // 4. Forged, wrong-campaign, and expired proofs rejected on merit.
  const sendCampaign = await createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Merit probe", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  temporaryCampaignIds.push(sendCampaign.id);
  await database.update(campaigns).set({ status: "active", fundedAmount: "10.0000000", createdAt: new Date(Date.now() - 3_600_000) }).where(eq(campaigns.id, sendCampaign.id));
  const bobsProof = await proofTransfer(bob.id, DEST, benji);
  await expectCode(
    claimCampaignReward(sendCampaign.id, alice.id, DEST, { kind: "send", id: bobsProof }, horizon, TEST_ENV),
    "proof-invalid",
    "another user's receipt is forged for this claimant",
  );
  const wrongCircleProof = await proofTransfer(alice.id, DEST, usdc);
  await expectCode(
    claimCampaignReward(sendCampaign.id, alice.id, DEST, { kind: "send", id: wrongCircleProof }, horizon, TEST_ENV),
    "proof-invalid",
    "wrong-campaign reference rejected",
  );
  await database.update(campaigns).set({ endsAt: new Date(Date.now() - 60_000) }).where(eq(campaigns.id, sendCampaign.id));
  const staleProof = await proofTransfer(alice.id, DEST, benji);
  await expectCode(
    claimCampaignReward(sendCampaign.id, alice.id, DEST, { kind: "send", id: staleProof }, horizon, TEST_ENV),
    "proof-invalid",
    "post-window participation ineligible",
  );

  // 5. Reviewer authorization + decision persistence.
  const pendingId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: pendingId, missionId: anyMission!.id, userId: bob.id,
    content: "Abuse fixture pending.", evidenceUrl: null, score: null, status: "pending",
    reviewedBy: null, reviewedAt: null, revisionReason: null,
  });
  await expectCode(reviewMissionSubmission(pendingId, "approved", null, bob.id), "forbidden", "non-admin cannot review");
  const decided = await reviewMissionSubmission(pendingId, "approved", null, admin.id);
  assert.equal(decided.submission.status, "approved", "admin approval applies");
  const [persisted] = await database.select().from(missionSubmissions).where(eq(missionSubmissions.id, pendingId)).limit(1);
  assert.equal(persisted!.reviewedBy, admin.id, "reviewer recorded");
  assert.ok(persisted!.reviewedAt, "review timestamp recorded");
  await expectCode(reviewMissionSubmission(pendingId, "rejected", "x", admin.id), "invalid-transition", "decided cases stay decided");

  // 6. Duplicate-evidence annotation (advisory, never auto-reject).
  const eve = await createUser("abuse-eve");
  const frank = await createUser("abuse-frank");
  const sharedUrl = `https://example.com/abuse-fixture-${randomUUID().slice(0, 8)}`;
  for (const user of [eve, frank]) {
    await database.insert(missionSubmissions).values({
      id: randomUUID(), missionId: anyMission!.id, userId: user.id,
      content: "Shared-source fixture.", evidenceUrl: sharedUrl, score: null, status: "pending",
      reviewedBy: null, reviewedAt: null, revisionReason: null,
    });
  }
  const queue = await getAdminSubmissionQueue({ missionId: anyMission!.id });
  const shared = queue.filter((entry) => entry.evidenceUrl === sharedUrl);
  assert.equal(shared.length, 2, "both sharers listed");
  assert.ok(shared.every((entry) => (entry.duplicateEvidenceCount ?? 0) >= 1), "reviewer sees the shared-source flag");
  const solo = queue.filter((entry) => entry.evidenceUrl === null);
  assert.ok(solo.every((entry) => (entry.duplicateEvidenceCount ?? 0) === 0), "null evidence never counts");

  // 7. Cross-user isolation + single settlement on the reward path.
  const carol = await createUser("abuse-carol");
  const carolKeys = Keypair.random();
  const carolWallet = randomUUID();
  temporaryWalletIds.push(carolWallet);
  await database.insert(stellarWallets).values({ id: carolWallet, userId: carol.id, network: "mainnet", publicKey: carolKeys.publicKey() });
  const carolSubmission = randomUUID();
  await database.insert(missionSubmissions).values({
    id: carolSubmission, missionId: REWARD_MISSION, userId: carol.id,
    content: "Isolation fixture.", evidenceUrl: null, score: 4, status: "approved",
    reviewedBy: null, reviewedAt: new Date(), revisionReason: null,
  });
  const carolSession = rewardSession(carol.id, carol.handle, carolWallet, carolKeys.publicKey());
  const dave = await createUser("abuse-dave");
  const daveSession = rewardSession(dave.id, dave.handle, randomUUID(), Keypair.random().publicKey());
  await expectCode(claimRewardForSession(carolSubmission, daveSession), "not-found", "stranger cannot touch another user's reward");
  let settlements = 0;
  const fakeSettle = async (): Promise<ConfirmedRewardSettlement> => {
    settlements += 1;
    return { transactionHash: `ab${carolSubmission.replace(/-/g, "").slice(0, 62)}`, ledger: 42, confirmedAt: new Date() };
  };
  const first = await claimRewardForSession(carolSubmission, carolSession, { settle: fakeSettle });
  const second = await claimRewardForSession(carolSubmission, carolSession, { settle: fakeSettle });
  assert.equal(first.id, second.id, "repeat claims converge on one receipt");
  assert.equal(settlements, 1, "exactly one settlement across repeats");
  assert.equal(second.status, "confirmed", "UNKNOWN never escalates without settlement");

  // 8. Reuse guard leaves other campaigns' ledgers untouched.
  const otherCompletions = await database
    .select()
    .from(campaignCompletions)
    .where(and(eq(campaignCompletions.proofId, approvalId), ne(campaignCompletions.campaignId, missionCampaignA.id)));
  assert.equal(otherCompletions.length, 0, "no duplicate payout anywhere for the reused proof");

  console.log("abuse:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(cleanup);
