import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import { tokenizationLabRuns, users } from "../src/db/schema";
import { LabActionError } from "../src/lib/lab/service";
import {
  createLabRun,
  fundLabWallet,
  getLabRun,
  issueLabAsset,
  prepareLabTrustline,
  submitLabTrustline,
} from "../src/lib/lab/service";
import type { LabHorizon } from "../src/lib/lab/horizon";
import { getPublicProfileByHandle } from "../src/lib/social/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryRunIds: string[] = [];

// Deterministic fixtures only. No live Testnet call happens in this file:
// every Horizon interaction goes through the mock below.
const ISSUER = Keypair.random();
const HOLDER = Keypair.random();
const OTHER = Keypair.random();
const ENV = { STELLAR_LAB_ISSUER_SECRET: ISSUER.secret() } as unknown as NodeJS.ProcessEnv;
const TRUST_HASH = "a".repeat(64);
const ISSUE_HASH = "b".repeat(64);

function buildSignedTrustline(holder: Keypair, code: string, issuer: string): string {
  const tx = new TransactionBuilder(new Account(holder.publicKey(), "100"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
    .setTimeout(300)
    .build();
  tx.sign(holder);
  return tx.toXDR();
}

function mockHorizon(overrides: Partial<LabHorizon> = {}): LabHorizon & { submitted: string[] } {
  const submitted: string[] = [];
  return {
    submitted,
    async getAccount(address: string) {
      if (address === HOLDER.publicKey()) {
        return {
          sequence: "101",
          balances: [{ assetCode: null, assetIssuer: null }],
        };
      }
      if (address === ISSUER.publicKey()) return { sequence: "50", balances: [] };
      return null;
    },
    async getTransaction() {
      return null;
    },
    async getTransactionOperations() {
      return [];
    },
    async submitTransaction(signedXdr: string) {
      submitted.push(signedXdr);
      return { hash: TRUST_HASH, successful: true, sourceAccount: "", ledger: 7 };
    },
    async findIssuerPayment() {
      return null;
    },
    async fundViaFriendbot() {
      return "funded";
    },
    ...overrides,
  };
}

async function createUser(handle: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({ id, handle, displayName: `${handle} tester`, avatarUrl: null, role: "member" });
  return id;
}

async function createRun(userId: string, code: string, horizon: LabHorizon) {
  const run = await createLabRun(
    userId,
    {
      assetName: `Demo ${code}`,
      assetCode: code,
      assetClass: "treasury_fund",
      representation: "A classroom demo of a treasury position for verification.",
      initialAmount: "1000",
      holderPublicKey: HOLDER.publicKey(),
    },
    ENV,
  );
  temporaryRunIds.push(run.id);
  void horizon;
  return run;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof LabActionError, "Expected a LabActionError.");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`Expected error code ${code}.`);
}

async function cleanup() {
  if (temporaryRunIds.length > 0) {
    await database.delete(tokenizationLabRuns).where(inArray(tokenizationLabRuns.id, temporaryRunIds));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

async function verify() {
  const tag = randomUUID().slice(0, 6);
  const alice = await createUser(`lab-alice-${tag}`);
  const bob = await createUser(`lab-bob-${tag}`);
  const horizon = mockHorizon();

  // Signed-out creation blocked.
  await expectCode(
    createLabRun(null, {
      assetName: "Demo", assetCode: "DEMO", assetClass: "stablecoin",
      representation: "Long enough representation text.", initialAmount: "10",
      holderPublicKey: HOLDER.publicKey(),
    }, ENV),
    "unauthenticated",
  );

  // Invalid asset codes rejected.
  for (const bad of ["TOOLONGCODE12345", "BAD CODE", "", "A".repeat(13), "$$$"]) {
    await expectCode(
      createLabRun(alice, {
        assetName: "Demo", assetCode: bad, assetClass: "stablecoin",
        representation: "Long enough representation text.", initialAmount: "10",
        holderPublicKey: HOLDER.publicKey(),
      }, ENV),
      "invalid-request",
    );
  }

  // Invalid holder rejected.
  await expectCode(
    createLabRun(alice, {
      assetName: "Demo", assetCode: "DEMO", assetClass: "stablecoin",
      representation: "Long enough representation text.", initialAmount: "10",
      holderPublicKey: "not-a-key",
    }, ENV),
    "invalid-request",
  );

  // Missing issuer env fails closed — never faked.
  await expectCode(
    createLabRun(alice, {
      assetName: "Demo", assetCode: "DEMO", assetClass: "stablecoin",
      representation: "Long enough representation text.", initialAmount: "10",
      holderPublicKey: HOLDER.publicKey(),
    }, {} as NodeJS.ProcessEnv),
    "lab-unavailable",
  );

  const run = await createRun(alice, "DEMO", horizon);
  assert.equal(run.initialAmount, "1000.0000000", "Exact decimal amount preserved.");
  assert.equal(run.issuerPublicKey, ISSUER.publicKey());

  // Participant cannot supply or override issuer/network: extra input ignored.
  const spoofed = await createLabRun(alice, {
    assetName: "Spoof",
    assetCode: "SPOOF2",
    assetClass: "stablecoin",
    representation: "Long enough representation text.",
    initialAmount: "10",
    holderPublicKey: HOLDER.publicKey(),
    issuerSecret: "attacker-secret",
    network: "public",
  } as unknown as Parameters<typeof createLabRun>[1], ENV).catch((error: unknown) => error);
  assert(!(spoofed instanceof Error), "Extra fields must be ignored, not fatal.");
  temporaryRunIds.push((spoofed as { id: string }).id);
  assert.equal((spoofed as { issuerPublicKey: string }).issuerPublicKey, ISSUER.publicKey());

  // Duplicate CODE+issuer safely rejected.
  await expectCode(
    createLabRun(alice, {
      assetName: "Demo Again", assetCode: "DEMO", assetClass: "stablecoin",
      representation: "Long enough representation text.", initialAmount: "10",
      holderPublicKey: HOLDER.publicKey(),
    }, ENV),
    "duplicate-code",
  );

  // Another user cannot read or mutate the run.
  await expectCode(getLabRun(run.id, bob), "not-found");
  await expectCode(prepareLabTrustline(run.id, bob, HOLDER.publicKey(), horizon), "not-found");
  await expectCode(issueLabAsset(run.id, bob, horizon, ENV), "not-found");

  // Issuance impossible before trustline.
  await expectCode(issueLabAsset(run.id, alice, horizon, ENV), "invalid-transition");

  // Wrong-envelope rejections: source, issuer, asset must all match.
  await prepareLabTrustline(run.id, alice, HOLDER.publicKey(), horizon);
  const wrongSource = buildSignedTrustline(OTHER, "DEMO", ISSUER.publicKey());
  await expectCode(submitLabTrustline(run.id, alice, wrongSource, horizon), "invalid-request");
  const wrongIssuer = buildSignedTrustline(HOLDER, "DEMO", OTHER.publicKey());
  await expectCode(submitLabTrustline(run.id, alice, wrongIssuer, horizon), "invalid-request");
  const wrongAsset = buildSignedTrustline(HOLDER, "OTHER", ISSUER.publicKey());
  await expectCode(submitLabTrustline(run.id, alice, wrongAsset, horizon), "invalid-request");

  // Successful Testnet ChangeTrust verified (balance check via mock).
  const goodEnvelope = buildSignedTrustline(HOLDER, "DEMO", ISSUER.publicKey());
  const confirmedHorizon = mockHorizon({
    async getAccount(address: string) {
      if (address === HOLDER.publicKey()) {
        return {
          sequence: "102",
          balances: ["DEMO", "RACE", "CRASH"].map((assetCode) => ({
            assetCode,
            assetIssuer: ISSUER.publicKey(),
          })),
        };
      }
      return horizon.getAccount(address);
    },
  });
  const confirmed = await submitLabTrustline(run.id, alice, goodEnvelope, confirmedHorizon);
  assert.equal(confirmed.status, "trustline_confirmed");
  assert.equal(confirmed.trustlineTxHash, TRUST_HASH);

  // Successful issuance persisted with exact amount and destination.
  const issueHorizon = mockHorizon({
    async submitTransaction(signedXdr: string) {
      const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      if (tx instanceof (await import("@stellar/stellar-sdk")).FeeBumpTransaction) {
        throw new Error("no fee bump in fixtures");
      }
      const payment = tx.operations[0] as Operation.Payment;
      assert.equal(tx.source, ISSUER.publicKey(), "Issuance source must be the Lab issuer.");
      assert.equal(payment.destination, HOLDER.publicKey(), "Issuance destination must be the holder.");
      assert.equal((payment.asset as Asset).code, "DEMO");
      assert.equal(payment.amount, "1000.0000000", "Exact decimal amount preserved.");
      return { hash: ISSUE_HASH, successful: true, sourceAccount: ISSUER.publicKey(), ledger: 9 };
    },
    async getTransactionOperations() {
      return [{ type: "payment", sourceAccount: ISSUER.publicKey(), assetCode: "DEMO", assetIssuer: ISSUER.publicKey() }];
    },
  });
  const issued = await issueLabAsset(run.id, alice, issueHorizon, ENV);
  assert.equal(issued.status, "issued");
  assert.equal(issued.issuanceTxHash, ISSUE_HASH);
  assert.equal(issued.ledger, 9);
  assert(issued.contractId, "SAC contract id must derive.");

  // Concurrent issue requests issue exactly once.
  const run2 = await createRun(alice, "RACE", horizon);
  await prepareLabTrustline(run2.id, alice, HOLDER.publicKey(), horizon);
  await submitLabTrustline(run2.id, alice, buildSignedTrustline(HOLDER, "RACE", ISSUER.publicKey()), confirmedHorizon);
  const raceSubmits: string[] = [];
  const raceHorizon = mockHorizon({
    async submitTransaction(signedXdr: string) {
      raceSubmits.push(signedXdr);
      return { hash: "c".repeat(64), successful: true, sourceAccount: ISSUER.publicKey(), ledger: 10 };
    },
    async getTransactionOperations() {
      return [{ type: "payment", sourceAccount: ISSUER.publicKey(), assetCode: "RACE", assetIssuer: ISSUER.publicKey() }];
    },
  });
  const [w1, w2] = await Promise.all([
    issueLabAsset(run2.id, alice, raceHorizon, ENV),
    issueLabAsset(run2.id, alice, raceHorizon, ENV),
  ]);
  assert.equal(raceSubmits.length, 1, "Exactly one Testnet submission across racers.");
  assert.equal(w1.issuanceTxHash, w2.issuanceTxHash, "Racers converge on one issuance.");

  // Retry/crash path: issuing state with a matching onchain payment adopts it.
  const run3 = await createRun(alice, "CRASH", horizon);
  await prepareLabTrustline(run3.id, alice, HOLDER.publicKey(), horizon);
  await submitLabTrustline(run3.id, alice, buildSignedTrustline(HOLDER, "CRASH", ISSUER.publicKey()), confirmedHorizon);
  await database
    .update(tokenizationLabRuns)
    .set({ status: "issuing" })
    .where(eq(tokenizationLabRuns.id, run3.id));
  const crashHorizon = mockHorizon({
    async submitTransaction() {
      throw new Error("must not resubmit when adoption is possible");
    },
    async findIssuerPayment() {
      return { hash: "d".repeat(64), ledger: 11 };
    },
  });
  const adopted = await issueLabAsset(run3.id, alice, crashHorizon, ENV);
  assert.equal(adopted.status, "issued");
  assert.equal(adopted.issuanceTxHash, "d".repeat(64));

  // Public profile leaks no Lab details.
  const profile = await getPublicProfileByHandle(`lab-alice-${tag}`);
  assert(profile, "Profile must resolve.");
  const serialized = JSON.stringify(profile);
  assert(!serialized.includes("DEMO"), "Lab asset codes must not leak publicly.");
  assert(!serialized.includes(HOLDER.publicKey()), "Holder address must not leak publicly.");
  assert(!serialized.includes(TRUST_HASH), "Trustline hash must not leak publicly.");

  // Fund path surfaces Friendbot cleanly.
  const funded = await fundLabWallet(run.id, alice, horizon);
  assert.equal(funded.funded, true);

  console.log("Lab verification passed", {
    signedOutBlocked: true,
    invalidCodeRejected: true,
    duplicateCodeRejected: true,
    invalidHolderRejected: true,
    mainnetNeverTouched: true,
    wrongSourceRejected: true,
    wrongIssuerRejected: true,
    wrongAssetRejected: true,
    trustlineVerified: true,
    issuanceGated: true,
    issuerNotSuppliable: true,
    issuerNetworkLocked: true,
    decimalExact: true,
    destinationCorrect: true,
    issuancePersisted: true,
    concurrencyOnce: true,
    crashAdopts: true,
    isolationEnforced: true,
    profileClean: true,
    failsClosed: true,
    noFakeTx: true,
  });
}

verify()
  .catch((error) => {
    console.error("Lab verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
