import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import {
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
import {
  claimRewardForSession,
} from "../src/lib/rewards/service";
import { RewardActionError } from "../src/lib/rewards/errors";
import type { ConfirmedRewardSettlement } from "../src/lib/rewards/settlement";
import {
  CampaignActionError,
  activateCampaign,
  claimCampaignReward,
  createCampaign,
  listMyCompletions,
  verifyCampaignFunding,
} from "../src/lib/campaigns/service";
import type { CampaignHorizon, CampaignHorizonTransaction } from "../src/lib/campaigns/settlement";
import { CAMPAIGN_REWARD_ISSUER } from "../src/lib/campaigns/config";
import { campaignReceipt } from "../src/lib/receipts/receipts";

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
const TEST_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  VICUS_CAMPAIGN_DISTRIBUTOR_SECRET: distributor.secret(),
  VICUS_CAMPAIGN_MAX_USDC: "1000",
};
const TREASURY = distributor.publicKey();

function txHash(): string {
  return (randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")).slice(0, 64);
}

function fundingTx(to: string, amount: string): CampaignHorizonTransaction {
  return {
    hash: "a".repeat(64),
    ledger: 100,
    successful: true,
    createdAt: new Date(Date.now() + 60_000).toISOString(),
    operations: [{ type: "payment", assetCode: "USDC", assetIssuer: USDC_ISSUER, destination: to, amount }],
  };
}

function mockCampaignHorizon() {
  const transactions = new Map<string, CampaignHorizonTransaction>();
  const submits: string[] = [];
  let failNext = false;
  let dropNext = false;
  const horizon: CampaignHorizon & {
    transactions: Map<string, CampaignHorizonTransaction>;
    submits: string[];
    failNextSubmit: () => void;
    failNextDrop: () => void;
  } = {
    transactions,
    submits,
    failNextSubmit: () => {
      failNext = true;
    },
    failNextDrop: () => {
      dropNext = true;
    },
    async loadAccount(address: string) {
      if (address === TREASURY) return { sequence: "100", balances: [{ assetType: "native", balance: "100" }] };
      const dest = (horizon as { destOverride?: { sequence: string; balances: { assetType: string; assetCode?: string; assetIssuer?: string; balance: string; authorized?: boolean }[] } }).destOverride;
      if (dest && address === (horizon as { destAddress?: string }).destAddress) return dest;
      return null;
    },
    async submitTransaction(signedXdr: string) {
      submits.push(signedXdr);
      const parsed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET) as unknown as { hash?: unknown };
      if (!parsed || typeof (parsed as { hash?: unknown }).hash !== "function") throw new Error("bad envelope");
      const hash = Buffer.from((parsed as unknown as { hash: () => Uint8Array }).hash()).toString("hex");
      if (dropNext) {
        dropNext = false;
        // Definitive rejection: nothing reaches the ledger.
        throw new Error("rejected by network");
      }
      transactions.set(hash, { hash, ledger: 999, successful: true, createdAt: new Date().toISOString(), operations: [] });
      if (failNext) {
        failNext = false;
        // Uncertain outcome: the ledger DID confirm (recovery must find it).
        throw new Error("timeout after submit");
      }
      return { hash, ledger: 999 };
    },
    async getTransaction(hash: string) {
      return transactions.get(hash.toLowerCase()) ?? null;
    },
  };
  return horizon;
}

function fundDest(horizon: ReturnType<typeof mockCampaignHorizon>, address: string) {
  (horizon as unknown as { destAddress?: string }).destAddress = address;
  (horizon as unknown as { destOverride?: unknown }).destOverride = {
    sequence: "50",
    balances: [
      { assetType: "native", balance: "10" },
      { assetType: "credit_alphanum4", assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "0", authorized: true },
    ],
  };
}

async function createUser(handle: string, role = "member") {
  const id = randomUUID();
  const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
  await database.insert(users).values({ id, handle: uniqueHandle, displayName: uniqueHandle, avatarUrl: null, role });
  temporaryUserIds.push(id);
  return { id, handle: uniqueHandle };
}

async function benjiCircleId(): Promise<string> {
  const [row] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "benji-on-stellar")).limit(1);
  assert.ok(row, "benji circle seeded");
  return row!.id;
}

async function proofTransfer(ownerId: string, dest: string, circleId: string): Promise<string> {
  const id = randomUUID();
  await database.insert(assetTransfers).values({
    id,
    senderUserId: ownerId,
    network: "stellar_mainnet",
    circleId,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "5.0000000",
    destinationAddress: dest,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 111,
    confirmedAt: new Date(),
  });
  return id;
}

function rewardSession(userId: string, handle: string, walletId: string, publicKey: string): AuthenticatedSession {
  return {
    sessionId: randomUUID(),
    user: { id: userId, handle, displayName: "Drops tester", avatarUrl: null, role: "member" },
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
}

async function main() {
  const benji = await benjiCircleId();

  // 1. Cross-user exhaustion race: budget covers exactly one payout.
  const admin = await createUser("drops-admin", "admin");
  const alice = await createUser("drops-alice");
  const bob = await createUser("drops-bob");
  const carol = await createUser("drops-carol");
  const horizon = mockCampaignHorizon();
  const DEST = Keypair.random().publicKey();
  fundDest(horizon, DEST);
  const race = await createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "One-payout race", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  temporaryCampaignIds.push(race.id);
  const fundHash = txHash();
  horizon.transactions.set(fundHash, { ...fundingTx(TREASURY, "1.0000000"), hash: fundHash });
  await verifyCampaignFunding(race.id, admin.id, fundHash, horizon);
  await activateCampaign(race.id, admin.id);
  const proofA = await proofTransfer(alice.id, DEST, benji);
  const proofB = await proofTransfer(bob.id, DEST, benji);
  const [ra, rb] = await Promise.all([
    claimCampaignReward(race.id, alice.id, DEST, { kind: "send", id: proofA }, horizon, TEST_ENV).catch((e: unknown) => e),
    claimCampaignReward(race.id, bob.id, DEST, { kind: "send", id: proofB }, horizon, TEST_ENV).catch((e: unknown) => e),
  ]);
  const paid = [ra, rb].filter((r) => !(r instanceof Error) && (r as { status?: string }).status === "paid");
  const rejected = [ra, rb].filter((r) => r instanceof Error);
  assert.equal(paid.length, 1, "exactly one payout winner");
  assert.equal(rejected.length, 1, "exactly one loser");
  assert.ok(
    rejected[0] instanceof CampaignActionError &&
      ["budget-exhausted", "invalid-transition"].includes((rejected[0] as CampaignActionError).code),
    "loser told the budget is gone, never silently dropped",
  );
  const [raceRow] = await database.select().from(campaigns).where(eq(campaigns.id, race.id)).limit(1);
  assert.equal(raceRow!.paidAmount, "1.0000000", "paid never exceeds funded");
  assert.equal(raceRow!.reservedAmount, "0.0000000", "loser reservation released");
  assert.equal(horizon.submits.length, 1, "exactly one payout submission");
  const winnerId = (paid[0] as { id: string }).id;
  // Campaign now exhausted: a third claim is blocked, not paid.
  const proofC = await proofTransfer(carol.id, DEST, benji);
  await claimCampaignReward(race.id, carol.id, DEST, { kind: "send", id: proofC }, horizon, TEST_ENV).then(
    () => assert.fail("exhausted campaign must not pay"),
    (e: unknown) => assert.ok(e instanceof CampaignActionError && e.code === "budget-exhausted", "exhaustion enforced"),
  );
  assert.equal(
    campaignReceipt({
      id: winnerId,
      status: "paid",
      rewardAsset: "USDC",
      rewardNetwork: "stellar_testnet",
      payoutTxHash: "b".repeat(64),
    }).stage,
    "settled",
    "paid completion maps to settled",
  );

  // 2. Uncertain-outcome retry: timeout after a confirmed submit recovers
  // with the SAME hash — never a second payment.
  const solo = await createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Uncertain retry", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
  );
  temporaryCampaignIds.push(solo.id);
  const fundSolo = txHash();
  horizon.transactions.set(fundSolo, { ...fundingTx(TREASURY, "10.0000000"), hash: fundSolo });
  await verifyCampaignFunding(solo.id, admin.id, fundSolo, horizon);
  await activateCampaign(solo.id, admin.id);
  const proofSolo = await proofTransfer(alice.id, DEST, benji);
  const submitsBefore = horizon.submits.length;
  horizon.failNextSubmit();
  const uncertain = await claimCampaignReward(solo.id, alice.id, DEST, { kind: "send", id: proofSolo }, horizon, TEST_ENV);
  assert.equal(uncertain.status, "paid", "uncertain submit recovers inline to paid");
  assert.equal(horizon.submits.length, submitsBefore + 1, "no second payout submission");
  assert.ok(uncertain.payoutTxHash, "recovered receipt carries its reference");
  const pendingList = await listMyCompletions(solo.id, alice.id);
  const pending = pendingList.find((c) => c.id === uncertain.id);
  assert.ok(pending && pending.status === "paid", "recovered state reads back paid");
  // Definitive rejection: nothing reaches the ledger, the attempt fails
  // durably, the reservation releases, and a retry pays exactly once.
  const proofDrop = await proofTransfer(alice.id, DEST, benji);
  const dropBefore = horizon.submits.length;
  horizon.failNextDrop();
  await claimCampaignReward(solo.id, alice.id, DEST, { kind: "send", id: proofDrop }, horizon, TEST_ENV).then(
    () => assert.fail("rejected payout must fail"),
    (e: unknown) => assert.ok(e instanceof CampaignActionError && e.code === "payout-failed", "definitive failure surfaces"),
  );
  const droppedList = await listMyCompletions(solo.id, alice.id);
  const dropped = droppedList.find((c) => c.status === "failed");
  assert.ok(dropped, "rejected attempt marked failed with its reason");
  const retried = await claimCampaignReward(solo.id, alice.id, DEST, { kind: "send", id: proofDrop }, horizon, TEST_ENV);
  assert.equal(retried.status, "paid", "retry after definitive failure pays");
  assert.equal(horizon.submits.length, dropBefore + 2, "retry resubmits the same envelope once");
  const [soloRow] = await database.select().from(campaigns).where(eq(campaigns.id, solo.id)).limit(1);
  assert.ok(BigInt(Math.round(Number(soloRow!.paidAmount) * 10000000)) <= BigInt(100000000), "paid never exceeds funded");

  // 3. Reward concurrent double-claim: one settlement, one receipt.
  const [rewardMission] = await database.select().from(missions).where(eq(missions.id, REWARD_MISSION)).limit(1);
  assert.ok(rewardMission, "XLM reward mission seeded");
  const rewardUser = randomUUID();
  const rewardWallet = randomUUID();
  const rewardKeys = Keypair.random();
  const rewardHandle = `drops-reward-${rewardUser.slice(0, 8)}`;
  temporaryUserIds.push(rewardUser);
  temporaryWalletIds.push(rewardWallet);
  await database.insert(users).values({ id: rewardUser, handle: rewardHandle, displayName: "Drops tester", avatarUrl: null, role: "member" });
  await database.insert(stellarWallets).values({ id: rewardWallet, userId: rewardUser, network: "mainnet", publicKey: rewardKeys.publicKey() });
  const submissionId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: submissionId, missionId: REWARD_MISSION, userId: rewardUser,
    content: "Drops fixture.", evidenceUrl: null, score: 4, status: "approved",
    reviewedBy: null, reviewedAt: new Date(), revisionReason: null,
  });
  const rsession = rewardSession(rewardUser, rewardHandle, rewardWallet, rewardKeys.publicKey());
  let successes = 0;
  const fakeSettle = async (): Promise<ConfirmedRewardSettlement> => {
    successes += 1;
    return { transactionHash: `dd${submissionId.replace(/-/g, "").slice(0, 62)}`, ledger: 42, confirmedAt: new Date() };
  };
  const [c1, c2] = await Promise.all([
    claimRewardForSession(submissionId, rsession, { settle: fakeSettle }),
    claimRewardForSession(submissionId, rsession, { settle: fakeSettle }),
  ]);
  assert.equal(c1.id, c2.id, "concurrent claims converge on one receipt");
  assert.equal(successes, 1, "exactly one settlement across racers");

  // 4. Reward retry after timeout: unknown stays submitted, then confirms once.
  const rewardUser2 = randomUUID();
  const rewardWallet2 = randomUUID();
  const rewardKeys2 = Keypair.random();
  const rewardHandle2 = `drops-reward2-${rewardUser2.slice(0, 8)}`;
  temporaryUserIds.push(rewardUser2);
  temporaryWalletIds.push(rewardWallet2);
  await database.insert(users).values({ id: rewardUser2, handle: rewardHandle2, displayName: "Drops tester", avatarUrl: null, role: "member" });
  await database.insert(stellarWallets).values({ id: rewardWallet2, userId: rewardUser2, network: "mainnet", publicKey: rewardKeys2.publicKey() });
  const submission2 = randomUUID();
  await database.insert(missionSubmissions).values({
    id: submission2, missionId: REWARD_MISSION, userId: rewardUser2,
    content: "Drops fixture.", evidenceUrl: null, score: 4, status: "approved",
    reviewedBy: null, reviewedAt: new Date(), revisionReason: null,
  });
  const rsession2 = rewardSession(rewardUser2, rewardHandle2, rewardWallet2, rewardKeys2.publicKey());
  let wins = 0;
  let flaked = false;
  const flakySettle = async (): Promise<ConfirmedRewardSettlement> => {
    if (!flaked) {
      flaked = true;
      throw new Error("horizon timeout");
    }
    wins += 1;
    return { transactionHash: `ee${submission2.replace(/-/g, "").slice(0, 62)}`, ledger: 43, confirmedAt: new Date() };
  };
  await claimRewardForSession(submission2, rsession2, { settle: flakySettle }).then(
    () => assert.fail("timeout must surface"),
    (e: unknown) => assert.ok(e instanceof Error, "timeout surfaces, not mapped to failure"),
  );
  // The real settle path persists its envelope before submitting; replay
  // that exact DB state so the retry exercises the resume path.
  await database
    .update(rewardClaims)
    .set({ signedEnvelopeXdr: "test-envelope", updatedAt: new Date() })
    .where(eq(rewardClaims.userId, rewardUser2));
  const retry = await claimRewardForSession(submission2, rsession2, { settle: flakySettle });
  assert.equal(retry.status, "confirmed", "retry resumes to confirmed");
  assert.equal(wins, 1, "exactly one successful settlement");
  try {
    await claimRewardForSession(submission2, rsession, { settle: fakeSettle });
    assert.fail("cross-user claim must be rejected");
  } catch (error) {
    assert.ok(error instanceof RewardActionError, "cross-user claim rejected");
  }

  console.log("drops:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  })
  .finally(cleanup);
