import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetTransfers, circles, crosschainTransfers, externalUtilityOrders, users } from "../src/db/schema";
import { watchCircle } from "../src/lib/data/watch";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import { createUtilityOrder, refreshUtilityQuote, confirmUtilitySwap } from "../src/lib/external-utility/service";
import { createExitOrder } from "../src/lib/external-utility/service";
import { getWatchCenter, WatchCenterError } from "../src/lib/watch-center/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryTransferIds: string[] = [];

const WALLET = "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7";
const SIGNATURE = "5K9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7A";

function mockQuote(outAmount: string | null) {
  return {
    async fetchQuote() {
      return outAmount === null ? null : { outAmount };
    },
    async buildSwapTransaction() {
      return { swapTransaction: "OPAQUE_WATCH_TX" };
    },
  };
}

function mockSolana(deltas: { usdc: string; aaplx: string } | null) {
  return {
    async getSignatureStatus() {
      return "confirmed" as const;
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
  for (const id of temporaryTransferIds) {
    await database.delete(assetTransfers).where(eq(assetTransfers.id, id)).catch(() => {});
  }
  for (const id of temporaryUserIds) {
    await database.delete(externalUtilityOrders).where(eq(externalUtilityOrders.userId, id));
    await database.delete(crosschainTransfers).where(eq(crosschainTransfers.userId, id));
    await database.delete(users).where(eq(users.id, id));
  }
}

async function main() {
  // 1. Private activity requires auth.
  try {
    await getWatchCenter(null);
    assert.fail("expected unauthenticated");
  } catch (error) {
    assert.ok(error instanceof WatchCenterError && error.code === "unauthenticated");
  }

  const alice = await createUser("wc-alice");
  const bob = await createUser("wc-bob");

  // 2. Watching: engine-backed assets, no ownership implied.
  assert.equal(await watchCircle(alice.id, "benji-on-stellar"), true);
  assert.equal(await watchCircle(alice.id, "aaplx-on-solana"), true);
  const afterWatch = await getWatchCenter(alice.id);
  assert.equal(afterWatch.counts.watching, 2, "two watched assets");
  const benji = afterWatch.watching.find((w) => w.slug === "benji-on-stellar")!;
  assert.ok(benji, "BENJI watched");
  assert.ok(benji.actions.length > 0 && benji.actions.length <= 3, "compact engine actions");
  const engineKinds = (await resolveAssetActions("benji-on-stellar", "Stellar")).map((a) => a.kind);
  assert.ok(benji.actions.every((a) => (engineKinds as string[]).includes(a.kind)), "actions come from the engine");
  const aaplx = afterWatch.watching.find((w) => w.slug === "aaplx-on-solana")!;
  assert.deepEqual(aaplx.actions.map((a) => a.kind), ["access", "swap", "exit"], "AAPLx engine actions");
  assert.ok(aaplx.openHref === "/circles/aaplx-on-solana", "canonical open link");
  const watchPayload = JSON.stringify(afterWatch.watching);
  assert.ok(!/balance|holding|price|pnl|profit|apy|health|liquidation|collateral|yield/i.test(watchPayload), "watching carries no position data");

  // 3. Swap draft → needs attention with a canonical CTA.
  const draft = await createUtilityOrder(alice.id, {
    targetSlug: "aaplx-on-solana", sourceAmount: "25", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  let center = await getWatchCenter(alice.id);
  const draftActivity = center.needsAttention.find((a) => a.id === `swap:${draft.id}`);
  assert.ok(draftActivity, "draft swap needs attention");
  assert.equal(draftActivity!.actionRequired, "request-quote");
  assert.equal(draftActivity!.retryable, true);
  assert.equal(draftActivity!.href, "/swap/aaplx-on-solana", "CTA links the canonical flow");

  // 4. Exit draft normalizes alongside; confirmed swap completes.
  const exit = await createExitOrder(alice.id, {
    sourceAmount: "0.05", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  await refreshUtilityQuote(draft.id, alice.id, mockQuote("73000"));
  const { confirmUtilitySwap: confirm } = await import("../src/lib/external-utility/service");
  await confirm(draft.id, alice.id, { signature: SIGNATURE }, mockSolana({ usdc: "-25000000", aaplx: "73000" }));
  center = await getWatchCenter(alice.id);
  assert.ok(center.completed.some((a) => a.id === `swap:${draft.id}`), "confirmed swap completed");
  assert.ok(center.needsAttention.some((a) => a.id === `exit:${exit.id}`), "exit draft needs attention");
  assert.ok(center.needsAttention.some((a) => a.actionRequired === "refresh-quote" || a.actionRequired === "request-quote"), "quote CTA present");

  // 5. CCTP draft → needs attention; same-network send confirmed → completed.
  const [usdcCircle] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, "usdc-on-stellar")).limit(1);
  assert.ok(usdcCircle, "USDC circle exists");
  const sendId = randomUUID();
  temporaryTransferIds.push(sendId);
  await database.insert(assetTransfers).values({
    id: sendId,
    senderUserId: alice.id,
    recipientUserId: bob.id,
    contactId: null,
    network: "stellar_mainnet",
    circleId: usdcCircle.id,
    assetCode: "USDC",
    assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount: "10.0000000",
    destinationAddress: `G${"B".repeat(55)}`,
    status: "confirmed",
    transactionHash: `hash-${sendId.slice(0, 8)}`,
    ledger: 123456,
    failureReason: null,
    lastError: null,
    confirmedAt: new Date(),
  });
  const [cctp] = await database
    .insert(crosschainTransfers)
    .values({
      userId: alice.id,
      sourceNetwork: "stellar_testnet",
      sourceWallet: `G${"C".repeat(55)}`,
      destinationNetwork: "base",
      asset: "USDC",
      amount: "5.000000",
      destinationAddress: "0x1111111111111111111111111111111111111111",
      status: "attesting",
      forwarding: true,
      retryable: true,
      lastError: null,
    })
    .returning({ id: crosschainTransfers.id });
  center = await getWatchCenter(alice.id);
  const cctpActivity = center.active.find((a) => a.id === `cctp:${cctp!.id}`);
  assert.ok(cctpActivity, "attesting transfer is active");
  assert.ok(/attestation/i.test(cctpActivity!.detail), "honest stage label");
  const sendActivity = center.completed.find((a) => a.id === `send:${sendId}`);
  assert.ok(sendActivity, "confirmed send completed");
  assert.ok(!JSON.stringify(center).includes(`G${"B".repeat(55)}`), "no raw destination address leaks");
  assert.ok(!JSON.stringify(center).includes(`G${"C".repeat(55)}`), "no source wallet leaks");

  // 6. Retryable + cross-user isolation + determinism + no duplicates.
  const failed = await createUtilityOrder(alice.id, {
    targetSlug: "aaplx-on-solana", sourceAmount: "9", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  await refreshUtilityQuote(failed.id, alice.id, mockQuote("1000"));
  const { prepareUtilitySwap } = await import("../src/lib/external-utility/service");
  await prepareUtilitySwap(failed.id, alice.id, mockQuote("1000"));
  await confirmUtilitySwap(failed.id, alice.id, { signature: SIGNATURE }, mockSolana(null));
  center = await getWatchCenter(alice.id);
  const retryable = center.needsAttention.find((a) => a.id === `swap:${failed.id}`);
  assert.ok(retryable && retryable.retryable && retryable.actionRequired === "review-and-retry", "retryable classified");
  const bobCenter = await getWatchCenter(bob.id);
  assert.equal(bobCenter.counts.watching, 0, "no leaked watches");
  assert.equal(bobCenter.needsAttention.length + bobCenter.active.length + bobCenter.completed.length, 0, "no leaked activity");
  const again = await getWatchCenter(alice.id);
  assert.deepEqual(again, center, "deterministic ordering");
  const ids = [...center.needsAttention, ...center.active, ...center.completed].map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate entries");

  // 7. Public asset surface stays safe (spot-check via watching payload).
  assert.ok(!/userId|orderId|privateKey|seed|secret/i.test(JSON.stringify(center)), "no private material");

  await cleanup();
  console.log("watch-center:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
