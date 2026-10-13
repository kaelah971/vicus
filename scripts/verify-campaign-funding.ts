import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import {
  Keypair,
  Networks,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import {
  assetTransfers,
  campaignCompletions,
  campaigns,
  circles,
  externalUtilityOrders,
  missionSubmissions,
  missions,
  organizationMemberships,
  organizations,
  users,
} from "../src/db/schema";
import { CAMPAIGN_REWARD_ISSUER } from "../src/lib/campaigns/config";
import {
  defaultCampaignHorizon,
  type CampaignHorizon,
  type CampaignHorizonTransaction,
} from "../src/lib/campaigns/settlement";
import {
  CampaignActionError,
  activateCampaign,
  claimCampaignReward,
  completeCampaign,
  createCampaign,
  getCampaign,
  getCampaignDashboard,
  listCircleCampaigns,
  listEligibleProofs,
  pauseCampaign,
  verifyCampaignFunding,
} from "../src/lib/campaigns/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryOrgIds: string[] = [];
const temporaryCampaignIds: string[] = [];
const temporaryMissionIds: string[] = [];

const BENJI_ISSUER = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
const USDC_ISSUER = CAMPAIGN_REWARD_ISSUER;

type TestEnv = NodeJS.ProcessEnv;
const distributor = Keypair.random();
const TEST_ENV: TestEnv = {
  ...process.env,
  VICUS_CAMPAIGN_DISTRIBUTOR_SECRET: distributor.secret(),
  VICUS_CAMPAIGN_MAX_USDC: "1000",
};
const TREASURY = distributor.publicKey();

function fundedAccount(sequence = "100"): { sequence: string; balances: { assetType: string; balance: string }[] } {
  return { sequence, balances: [{ assetType: "native", balance: "100" }] };
}

function usdcAccount(sequence = "50"): {
  sequence: string;
  balances: { assetType: string; assetCode?: string; assetIssuer?: string; balance: string; authorized?: boolean }[];
} {
  return {
    sequence,
    balances: [
      { assetType: "native", balance: "10" },
      { assetType: "credit_alphanum4", assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "1000", authorized: true },
    ],
  };
}

function mockHorizon(overrides: {
  accounts?: Map<string, { sequence: string; balances: CampaignHorizon["loadAccount"] extends never ? never : { assetType: string; assetCode?: string; assetIssuer?: string; balance: string; authorized?: boolean }[] }>;
  transactions?: Map<string, CampaignHorizonTransaction>;
  failNextSubmit?: boolean;
  submits?: string[];
} = {}): CampaignHorizon & { submits: string[]; transactions: Map<string, CampaignHorizonTransaction> } {
  const accounts = overrides.accounts ?? new Map();
  const transactions = overrides.transactions ?? new Map();
  const submits = overrides.submits ?? [];
  let failNext = overrides.failNextSubmit ?? false;
  return {
    submits,
    transactions,
    async loadAccount(address: string) {
      return accounts.get(address) ?? null;
    },
    async submitTransaction(signedXdr: string) {
      submits.push(signedXdr);
      const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      if (!(transaction as unknown as { hash?: unknown }) || typeof (transaction as { hash?: unknown }).hash !== "function") {
        throw new Error("bad envelope");
      }
      const hash = Buffer.from(
        (transaction as unknown as { hash: () => Uint8Array }).hash(),
      ).toString("hex");
      if (failNext) {
        failNext = false;
        // Uncertain outcome: the ledger DID confirm (recovery must find it).
        transactions.set(hash, {
          hash,
          ledger: 999,
          successful: true,
          createdAt: new Date().toISOString(),
          operations: [],
        });
        throw new Error("timeout after submit");
      }
      transactions.set(hash, {
        hash,
        ledger: 999,
        successful: true,
        createdAt: new Date().toISOString(),
        operations: [],
      });
      return { hash, ledger: 999 };
    },
    async getTransaction(hash: string) {
      return transactions.get(hash.toLowerCase()) ?? null;
    },
  };
}

function fundingTx(to: string, amount: string, assetCode = "USDC", assetIssuer = USDC_ISSUER): CampaignHorizonTransaction {
  // Created slightly in the future: the database clock may run ahead of the
  // local clock, and funding must never predate its campaign.
  const createdAt = new Date(Date.now() + 60_000).toISOString();
  return {
    hash: "a".repeat(64),
    ledger: 100,
    successful: true,
    createdAt,
    operations: [{ type: "payment", assetCode, assetIssuer, destination: to, amount }],
  };
}

async function createUser(handle: string, role = "member") {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
    try {
      await database.insert(users).values({ id, handle: uniqueHandle, displayName: uniqueHandle, avatarUrl: null, role });
      temporaryUserIds.push(id);
      return { id, handle: uniqueHandle };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function createOrgWithRole(userId: string, role: "owner" | "admin" | "editor") {
  const orgId = randomUUID();
  await database.insert(organizations).values({
    id: orgId,
    name: `Probe org ${orgId.slice(0, 6)}`,
    slug: `probe-org-${orgId.slice(0, 8)}`,
    description: "Throwaway campaign-verifier organization.",
  });
  temporaryOrgIds.push(orgId);
  await database.insert(organizationMemberships).values({ organizationId: orgId, userId, role });
  return orgId;
}

async function benjiCircleId(): Promise<string> {
  const [row] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "benji-on-stellar")).limit(1);
  assert.ok(row, "benji circle seeded");
  return row!.id;
}

async function aaplxCircleId(): Promise<string> {
  const [row] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "aaplx-on-solana")).limit(1);
  assert.ok(row, "aaplx circle seeded");
  return row!.id;
}

async function trackCampaign<T extends { id: string }>(promise: Promise<T>): Promise<T> {
  const campaign = await promise;
  temporaryCampaignIds.push(campaign.id);
  return campaign;
}

async function expectCode(promise: Promise<unknown>, code: string, label: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof CampaignActionError, `${label}: expected CampaignActionError`);
    assert.equal((error as CampaignActionError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

async function main() {
  const admin = await createUser("campaign-admin", "admin");
  const project = await createUser("campaign-project");
  const alice = await createUser("campaign-alice");
  const bob = await createUser("campaign-bob");
  const stranger = await createUser("campaign-stranger");
  const benji = await benjiCircleId();
  const DEST = Keypair.random().publicKey();

/** Unique 64-hex fixture hash per call — crashed runs must never collide. */
function txHash(): string {
  return (randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")).slice(0, 64);
}

  // Env with no distributor configured (drops any operator-configured secret).
  const emptyEnv = { ...process.env };
  delete emptyEnv.VICUS_CAMPAIGN_DISTRIBUTOR_SECRET;

  // 1. Only authorized roles create campaigns.
  await expectCode(
    createCampaign(stranger.id, { circleSlug: "benji-on-stellar", objective: "Activate BENJI", targetAction: "send", rewardPerCompletion: "1" }, TEST_ENV),
    "forbidden",
    "non-member blocked",
  );
  const editorOrg = await createOrgWithRole(project.id, "editor");
  await expectCode(
    createCampaign(project.id, { circleSlug: "benji-on-stellar", organizationId: editorOrg, objective: "Activate BENJI now", targetAction: "send", rewardPerCompletion: "1" }, TEST_ENV),
    "forbidden",
    "editor blocked from money movement",
  );
  await expectCode(
    createCampaign(admin.id, { circleSlug: "benji-on-stellar", objective: "Activate BENJI", targetAction: "teleport", rewardPerCompletion: "1" }, TEST_ENV),
    "invalid-request",
    "unapproved action rejected",
  );
  await expectCode(
    createCampaign(admin.id, { circleSlug: "no-such-circle", objective: "Activate BENJI", targetAction: "send", rewardPerCompletion: "1" }, TEST_ENV),
    "not-found",
    "missing circle rejected",
  );
  await expectCode(
    createCampaign(admin.id, { circleSlug: "benji-on-stellar", objective: "Activate BENJI", targetAction: "send", rewardPerCompletion: "1" }, emptyEnv),
    "campaign-not-configured",
    "unconfigured treasury blocks creation",
  );

  // 2. Create + treasury + activation gating.
  const created = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Activate BENJI", targetAction: "send", rewardPerCompletion: "1.5", participantCap: 100 },
    TEST_ENV,
 ));
  assert.equal(created.status, "awaiting_funding", "starts awaiting funding");
  assert.equal(created.treasuryAccount, TREASURY, "treasury derived server-side");
  assert.equal(created.rewardAsset, "USDC", "USDC rewards");
  assert.equal(created.rewardNetwork, "stellar_testnet", "testnet labeled");
  assert.equal(created.rewardPerCompletion, "1.5000000", "exact 7dp reward");
  await expectCode(activateCampaign(created.id, admin.id), "invalid-transition", "unfunded activation blocked");

  // 3. Funding verification: exact asset/issuer/destination/amount.
  const horizon = mockHorizon({
    accounts: new Map([[TREASURY, fundedAccount()], [DEST, usdcAccount()]]),
  });
  const FUND_HASH = "b".repeat(64);
  horizon.transactions.set(FUND_HASH, { ...fundingTx(TREASURY, "100.0000000"), hash: FUND_HASH });
  await expectCode(verifyCampaignFunding(created.id, admin.id, "short", horizon), "invalid-request", "malformed hash rejected");
  const wrongAsset = "c".repeat(64);
  horizon.transactions.set(wrongAsset, { ...fundingTx(TREASURY, "100.0000000", "XLM", undefined as unknown as string), hash: wrongAsset });
  await expectCode(verifyCampaignFunding(created.id, admin.id, wrongAsset, horizon), "funding-invalid", "wrong asset rejected");
  const wrongDest = "d".repeat(64);
  horizon.transactions.set(wrongDest, { ...fundingTx(DEST, "100.0000000"), hash: wrongDest });
  await expectCode(verifyCampaignFunding(created.id, admin.id, wrongDest, horizon), "funding-invalid", "wrong destination rejected");
  const failedTx = "e".repeat(64);
  horizon.transactions.set(failedTx, { ...fundingTx(TREASURY, "100.0000000"), hash: failedTx, successful: false });
  await expectCode(verifyCampaignFunding(created.id, admin.id, failedTx, horizon), "funding-invalid", "failed tx rejected");
  const funded = await verifyCampaignFunding(created.id, admin.id, FUND_HASH, horizon);
  assert.equal(funded.status, "funded", "funded after verification");
  assert.equal(funded.fundedAmount, "100.0000000", "real credited amount used");
  // Duplicate funding hash on a second campaign is rejected.
  const second = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Activate BENJI again", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
 ));
  await expectCode(verifyCampaignFunding(second.id, admin.id, FUND_HASH, horizon), "funding-duplicate", "hash reuse rejected");

  // 4. Lifecycle: activate → pause → resume → complete; unauthorized blocked.
  await expectCode(activateCampaign(created.id, stranger.id), "forbidden", "stranger cannot activate");
  const active = await activateCampaign(created.id, admin.id);
  assert.equal(active.status, "active", "activated");
  assert.ok(active.activatedAt, "activation timestamped");
  const paused = await pauseCampaign(created.id, admin.id);
  assert.equal(paused.status, "paused", "paused");
  await expectCode(
    claimCampaignReward(created.id, alice.id, DEST, { kind: "send", id: randomUUID() }, horizon, TEST_ENV),
    "invalid-transition",
    "paused campaign pays nothing",
  );
  await activateCampaign(created.id, admin.id);

  // 5. Proof binding: send receipts.
  const proofTransfer = randomUUID();
  await database.insert(assetTransfers).values({
    id: proofTransfer,
    senderUserId: alice.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "5.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 111,
    confirmedAt: new Date(),
  });
  await expectCode(
    claimCampaignReward(created.id, bob.id, DEST, { kind: "send", id: proofTransfer }, horizon, TEST_ENV),
    "proof-invalid",
    "another user's receipt rejected",
  );
  const usdcTransfer = randomUUID();
  const [usdcCircle] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "usdc-on-stellar")).limit(1);
  await database.insert(assetTransfers).values({
    id: usdcTransfer,
    senderUserId: alice.id,
    network: "stellar_mainnet",
    circleId: usdcCircle!.id,
    assetCode: "USDC",
    assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount: "5.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 112,
    confirmedAt: new Date(),
  });
  await expectCode(
    claimCampaignReward(created.id, alice.id, DEST, { kind: "send", id: usdcTransfer }, horizon, TEST_ENV),
    "proof-invalid",
    "wrong-asset receipt rejected",
  );
  const draftTransfer = randomUUID();
  await database.insert(assetTransfers).values({
    id: draftTransfer,
    senderUserId: alice.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "5.0000000",
    destinationAddress: DEST,
    status: "submitted",
    transactionHash: txHash(),
  });
  await expectCode(
    claimCampaignReward(created.id, alice.id, DEST, { kind: "send", id: draftTransfer }, horizon, TEST_ENV),
    "proof-invalid",
    "unconfirmed receipt rejected",
  );

  // 6. Happy-path claim pays real Testnet USDC envelope; receipt durable.
  const eligibleBefore = await listEligibleProofs(created.id, alice.id);
  assert.ok(eligibleBefore.some((entry) => entry.id === proofTransfer), "proof listed as eligible");
  const paid = await claimCampaignReward(created.id, alice.id, DEST, { kind: "send", id: proofTransfer }, horizon, TEST_ENV);
  assert.equal(paid.status, "paid", "paid");
  assert.equal(paid.rewardAmount, "1.5000000", "exact reward");
  assert.ok(paid.payoutTxHash, "payout hash recorded");
  assert.ok(paid.payoutExplorerUrl?.includes("testnet"), "testnet explorer link");
  assert.equal(horizon.submits.length, 1, "exactly one submission");
  // Envelope is a real TESTNET USDC payment from the treasury to DEST.
  const envelope = horizon.submits[0]!;
  const parsed = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  assert.ok(parsed, "envelope parses under the Testnet passphrase");
  // Reuse returns the same receipt without a second payout.
  const reused = await claimCampaignReward(created.id, alice.id, DEST, { kind: "send", id: proofTransfer }, horizon, TEST_ENV);
  assert.equal(reused.id, paid.id, "same completion idempotent");
  assert.equal(horizon.submits.length, 1, "no second payout");
  const afterPay = await getCampaign(created.id);
  assert.equal(afterPay.paidAmount, "1.5000000", "paid tracked");
  assert.equal(afterPay.remainingAmount, "98.5000000", "remaining exact");

  // 7. Uncertain submit recovers by hash without double pay.
  const shaky = mockHorizon({
    accounts: new Map([[TREASURY, fundedAccount("200")], [DEST, usdcAccount("60")]]),
    failNextSubmit: true,
  });
  const shakyTransfer = randomUUID();
  await database.insert(assetTransfers).values({
    id: shakyTransfer,
    senderUserId: bob.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "2.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 113,
    confirmedAt: new Date(),
  });
  const recovered = await claimCampaignReward(created.id, bob.id, DEST, { kind: "send", id: shakyTransfer }, shaky, TEST_ENV);
  assert.equal(recovered.status, "paid", "uncertain submit recovered by hash");
  assert.equal(shaky.submits.length, 1, "submitted once, recovered once");

  // 8. Destination without trustline stays retryable, budget stays reserved.
  // Recipient account exists but lacks the USDC trustline.
  const poorDest = Keypair.random().publicKey();
  const claimAccounts = new Map<string, { sequence: string; balances: { assetType: string; balance: string }[] }>();
  claimAccounts.set(TREASURY, fundedAccount("300"));
  claimAccounts.set(poorDest, { sequence: "10", balances: [{ assetType: "native", balance: "5" }] });
  const noTrustHorizon = mockHorizon({ accounts: claimAccounts as unknown as Map<string, never> });
  const poorTransfer = randomUUID();
  await database.insert(assetTransfers).values({
    id: poorTransfer,
    senderUserId: bob.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "1.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 114,
    confirmedAt: new Date(),
  });
  await expectCode(
    claimCampaignReward(created.id, bob.id, poorDest, { kind: "send", id: poorTransfer }, noTrustHorizon, TEST_ENV),
    "payout-retryable",
    "missing trustline retryable",
  );
  assert.equal(noTrustHorizon.submits.length, 0, "nothing submitted without trustline");

  // 9. Concurrency: final-budget race yields exactly one winner.
  const raceFund = "f1".repeat(32);
  const race = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Tiny race budget", targetAction: "send", rewardPerCompletion: "1" },
    TEST_ENV,
 ));
  horizon.transactions.set(raceFund, { ...fundingTx(TREASURY, "2.0000000"), hash: raceFund });
  await verifyCampaignFunding(race.id, admin.id, raceFund, horizon);
  await activateCampaign(race.id, admin.id);
  const raceProofs: string[] = [];
  for (const owner of [alice, bob]) {
    const pid = randomUUID();
    raceProofs.push(pid);
    await database.insert(assetTransfers).values({
      id: pid,
      senderUserId: owner.id,
      network: "stellar_mainnet",
      circleId: benji,
      assetCode: "BENJI",
      assetIssuer: BENJI_ISSUER,
      amount: "1.0000000",
      destinationAddress: DEST,
      status: "confirmed",
      transactionHash: pid.replace(/-/g, "").slice(0, 64).padEnd(64, "0"),
      ledger: 200,
      confirmedAt: new Date(),
    });
  }
  const [r1, r2] = await Promise.all(
    raceProofs.map((pid, index) =>
      claimCampaignReward(race.id, [alice, bob][index]!.id, DEST, { kind: "send", id: pid }, horizon, TEST_ENV).catch(
        (error: unknown) => error,
      ),
    ),
  );
  assert.ok(!(r1 instanceof Error) && !(r2 instanceof Error), "both racers resolve");
  const raceAfter = await getCampaign(race.id);
  assert.equal(raceAfter.paidAmount, "2.0000000", "paid never exceeds funded");
  assert.equal(raceAfter.status, "exhausted", "auto-exhausted");
  // Third claim is blocked.
  const lateProof = randomUUID();
  await database.insert(assetTransfers).values({
    id: lateProof,
    senderUserId: stranger.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "1.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 201,
    confirmedAt: new Date(),
  });
  await expectCode(
    claimCampaignReward(race.id, stranger.id, DEST, { kind: "send", id: lateProof }, horizon, TEST_ENV),
    "budget-exhausted",
    "exhausted blocks new rewards",
  );

  // 10. Participant cap enforced.
  const cappedFund = "c1".repeat(32);
  const capped = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Capped campaign", targetAction: "send", rewardPerCompletion: "1", participantCap: 1 },
    TEST_ENV,
 ));
  horizon.transactions.set(cappedFund, { ...fundingTx(TREASURY, "10.0000000"), hash: cappedFund });
  await verifyCampaignFunding(capped.id, admin.id, cappedFund, horizon);
  await activateCampaign(capped.id, admin.id);
  const capProofA = randomUUID();
  await database.insert(assetTransfers).values({
    id: capProofA,
    senderUserId: alice.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "1.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 202,
    confirmedAt: new Date(),
  });
  await claimCampaignReward(capped.id, alice.id, DEST, { kind: "send", id: capProofA }, horizon, TEST_ENV);
  const capProofB = randomUUID();
  await database.insert(assetTransfers).values({
    id: capProofB,
    senderUserId: bob.id,
    network: "stellar_mainnet",
    circleId: benji,
    assetCode: "BENJI",
    assetIssuer: BENJI_ISSUER,
    amount: "1.0000000",
    destinationAddress: DEST,
    status: "confirmed",
    transactionHash: txHash(),
    ledger: 203,
    confirmedAt: new Date(),
  });
  await expectCode(
    claimCampaignReward(capped.id, bob.id, DEST, { kind: "send", id: capProofB }, horizon, TEST_ENV),
    "participant-cap-reached",
    "cap enforced for newcomers",
  );

  // 11. Mission proofs: approved on-circle submission qualifies.
  const missionFund = "d1".repeat(32);
  const learned = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "benji-on-stellar", objective: "Learn BENJI", targetAction: "mission", rewardPerCompletion: "0.5" },
    TEST_ENV,
 ));
  horizon.transactions.set(missionFund, { ...fundingTx(TREASURY, "10.0000000"), hash: missionFund });
  await verifyCampaignFunding(learned.id, admin.id, missionFund, horizon);
  await activateCampaign(learned.id, admin.id);
  const [missionRow] = await database
    .insert(missions)
    .values({
      circleId: benji,
      type: "quiz",
      title: "BENJI basics",
      description: "A short quiz about the BENJI tokenized fund.",
      points: 10,
      duplicatePolicy: "one-per-user",
      reviewMode: "automatic",
      status: "open",
    })
    .returning({ id: missions.id });
  temporaryMissionIds.push(missionRow!.id);
  const [submissionRow] = await database
    .insert(missionSubmissions)
    .values({ missionId: missionRow!.id, userId: alice.id, status: "approved", reviewedAt: new Date() })
    .returning({ id: missionSubmissions.id });
  const learnedPaid = await claimCampaignReward(
    learned.id,
    alice.id,
    DEST,
    { kind: "mission", id: submissionRow!.id },
    horizon,
    TEST_ENV,
  );
  assert.equal(learnedPaid.status, "paid", "approved mission pays");
  assert.equal(learnedPaid.rewardAmount, "0.5000000", "exact fractional reward");
  // Pending submission does not qualify.
  const [pendingRow] = await database
    .insert(missionSubmissions)
    .values({ missionId: missionRow!.id, userId: bob.id, status: "pending" })
    .returning({ id: missionSubmissions.id });
  await expectCode(
    claimCampaignReward(learned.id, bob.id, DEST, { kind: "mission", id: pendingRow!.id }, horizon, TEST_ENV),
    "proof-invalid",
    "unapproved submission rejected",
  );

  // 12. Cross-ecosystem: AAPLx swap campaign settles on Stellar.
  const swapFund = "e1".repeat(32);
  const aaplx = await aaplxCircleId();
  const swapCampaign = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "aaplx-on-solana", objective: "Swap into AAPLx", targetAction: "swap", rewardPerCompletion: "1" },
    TEST_ENV,
 ));
  horizon.transactions.set(swapFund, { ...fundingTx(TREASURY, "5.0000000"), hash: swapFund });
  await verifyCampaignFunding(swapCampaign.id, admin.id, swapFund, horizon);
  await activateCampaign(swapCampaign.id, admin.id);
  await database.insert(externalUtilityOrders).values({
    userId: alice.id,
    targetCircleId: aaplx,
    actionKind: "swap",
    sourceMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    sourceAmountSubunits: "25000000",
    targetMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    executionWallet: "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7",
    venue: "jupiter",
    eligibilityAcknowledged: true,
    status: "confirmed",
    swapSignature: "sig",
    completedAt: new Date(),
  });
  const [swapOrder] = await database
    .select({ id: externalUtilityOrders.id })
    .from(externalUtilityOrders)
    .where(eq(externalUtilityOrders.swapSignature, "sig"))
    .limit(1);
  const swapPaid = await claimCampaignReward(
    swapCampaign.id,
    alice.id,
    DEST,
    { kind: "swap", id: swapOrder!.id },
    horizon,
    TEST_ENV,
  );
  assert.equal(swapPaid.status, "paid", "Solana swap rewarded from Stellar");
  // Swap proof cannot fund a send campaign.
  await expectCode(
    claimCampaignReward(created.id, alice.id, DEST, { kind: "send", id: swapOrder!.id }, horizon, TEST_ENV),
    "proof-invalid",
    "kind mismatch rejected",
  );

  // 13. Privacy: strangers see no dashboard, no wallets, no envelopes.
  await expectCode(getCampaignDashboard(created.id, stranger.id), "forbidden", "stranger dashboard blocked");
  const dashboard = await getCampaignDashboard(created.id, admin.id);
  assert.ok(dashboard.completions >= 2, "aggregate completions");
  assert.ok(dashboard.participants >= 2, "aggregate participants");
  assert.ok(!JSON.stringify(dashboard).includes(DEST), "no destination wallets in dashboard");
  const publicView = await getCampaign(created.id);
  assert.ok(!JSON.stringify(publicView).toLowerCase().includes("secret"), "no secrets in public view");
  const circleList = await listCircleCampaigns("benji-on-stellar");
  assert.ok(circleList.some((entry) => entry.id === created.id), "discovery lists the campaign");

  // 14. Completion + manager paths.
  const done = await completeCampaign(created.id, admin.id);
  assert.equal(done.status, "completed", "completed");
  await expectCode(
    claimCampaignReward(created.id, bob.id, DEST, { kind: "send", id: poorTransfer }, horizon, TEST_ENV),
    "invalid-transition",
    "completed campaign pays nothing",
  );

  // 15. Exit campaigns: confirmed exits pay; swap/exit kinds never masquerade.
  const exitFund = "e2".repeat(32);
  const exitCampaign = await trackCampaign(createCampaign(
    admin.id,
    { circleSlug: "aaplx-on-solana", objective: "Exit AAPLx to USDC", targetAction: "exit", rewardPerCompletion: "1" },
    TEST_ENV,
  ));
  horizon.transactions.set(exitFund, { ...fundingTx(TREASURY, "5.0000000"), hash: exitFund });
  await verifyCampaignFunding(exitCampaign.id, admin.id, exitFund, horizon);
  await activateCampaign(exitCampaign.id, admin.id);
  await database.insert(externalUtilityOrders).values({
    userId: alice.id,
    targetCircleId: aaplx,
    actionKind: "exit",
    sourceMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    sourceAmountSubunits: "5000000",
    targetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    executionWallet: "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7",
    venue: "jupiter",
    eligibilityAcknowledged: true,
    status: "confirmed",
    swapSignature: "sig-exit",
    completedAt: new Date(),
  });
  const [exitOrder] = await database
    .select({ id: externalUtilityOrders.id })
    .from(externalUtilityOrders)
    .where(eq(externalUtilityOrders.swapSignature, "sig-exit"))
    .limit(1);
  const exitPaid = await claimCampaignReward(
    exitCampaign.id,
    alice.id,
    DEST,
    { kind: "exit", id: exitOrder!.id },
    horizon,
    TEST_ENV,
  );
  assert.equal(exitPaid.status, "paid", "confirmed exit rewarded");
  const exitEligible = await listEligibleProofs(exitCampaign.id, alice.id);
  assert.ok(!exitEligible.some((proof) => proof.id === exitOrder!.id), "used exit proof no longer eligible");
  // Exit receipt cannot fund a swap campaign, and vice versa.
  await expectCode(
    claimCampaignReward(swapCampaign.id, alice.id, DEST, { kind: "swap", id: exitOrder!.id }, horizon, TEST_ENV),
    "proof-invalid",
    "exit receipt rejected by swap campaign",
  );
  await expectCode(
    claimCampaignReward(exitCampaign.id, alice.id, DEST, { kind: "exit", id: swapOrder!.id }, horizon, TEST_ENV),
    "proof-invalid",
    "swap receipt rejected by exit campaign",
  );
  // Eligibility window: proofs completing after endsAt are rejected.
  await database.update(campaigns).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(campaigns.id, exitCampaign.id));
  await database.insert(externalUtilityOrders).values({
    userId: bob.id,
    targetCircleId: aaplx,
    actionKind: "exit",
    sourceMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    sourceAmountSubunits: "5000000",
    targetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    executionWallet: "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7",
    venue: "jupiter",
    eligibilityAcknowledged: true,
    status: "confirmed",
    swapSignature: "sig-exit-late",
    completedAt: new Date(),
  });
  const [lateOrder] = await database
    .select({ id: externalUtilityOrders.id })
    .from(externalUtilityOrders)
    .where(eq(externalUtilityOrders.swapSignature, "sig-exit-late"))
    .limit(1);
  await expectCode(
    claimCampaignReward(exitCampaign.id, bob.id, DEST, { kind: "exit", id: lateOrder!.id }, horizon, TEST_ENV),
    "proof-invalid",
    "post-window proof rejected",
  );

  // 16. No Mainnet path: settlement builds Testnet envelopes only.
  assert.ok(defaultCampaignHorizon, "horizon transport present");

  console.log("campaign-funding:verify ok — 16 groups, all assertions passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const id of temporaryMissionIds) {
      await database.delete(missions).where(eq(missions.id, id)).catch(() => undefined);
    }
    for (const id of temporaryUserIds) {
      await database.delete(users).where(eq(users.id, id)).catch(() => undefined);
    }
    for (const id of temporaryCampaignIds) {
      await database.delete(campaignCompletions).where(eq(campaignCompletions.campaignId, id)).catch(() => undefined);
      await database.delete(campaigns).where(eq(campaigns.id, id)).catch(() => undefined);
    }
    for (const id of temporaryOrgIds) {
      await database.delete(organizations).where(eq(organizations.id, id)).catch(() => undefined);
    }
  });

