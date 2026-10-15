import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import {
  assetTransfers,
  campaignCompletions,
  campaigns,
  circles,
  crosschainTransfers,
  missionSubmissions,
  missions,
  rewardClaims,
  stellarWallets,
  users,
} from "../src/db/schema";
import type { AuthenticatedSession } from "../src/lib/auth/session";
import {
  SendActionError,
  getSendTransfer,
  prepareSend,
  submitSend,
  type SendAccount,
  type SendHorizon,
} from "../src/lib/send/service";
import {
  enableStellarReceiveEndpoint,
  saveUserContact,
} from "../src/lib/contacts/service";
import {
  claimRewardForSession,
} from "../src/lib/rewards/service";
import { RewardActionError } from "../src/lib/rewards/errors";
import type { ConfirmedRewardSettlement } from "../src/lib/rewards/settlement";
import {
  activateCampaign,
  claimCampaignReward,
  createCampaign,
  listMyCompletions,
  verifyCampaignFunding,
} from "../src/lib/campaigns/service";
import type { CampaignHorizonTransaction } from "../src/lib/campaigns/settlement";
import { CAMPAIGN_REWARD_ISSUER } from "../src/lib/campaigns/config";
import {
  CrosschainSendError,
  createCrosschainSend,
  getCrosschainSend,
  refreshCrosschainSend,
} from "../src/lib/crosschain-send/service";
import {
  addMyReceiveEndpoint,
  updateMyReceiveEndpoint,
} from "../src/lib/contacts/service";
import {
  accessReceipt,
  campaignReceipt,
  crosschainReceipt,
  rewardReceipt,
  sendReceipt,
  swapReceipt,
} from "../src/lib/receipts/receipts";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const temporaryWalletIds: string[] = [];
const temporaryCampaignIds: string[] = [];

const USDC = { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" };
const BENJI = { code: "BENJI", issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5" };
const SENDER_WALLET = `G${"A".repeat(55)}`;
const BOB_BASE = "0x1111111111111111111111111111111111111111";
const REWARD_MISSION = "00000000-0000-0000-0000-000000000401";

type MockAccounts = Map<string, SendAccount>;

function fundedSendAccount(sequence: string, code: string, issuer: string, balance: string): SendAccount {
  return { sequence, balances: [{ assetCode: code, assetIssuer: issuer, balance, isAuthorized: true }] };
}

function mockSendHorizon(accounts: MockAccounts): SendHorizon {
  return {
    async getAccount(address: string) {
      return accounts.get(address) ?? null;
    },
    async submitTransaction() {
      throw new Error("no submissions in transition fixtures");
    },
    async getTransaction() {
      return null;
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

async function expectSendCode(promise: Promise<unknown>, code: string, label: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof SendActionError, `${label}: expected SendActionError`);
    assert.equal((error as SendActionError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

function rewardSession(userId: string, handle: string, walletId: string, publicKey: string): AuthenticatedSession {
  return {
    sessionId: randomUUID(),
    user: { id: userId, handle, displayName: "Transition tester", avatarUrl: null, role: "member" },
    wallet: { id: walletId, network: "mainnet", publicKey, verifiedAt: new Date() },
    expiresAt: new Date(Date.now() + 60_000),
  };
}

const distributor = Keypair.random();
const TEST_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  VICUS_CAMPAIGN_DISTRIBUTOR_SECRET: distributor.secret(),
  VICUS_CAMPAIGN_MAX_USDC: "1000",
};
const TREASURY = distributor.publicKey();

function fundingTx(to: string, amount: string): CampaignHorizonTransaction {
  return {
    hash: "a".repeat(64),
    ledger: 100,
    successful: true,
    createdAt: new Date(Date.now() + 60_000).toISOString(),
    operations: [{ type: "payment", assetCode: "USDC", assetIssuer: CAMPAIGN_REWARD_ISSUER, destination: to, amount }],
  };
}

function mockCampaignHorizon(dest: string) {
  const transactions = new Map<string, CampaignHorizonTransaction>();
  const usdcDest = {
    sequence: "50",
    balances: [
      { assetType: "native", balance: "10" },
      { assetType: "credit_alphanum4", assetCode: "USDC", assetIssuer: CAMPAIGN_REWARD_ISSUER, balance: "0", authorized: true },
    ],
  };
  const treasury = { sequence: "100", balances: [{ assetType: "native", balance: "100" }] };
  return {
    transactions,
    async loadAccount(address: string) {
      if (address === dest) return usdcDest;
      if (address === TREASURY) return treasury;
      return null;
    },
    async submitTransaction(signedXdr: string) {
      const parsed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET) as unknown as { hash?: unknown };
      if (!parsed || typeof (parsed as { hash?: unknown }).hash !== "function") throw new Error("bad envelope");
      const hash = Buffer.from((parsed as unknown as { hash: () => Uint8Array }).hash()).toString("hex");
      const recorded = { hash, ledger: 500, successful: true, createdAt: new Date().toISOString(), operations: [] };
      transactions.set(hash, recorded as CampaignHorizonTransaction);
      return { hash, ledger: 500 };
    },
    async getTransaction(hash: string) {
      return transactions.get(hash.toLowerCase()) ?? null;
    },
  };
}

async function cleanup() {
  await database.delete(crosschainTransfers).where(inArray(crosschainTransfers.userId, temporaryUserIds)).catch(() => undefined);
  await database.delete(assetTransfers).where(inArray(assetTransfers.senderUserId, temporaryUserIds)).catch(() => undefined);
  await database.delete(rewardClaims).where(inArray(rewardClaims.userId, temporaryUserIds)).catch(() => undefined);
  await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds)).catch(() => undefined);
  if (temporaryCampaignIds.length > 0) {
    await database.delete(campaignCompletions).where(inArray(campaignCompletions.campaignId, temporaryCampaignIds)).catch(() => undefined);
    await database.delete(campaigns).where(inArray(campaigns.id, temporaryCampaignIds)).catch(() => undefined);
  }
  await database.delete(stellarWallets).where(inArray(stellarWallets.id, temporaryWalletIds)).catch(() => undefined);
  await database.delete(users).where(inArray(users.id, temporaryUserIds)).catch(() => undefined);
}

async function main() {
  // 1. Send: prepared survives reload; failed attempts never mutate state.
  const sender = await createUser("tr-send");
  const recipient = await createUser("tr-recv");
  const senderKeys = Keypair.random();
  const recipientKeys = Keypair.random();
  await enableStellarReceiveEndpoint(recipient.id, recipientKeys.publicKey(), { enabled: true });
  await saveUserContact(sender.id, recipient.handle);
  const sendHorizon = mockSendHorizon(
    new Map([
      [senderKeys.publicKey(), fundedSendAccount("10", USDC.code, USDC.issuer, "12.4000000")],
      [recipientKeys.publicKey(), fundedSendAccount("7", USDC.code, USDC.issuer, "0.0000000")],
    ]),
  );
  const prepared = await prepareSend(
    sender.id,
    senderKeys.publicKey(),
    { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "5" },
    sendHorizon,
  );
  assert.equal(prepared.amount, "5.0000000", "prepare normalizes the amount");
  const freshPrepared = await getSendTransfer(prepared.transferId, sender.id);
  assert.equal(freshPrepared.status, "prepared", "prepare lands prepared");
  const reloaded = await getSendTransfer(prepared.transferId, sender.id);
  assert.deepEqual(reloaded, freshPrepared, "prepared survives reload byte-identical");
  await expectSendCode(
    submitSend(prepared.transferId, sender.id, senderKeys.publicKey(), "not-xdr", sendHorizon),
    "invalid-request",
    "garbage envelope rejected",
  );
  const afterFailedSubmit = await getSendTransfer(prepared.transferId, sender.id);
  assert.equal(afterFailedSubmit.status, "prepared", "failed submit never mutates state");
  assert.deepEqual(afterFailedSubmit, freshPrepared, "rejected envelope leaves zero trace");
  // Illegal transition: submit on a failed row is rejected, not resurrected.
  const [benjiCircle] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "benji-on-stellar")).limit(1);
  assert.ok(benjiCircle, "benji circle seeded");
  const failedId = randomUUID();
  await database.insert(assetTransfers).values({
    id: failedId,
    senderUserId: sender.id,
    network: "stellar_mainnet",
    circleId: benjiCircle!.id,
    assetCode: "BENJI",
    assetIssuer: BENJI.issuer,
    amount: "1.0000000",
    destinationAddress: recipientKeys.publicKey(),
    status: "failed",
    failureReason: "rejected",
    lastError: "fixture failure",
  });
  await expectSendCode(
    submitSend(failedId, sender.id, senderKeys.publicKey(), "not-xdr", sendHorizon),
    "invalid-transition",
    "submit on failed is rejected",
  );
  const stillFailed = await getSendTransfer(failedId, sender.id);
  assert.equal(stillFailed.status, "failed", "failed stays failed");
  // Receipt agreement: persisted states map through the P4.2 contract.
  assert.equal(sendReceipt({ id: prepared.transferId, status: "prepared", network: "stellar_mainnet", assetCode: "USDC" }).stage, "prepared", "adapter agrees: prepared");
  assert.equal(sendReceipt({ id: failedId, status: "failed", network: "stellar_mainnet", assetCode: "BENJI", failureReason: "rejected" }).stage, "failed", "adapter agrees: failed");

  // 2. Rewards: claim reload equality; illegal claims rejected; no re-pay.
  const [rewardMission] = await database.select().from(missions).where(eq(missions.id, REWARD_MISSION)).limit(1);
  assert.ok(rewardMission, "XLM reward mission seeded");
  const participantId = randomUUID();
  const participantWalletId = randomUUID();
  const participantKeys = Keypair.random();
  const participantHandle = `tr-reward-${participantId.slice(0, 8)}`;
  temporaryUserIds.push(participantId);
  temporaryWalletIds.push(participantWalletId);
  await database.insert(users).values({ id: participantId, handle: participantHandle, displayName: "Transition tester", avatarUrl: null, role: "member" });
  await database.insert(stellarWallets).values({ id: participantWalletId, userId: participantId, network: "mainnet", publicKey: participantKeys.publicKey() });
  const submissionId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: submissionId, missionId: REWARD_MISSION, userId: participantId,
    content: "Transition fixture.", evidenceUrl: null, score: 4, status: "approved",
    reviewedBy: null, reviewedAt: new Date(), revisionReason: null,
  });
  const session = rewardSession(participantId, participantHandle, participantWalletId, participantKeys.publicKey());
  let settlementCalls = 0;
  const fakeSettlement = async (): Promise<ConfirmedRewardSettlement> => {
    settlementCalls += 1;
    return { transactionHash: `aa${submissionId.replace(/-/g, "").slice(0, 62)}`, ledger: 42, confirmedAt: new Date() };
  };
  const firstClaim = await claimRewardForSession(submissionId, session, { settle: fakeSettlement });
  assert.ok(["submitted", "confirmed"].includes(firstClaim.status), "claim lands submitted-or-confirmed");
  const settled = await claimRewardForSession(submissionId, session, { settle: fakeSettlement });
  assert.equal(settled.id, firstClaim.id, "re-claim returns the same receipt (reload-safe)");
  assert.equal(settlementCalls <= 1, true, "settlement runs at most once — no re-pay");
  // Reload truth comes from the persisted row, not the view object.
  assert.ok(firstClaim.id, "claim has an id");
  const claimId: string = firstClaim.id as string;
  const [claimRow] = await database.select().from(rewardClaims).where(eq(rewardClaims.id, claimId)).limit(1);
  assert.ok(claimRow, "claim row persisted");
  assert.equal(claimRow!.status, "confirmed", "settlement confirmed the persisted claim");
  assert.ok(claimRow!.transactionHash, "persisted claim carries its hash");
  const pendingId = randomUUID();
  const pendingWalletId = randomUUID();
  const pendingKeys = Keypair.random();
  const pendingHandle = `tr-reward-pending-${pendingId.slice(0, 8)}`;
  temporaryUserIds.push(pendingId);
  temporaryWalletIds.push(pendingWalletId);
  await database.insert(users).values({ id: pendingId, handle: pendingHandle, displayName: "Transition tester", avatarUrl: null, role: "member" });
  await database.insert(stellarWallets).values({ id: pendingWalletId, userId: pendingId, network: "mainnet", publicKey: pendingKeys.publicKey() });
  const pendingSession = rewardSession(pendingId, pendingHandle, pendingWalletId, pendingKeys.publicKey());
  const pendingSubmissionId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: pendingSubmissionId, missionId: REWARD_MISSION, userId: pendingId,
    content: "Pending fixture.", evidenceUrl: null, score: null, status: "pending",
    reviewedBy: null, reviewedAt: null, revisionReason: null,
  });
  try {
    await claimRewardForSession(pendingSubmissionId, pendingSession, { settle: fakeSettlement });
    assert.fail("claim on pending submission must be rejected");
  } catch (error) {
    assert.ok(error instanceof RewardActionError && error.code === "not-eligible", "pending claim rejected as not-eligible");
  }
  assert.equal(
    rewardReceipt({ id: claimRow!.id, status: claimRow!.status, network: "testnet", asset: "XLM", transactionHash: claimRow!.transactionHash }).stage,
    "settled",
    `adapter agrees with the persisted claim (row status=${claimRow!.status})`,
  );

  // 3. Campaign payouts: paid reload equality; re-claim idempotent; isolation.
  const admin = await createUser("tr-admin", "admin");
  const worker = await createUser("tr-worker");
  const workerDest = Keypair.random().publicKey();
  const campaignHorizon = mockCampaignHorizon(workerDest);
  const created = await createCampaign(admin.id, { circleSlug: "benji-on-stellar", objective: "Transition payouts", targetAction: "send", rewardPerCompletion: "1" }, TEST_ENV);
  temporaryCampaignIds.push(created.id);
  const FUND_HASH = (randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")).slice(0, 64);
  campaignHorizon.transactions.set(FUND_HASH, { ...fundingTx(TREASURY, "100.0000000"), hash: FUND_HASH });
  await verifyCampaignFunding(created.id, admin.id, FUND_HASH, campaignHorizon);
  await activateCampaign(created.id, admin.id);
  const proofId = randomUUID();
  const [benjiRow] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "benji-on-stellar")).limit(1);
  await database.insert(assetTransfers).values({
    id: proofId, senderUserId: worker.id, network: "stellar_mainnet", circleId: benjiRow!.id,
    assetCode: "BENJI", assetIssuer: BENJI.issuer, amount: "5.0000000", destinationAddress: workerDest,
    status: "confirmed", transactionHash: (randomUUID().replace(/-/g, "") + "2c00000000000000000000000000000000").slice(0, 64), ledger: 111, confirmedAt: new Date(),
  });
  const paid = await claimCampaignReward(created.id, worker.id, workerDest, { kind: "send", id: proofId }, campaignHorizon, TEST_ENV);
  assert.equal(paid.status, "paid", "claim lands paid");
  assert.ok(paid.payoutTxHash, "paid carries its payout reference");
  const paidAgain = await claimCampaignReward(created.id, worker.id, workerDest, { kind: "send", id: proofId }, campaignHorizon, TEST_ENV);
  assert.equal(paidAgain.id, paid.id, "re-claim returns the same completion (reload-safe)");
  assert.equal(paidAgain.status, "paid", "paid stays paid across re-reads");
  const stranger = await createUser("tr-stranger");
  const mine = await listMyCompletions(created.id, worker.id);
  assert.ok(mine.some((c) => c.id === paid.id), "owner re-reads the paid completion");
  const theirs = await listMyCompletions(created.id, stranger.id);
  assert.ok(!theirs.some((c) => c.id === paid.id), "stranger never sees the payout");
  assert.equal(
    campaignReceipt({ id: paid.id, status: "paid", rewardAsset: "USDC", rewardNetwork: "stellar_testnet", payoutTxHash: paid.payoutTxHash ?? null }).stage,
    "settled",
    "adapter agrees: paid is settled",
  );

  // 4. Cross-chain: refresh failure preserves state; completed immutable; reload equal.
  const alice = await createUser("tr-alice");
  const bob = await createUser("tr-bob");
  const carol = await createUser("tr-carol");
  const ep = await addMyReceiveEndpoint(bob.id, { network: "base", address: BOB_BASE, label: "Base" });
  await updateMyReceiveEndpoint(ep.id, bob.id, { enabled: true, visibility: "public" });
  const first = await createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "base", amount: "5" });
  const refetched = await getCrosschainSend(first.transfer.id, alice.id);
  assert.deepEqual({ ...refetched.transfer, updatedAt: null }, { ...first.transfer, updatedAt: null }, "draft survives reload (timestamps excluded)");
  // Simulate a mid-flight outage: burned + fee known, attestation down.
  await database
    .update(crosschainTransfers)
    .set({ status: "burned", sourceTxHash: `3d${"0".repeat(62)}`, feeSubunits6: "1000", retryable: false, lastError: null })
    .where(and(eq(crosschainTransfers.id, first.transfer.id), eq(crosschainTransfers.userId, alice.id)));
  const stalled = await refreshCrosschainSend(first.transfer.id, alice.id, {
    fetchAttestation: async () => {
      throw new Error("simulated attestation outage");
    },
  });
  assert.equal(stalled.transfer.status, "burned", "outage preserves the verified stage");
  assert.equal(stalled.transfer.retryable, true, "outage marks retryable, never invents progress");
  assert.ok((stalled.transfer.lastError ?? "").length > 0, "outage reason recorded");
  // Completed is immutable even under failing transports.
  await database
    .update(crosschainTransfers)
    .set({ status: "completed", destinationTxHash: `4e${"0".repeat(62)}`, retryable: false, lastError: null })
    .where(and(eq(crosschainTransfers.id, first.transfer.id), eq(crosschainTransfers.userId, alice.id)));
  const immutable = await refreshCrosschainSend(first.transfer.id, alice.id, {
    fetchAttestation: async () => {
      throw new Error("simulated attestation outage");
    },
  });
  assert.equal(immutable.transfer.status, "completed", "completed stays completed");
  try {
    await getCrosschainSend(first.transfer.id, carol.id);
    assert.fail("stranger read must be rejected");
  } catch (error) {
    assert.ok(error instanceof CrosschainSendError && error.code === "not-found", "stranger sees nothing");
  }
  assert.equal(
    crosschainReceipt({ id: first.transfer.id, status: "burned", sourceNetwork: "stellar_testnet", destinationNetwork: "base", sourceTxHash: `3d${"0".repeat(62)}` }).stage,
    "submitted",
    "adapter agrees: burned is submitted, not settled",
  );
  // Adapter agreement for the order flows (pure rows): quote-only access
  // stays initiated, a signed swap submission stays submitted.
  assert.equal(
    accessReceipt({ id: ID(60), status: "quoting", sourceNetwork: "stellar_testnet", destinationNetwork: "base", venue: "aerodrome" }).stage,
    "initiated",
    "adapter agrees: access quote is initiated",
  );
  const SWAP_SIG = `5e${"0".repeat(62)}`;
  assert.equal(
    swapReceipt({ id: ID(61), status: "submitted", actionKind: "swap", destinationNetwork: "solana", venue: "jupiter", swapSignature: SWAP_SIG }).stage,
    "submitted",
    "adapter agrees: swap signature is submitted",
  );
  assert.equal(
    swapReceipt({ id: ID(61), status: "submitted", actionKind: "swap", destinationNetwork: "solana", venue: "jupiter", swapSignature: SWAP_SIG }).explorerUrl,
    `https://explorer.solana.com/tx/${SWAP_SIG}`,
    "adapter agrees: explorer link is network-correct",
  );

  console.log("transitions:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  })
  .finally(cleanup);
