import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Keypair } from "@stellar/stellar-sdk";
import { missionSubmissions, missions, rewardClaims, stellarWallets, users } from "../src/db/schema";
import type { AuthenticatedSession } from "../src/lib/auth/session";
import { assertMainnetRewardsEnabled, normalizeXlmAmount } from "../src/lib/rewards/config-core";
import { RewardActionError, RewardSettlementError } from "../src/lib/rewards/errors";
import { claimRewardForSession, requireRewardSession } from "../src/lib/rewards/service";
import type { ConfirmedRewardSettlement, RewardSettlementClaim } from "../src/lib/rewards/settlement";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const database = drizzle(neon(databaseUrl));
const rewardMissionId = "00000000-0000-0000-0000-000000000401";
const noRewardMissionId = "00000000-0000-0000-0000-000000000402";
const temporaryUserIds: string[] = [];
const temporaryWalletIds: string[] = [];

function createSession(userId: string, handle: string, walletId: string, publicKey: string): AuthenticatedSession {
  return {
    sessionId: randomUUID(),
    user: { id: userId, handle, displayName: "Reward test member", avatarUrl: null, role: "member" },
    wallet: { id: walletId, network: "mainnet", publicKey, verifiedAt: new Date() },
    expiresAt: new Date(Date.now() + 60_000),
  };
}

async function createParticipant() {
  const userId = randomUUID();
  const walletId = randomUUID();
  const keypair = Keypair.random();
  const handle = `reward-verify-${userId.slice(0, 8)}`;
  temporaryUserIds.push(userId);
  temporaryWalletIds.push(walletId);

  await database.insert(users).values({
    id: userId,
    handle,
    displayName: "Reward test member",
    avatarUrl: null,
    role: "member",
  });
  await database.insert(stellarWallets).values({
    id: walletId,
    userId,
    network: "mainnet",
    publicKey: keypair.publicKey(),
  });

  return { userId, walletId, handle, publicKey: keypair.publicKey() };
}

async function createSubmission(userId: string, missionId: string, status: string) {
  const submissionId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: submissionId,
    missionId,
    userId,
    content: "Reward verification fixture.",
    evidenceUrl: null,
    score: status === "approved" ? 4 : null,
    status,
    reviewedBy: null,
    reviewedAt: status === "approved" ? new Date() : null,
    revisionReason: null,
  });
  return submissionId;
}

async function expectActionCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    assert.fail(`Expected reward action ${code} to fail.`);
  } catch (error) {
    assert(error instanceof RewardActionError);
    assert.equal(error.code, code);
  }
}

async function cleanup() {
  if (temporaryUserIds.length === 0) return;
  await database.delete(rewardClaims).where(inArray(rewardClaims.userId, temporaryUserIds));
  await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds));
  await database.delete(stellarWallets).where(inArray(stellarWallets.id, temporaryWalletIds));
  await database.delete(users).where(inArray(users.id, temporaryUserIds));
}

async function verify() {
  const [rewardMission] = await database.select().from(missions).where(eq(missions.id, rewardMissionId)).limit(1);
  const [noRewardMission] = await database.select().from(missions).where(eq(missions.id, noRewardMissionId)).limit(1);
  assert.equal(rewardMission?.rewardAsset, "XLM", "The additive migration must configure the demo XLM reward.");
  assert.equal(normalizeXlmAmount(String(rewardMission?.rewardAmount)), "0.1", "The demo XLM reward must be 0.1 XLM.");
  assert.equal(noRewardMission?.rewardAsset, null, "The no-reward mission fixture must remain reward-free.");
  await expectActionCode(async () => requireRewardSession(null), "unauthenticated");

  const approvedParticipant = await createParticipant();
  const approvedSubmissionId = await createSubmission(approvedParticipant.userId, rewardMissionId, "approved");
  const approvedSession = createSession(
    approvedParticipant.userId,
    approvedParticipant.handle,
    approvedParticipant.walletId,
    approvedParticipant.publicKey,
  );
  let settlementCalls = 0;
  const fakeSettlement = async (claim: RewardSettlementClaim): Promise<ConfirmedRewardSettlement> => {
    settlementCalls += 1;
    assert.equal(claim.amount, "0.1");
    assert.equal(claim.destinationPublicKey, approvedParticipant.publicKey);
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { transactionHash: `test-reward-${approvedSubmissionId}`, ledger: 42, confirmedAt: new Date() };
  };

  const [firstClaim, secondClaim] = await Promise.all([
    claimRewardForSession(approvedSubmissionId, approvedSession, { settle: fakeSettlement }),
    claimRewardForSession(approvedSubmissionId, approvedSession, { settle: fakeSettlement }),
  ]);
  assert.equal(settlementCalls, 1, "Concurrent claim requests must settle only once.");
  assert(["submitted", "confirmed"].includes(firstClaim.status));
  assert(["submitted", "confirmed"].includes(secondClaim.status));
  const confirmedClaim = await claimRewardForSession(approvedSubmissionId, approvedSession, { settle: fakeSettlement });
  assert.equal(confirmedClaim.status, "confirmed");
  assert.equal(settlementCalls, 1, "A confirmed reward must not be paid again.");
  assert.equal(confirmedClaim.amount, "0.1", "The client cannot override the configured amount.");
  assert.equal(confirmedClaim.destinationPublicKey, approvedParticipant.publicKey, "The client cannot redirect the destination.");

  const secondWallet = await createParticipant();
  const wrongWalletSession = createSession(
    approvedParticipant.userId,
    approvedParticipant.handle,
    secondWallet.walletId,
    secondWallet.publicKey,
  );
  temporaryUserIds.pop();
  temporaryWalletIds.pop();
  await database.delete(users).where(eq(users.id, secondWallet.userId));
  await expectActionCode(
    () => claimRewardForSession(approvedSubmissionId, wrongWalletSession, { settle: fakeSettlement }),
    "wallet-mismatch",
  );

  const wrongUser = await createParticipant();
  const wrongUserSession = createSession(wrongUser.userId, wrongUser.handle, wrongUser.walletId, wrongUser.publicKey);
  await expectActionCode(
    () => claimRewardForSession(approvedSubmissionId, wrongUserSession, { settle: fakeSettlement }),
    "not-found",
  );

  const unapprovedParticipant = await createParticipant();
  const unapprovedSubmissionId = await createSubmission(unapprovedParticipant.userId, rewardMissionId, "pending");
  const unapprovedSession = createSession(
    unapprovedParticipant.userId,
    unapprovedParticipant.handle,
    unapprovedParticipant.walletId,
    unapprovedParticipant.publicKey,
  );
  await expectActionCode(
    () => claimRewardForSession(unapprovedSubmissionId, unapprovedSession, { settle: fakeSettlement }),
    "not-eligible",
  );

  const noRewardParticipant = await createParticipant();
  const noRewardSubmissionId = await createSubmission(noRewardParticipant.userId, noRewardMissionId, "approved");
  const noRewardSession = createSession(
    noRewardParticipant.userId,
    noRewardParticipant.handle,
    noRewardParticipant.walletId,
    noRewardParticipant.publicKey,
  );
  await expectActionCode(
    () => claimRewardForSession(noRewardSubmissionId, noRewardSession, { settle: fakeSettlement }),
    "not-eligible",
  );

  const failedParticipant = await createParticipant();
  const failedSubmissionId = await createSubmission(failedParticipant.userId, rewardMissionId, "approved");
  const failedSession = createSession(
    failedParticipant.userId,
    failedParticipant.handle,
    failedParticipant.walletId,
    failedParticipant.publicKey,
  );
  const failedClaim = await claimRewardForSession(failedSubmissionId, failedSession, {
    settle: async () => {
      throw new RewardSettlementError("destination_not_ready", "This Stellar address is not active on Testnet yet.");
    },
  });
  assert.equal(failedClaim.status, "failed");
  assert.equal(failedClaim.failureCode, "destination_not_ready");
  const [storedFailure] = await database.select().from(rewardClaims).where(eq(rewardClaims.missionSubmissionId, failedSubmissionId));
  assert.equal(storedFailure?.status, "failed");

  const originalEnvironment = { ...process.env };
  try {
    const mainnetEnvironment = {
      ...process.env,
      VICUS_REWARD_NETWORK: "public",
      VICUS_ENABLE_MAINNET_REWARDS: "false",
    };
    assert.throws(
      () => assertMainnetRewardsEnabled(mainnetEnvironment),
      /public-network rewards are disabled/,
    );
  } finally {
    for (const key of ["VICUS_REWARD_NETWORK", "VICUS_ENABLE_MAINNET_REWARDS"]) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
  }

  console.log("Reward verification passed", {
    eligibilityGuards: true,
    unauthenticatedGuard: true,
    amountAndDestinationServerDerived: true,
    concurrentClaimsSingleSettlement: true,
    confirmedClaimIdempotent: true,
    failedStateDurable: true,
    mainnetSafetyGate: true,
    realNetworkSubmission: false,
  });
}

verify()
  .catch((error) => {
    console.error("Reward verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
