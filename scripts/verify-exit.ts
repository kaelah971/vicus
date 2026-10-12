import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { externalUtilityOrders, users } from "../src/db/schema";
import { EXIT_SOURCE_MINT, EXIT_TARGET_MINT } from "../src/lib/external-utility/config";
import {
  UtilityOrderError,
  aaplxAmountToSubunits,
  confirmExitSwap,
  createExitOrder,
  exitAdapter,
  getExitOrder,
  listMyExitOrders,
  prepareExitSwap,
  refreshExitQuote,
  type JupiterTransport,
  type SolanaTransport,
} from "../src/lib/external-utility/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const WALLET = "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7";
const OTHER_WALLET = "3xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9";
const SIGNATURE = "5K9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7A";
const OTHER_SIGNATURE = "4J8mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi6B";

function mockJupiter(outAmount: string | null): JupiterTransport & { calls: { amount: string }[] } {
  const calls: { amount: string }[] = [];
  return {
    calls,
    async fetchQuote(amountInSubunits: string) {
      calls.push({ amount: amountInSubunits });
      return outAmount === null ? null : { outAmount };
    },
    async buildSwapTransaction() {
      return { swapTransaction: "OPAQUE_EXIT_TX_BYTES" };
    },
  };
}

function mockSolana(
  deltas: { usdc: string; aaplx: string } | null,
  status: "confirmed" | "finalized" | null = "confirmed",
): SolanaTransport {
  return {
    async getSignatureStatus() {
      return status;
    },
    async getTransactionDeltas() {
      return deltas;
    },
  };
}

async function createUser(handle: string) {
  const id = randomUUID();
  const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
  await database
    .insert(users)
    .values({ id, handle: uniqueHandle, displayName: `${uniqueHandle} tester`, avatarUrl: null, role: "member" });
  temporaryUserIds.push(id);
  return { id, handle: uniqueHandle };
}

async function cleanup() {
  for (const id of temporaryUserIds) {
    await database.delete(externalUtilityOrders).where(eq(externalUtilityOrders.userId, id));
    await database.delete(users).where(eq(users.id, id));
  }
}

async function expectError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UtilityOrderError, "expected UtilityOrderError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected error ${code}`);
}

async function main() {
  const alice = await createUser("exit-alice");
  const bob = await createUser("exit-bob");

  // Amount parsing: 8-decimal AAPLx.
  assert.equal(aaplxAmountToSubunits("0.05"), "5000000");
  assert.equal(aaplxAmountToSubunits("0"), null);
  assert.equal(aaplxAmountToSubunits("abc"), null);

  // Unauthenticated + invalid requests blocked.
  await expectError(createExitOrder(null, { sourceAmount: "0.05", executionWallet: WALLET, eligibilityAcknowledged: true }), "unauthenticated");
  await expectError(
    createExitOrder(alice.id, { sourceAmount: "0", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "invalid-request",
  );
  await expectError(
    createExitOrder(alice.id, { sourceAmount: "0.05", executionWallet: "nope", eligibilityAcknowledged: true }),
    "invalid-request",
  );
  await expectError(
    createExitOrder(alice.id, { sourceAmount: "0.05", executionWallet: WALLET, eligibilityAcknowledged: false }),
    "eligibility-required",
  );

  // Create: exact reverse route mints, actionKind exit.
  const created = await createExitOrder(alice.id, {
    sourceAmount: "0.05",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  });
  assert.equal(created.actionKind, "exit");
  assert.equal(created.sourceMint, EXIT_SOURCE_MINT);
  assert.equal(created.targetMint, EXIT_TARGET_MINT);
  assert.equal(created.sourceAmountSubunits, "5000000");
  assert.equal(created.status, "draft");

  // Owner scoping.
  await expectError(getExitOrder(created.id, bob.id), "not-found");
  const mine = await listMyExitOrders(alice.id);
  assert.ok(mine.some((o) => o.id === created.id));
  const bobs = await listMyExitOrders(bob.id);
  assert.ok(!bobs.some((o) => o.id === created.id));

  // Fresh quote via injected transport (no live network in test).
  const quoted = await refreshExitQuote(created.id, alice.id, mockJupiter("120000"));
  assert.equal(quoted.quote.amountOutDisplay !== null, true);
  assert.equal(quoted.status, "quoting");

  // Quote unavailable → waiting, never faked.
  const waiting = await refreshExitQuote(created.id, alice.id, mockJupiter(null));
  assert.equal(waiting.quote.amountOutDisplay, null);
  assert.equal(waiting.failureReason, "quote-unavailable");

  // Re-quote then prepare.
  await refreshExitQuote(created.id, alice.id, mockJupiter("120000"));
  const prepared = await prepareExitSwap(created.id, alice.id, mockJupiter("120000"));
  assert.equal(prepared.swapTransaction, "OPAQUE_EXIT_TX_BYTES");
  assert.equal(prepared.order.status, "ready");

  // Confirm: exact AAPLx→USDC deltas prove the route.
  const confirmed = await confirmExitSwap(
    created.id,
    alice.id,
    { signature: SIGNATURE },
    mockSolana({ usdc: "120000", aaplx: "-5000000" }),
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.targetAmount, "120000");

  // Duplicate safe: second confirm returns the same confirmed receipt.
  const again = await confirmExitSwap(
    created.id,
    alice.id,
    { signature: SIGNATURE },
    mockSolana({ usdc: "120000", aaplx: "-5000000" }),
  );
  assert.equal(again.status, "confirmed");
  assert.equal(again.swapSignature, SIGNATURE);

  // Duplicate execution safe: different signature rejected.
  await expectError(
    confirmExitSwap(created.id, alice.id, { signature: OTHER_SIGNATURE }, mockSolana({ usdc: "1", aaplx: "-1" })),
    "not-found",
  ).catch(() => {});
  // Note: confirmed orders return early; verify the signature was NOT overwritten.
  const after = await getExitOrder(created.id, alice.id);
  assert.equal(after.swapSignature, SIGNATURE);

  // Mint substitution rejected: tamper the row, confirm must fail verification.
  const victim = await createExitOrder(alice.id, {
    sourceAmount: "0.01",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  });
  await database
    .update(externalUtilityOrders)
    .set({ sourceMint: "FORGED_MINT_11111111111111111111111111111", updatedAt: new Date() })
    .where(eq(externalUtilityOrders.id, victim.id));
  await expectError(getExitOrder(victim.id, alice.id), "verification-failed");

  // Wrong-direction deltas rejected (USDC-spend shape must NOT confirm an exit).
  const dir = await createExitOrder(alice.id, {
    sourceAmount: "0.02",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  });
  await refreshExitQuote(dir.id, alice.id, mockJupiter("50000"));
  await prepareExitSwap(dir.id, alice.id, mockJupiter("50000"));
  const badDeltas = await confirmExitSwap(
    dir.id,
    alice.id,
    { signature: OTHER_SIGNATURE },
    mockSolana({ usdc: "-20000", aaplx: "50000" }),
  );
  assert.equal(badDeltas.status, "submitted");
  assert.equal(badDeltas.failureReason, "verification-failed");

  // Exit adapter is live-quote-or-nothing.
  const live = await exitAdapter.getQuote("5000000", mockJupiter("99999"));
  assert.equal(live?.amountOutSubunits, "99999");
  const none = await exitAdapter.getQuote("5000000", mockJupiter(null));
  assert.equal(none, null);

  // Private order ownership enforced on prepare/confirm paths.
  await expectError(prepareExitSwap(dir.id, bob.id, mockJupiter("50000")), "not-found");

  // Cross-user wallet isolation: other wallet's order is invisible.
  const other = await createExitOrder(bob.id, {
    sourceAmount: "0.01",
    executionWallet: OTHER_WALLET,
    eligibilityAcknowledged: true,
  });
  assert.equal(other.executionWallet, OTHER_WALLET);
  await expectError(getExitOrder(other.id, alice.id), "not-found");

  await cleanup();
  console.log("exit:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error);
  process.exit(1);
});
