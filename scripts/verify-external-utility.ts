import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { externalUtilityOrders, users } from "../src/db/schema";
import { ACCESS_MAINNET_ENABLED } from "../src/lib/access/config";
import { getExecutionGate } from "../src/lib/asset-access/service";
import { getSendableAsset } from "../src/lib/send/service";
import { resolveAssetActions, ACTION_ADAPTERS } from "../src/lib/asset-actions/service";
import {
  SWAP_SOURCE_MINT,
  SWAP_TARGET_MINT,
  SWAP_VENUE,
} from "../src/lib/external-utility/config";
import {
  UtilityOrderError,
  confirmUtilitySwap,
  createUtilityOrder,
  formatSubunits,
  getUtilityOrder,
  listMyUtilityOrders,
  prepareUtilitySwap,
  refreshUtilityQuote,
  swapAdapter,
  usdcAmountToSubunits,
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

function mockJupiter(outAmount: string | null): JupiterTransport & { calls: { amount: string }[] } {
  const calls: { amount: string }[] = [];
  return {
    calls,
    async fetchQuote(amountInSubunits: string) {
      calls.push({ amount: amountInSubunits });
      return outAmount === null ? null : { outAmount };
    },
    async buildSwapTransaction() {
      return { swapTransaction: "OPAQUE_UNSIGNED_TX_BYTES" };
    },
  };
}

function mockSolana(deltas: { usdc: string; aaplx: string } | null, status: "confirmed" | "finalized" | null = "confirmed"): SolanaTransport {
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
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
    try {
      await database
        .insert(users)
        .values({ id, handle: uniqueHandle, displayName: `${uniqueHandle} tester`, avatarUrl: null, role: "member" });
      temporaryUserIds.push(id);
      return { id, handle: uniqueHandle };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function expectCode(promise: Promise<unknown>, code: string, label: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UtilityOrderError, `${label}: expected UtilityOrderError`);
    assert.equal((error as UtilityOrderError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

async function main() {
  const owner = await createUser("swap-owner");
  const stranger = await createUser("swap-stranger");

  // 1. Exact asset/contract pinned; anything else rejected.
  await expectCode(
    createUtilityOrder(owner.id, { targetSlug: "aaplc-on-base", sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "unsupported-asset",
    "Base twin rejected",
  );
  await expectCode(
    createUtilityOrder(owner.id, { targetSlug: "usdc-on-stellar", sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "unsupported-asset",
    "stablecoin rejected",
  );
  const created = await createUtilityOrder(owner.id, {
    targetSlug: "aaplx-on-solana",
    sourceAmount: "25",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  });
  assert.equal(created.targetMint, "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", "exact AAPLx mint pinned");
  assert.equal(created.sourceMint, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "exact USDC mint pinned");
  assert.equal(created.sourceAmountSubunits, "25000000", "25 USDC exact subunits");
  assert.equal(created.venue, "jupiter", "venue pinned");

  // 2. Protocol/market pinned: adapter queries only server-owned mints.
  const watching = mockJupiter("7317016");
  const quote = await swapAdapter.getQuote("25000000", watching);
  assert.ok(quote, "live quote parsed");
  assert.equal(quote!.amountOutSubunits, "7317016", "exact out amount, no floats");
  assert.equal(quote!.minOutSubunits, "7280430", "50bps minimum exact (7317016*9950/10000 floored)");

  // 3/4. Action appears through the Asset Action Engine — no second system.
  const actions = await resolveAssetActions("aaplx-on-solana", "Solana");
  const swap = actions.find((action) => action.kind === "swap");
  assert.ok(swap, "SWAP resolves through the engine");
  assert.equal(swap!.executionMode, "connected", "external execution labeled connected");
  assert.equal(swap!.href, "/swap/aaplx-on-solana", "engine routes to the swap page");
  assert.equal(swap!.state, "available", "real route shows available");
  assert.ok(!actions.some((action) => action.kind === "send" || action.kind === "move"), "no fake Stellar execution");
  const adapter = ACTION_ADAPTERS.find((entry) => entry.kind === "swap");
  assert.ok(adapter?.supports("aaplx-on-solana") && !adapter?.supports("aaplc-on-base"), "registry scoped to the exact asset");

  // 5. No fake capability fallback: reverts clear prices and wait honestly.
  const quoted = await refreshUtilityQuote(created.id, owner.id, mockJupiter("7317016"));
  assert.ok(quoted.quote.amountOutDisplay !== null, "real quote stored");
  const waiting = await refreshUtilityQuote(created.id, owner.id, mockJupiter(null));
  assert.equal(waiting.failureReason, "quote-unavailable", "revert recorded");
  assert.equal(waiting.quote.amountOutDisplay, null, "no invented price stored");

  // 6. Eligibility surfaced: ack required, copy present.
  await expectCode(
    createUtilityOrder(owner.id, { targetSlug: "aaplx-on-solana", sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: false }),
    "eligibility-required",
    "missing acknowledgement blocked",
  );
  assert.ok(created.eligibilityCopy.toLowerCase().includes("united states"), "eligibility copy present");

  // 7. Wallet verified as Solana-shaped; EVM/handle input rejected.
  await expectCode(
    createUtilityOrder(owner.id, { targetSlug: "aaplx-on-solana", sourceAmount: "10", executionWallet: "0x1234567890abcdef1234567890abcdef12345678", eligibilityAcknowledged: true }),
    "invalid-request",
    "EVM address rejected",
  );
  await expectCode(
    createUtilityOrder(owner.id, { targetSlug: "aaplx-on-solana", sourceAmount: "10", executionWallet: "@ada", eligibilityAcknowledged: true }),
    "invalid-request",
    "handle rejected",
  );

  // 8. Client cannot substitute protocol facts.
  const sneakyInput: Record<string, unknown> = {
    targetSlug: "aaplx-on-solana",
    sourceAmount: "10",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
    sourceMint: "So11111111111111111111111111111111111111112",
    targetMint: "So11111111111111111111111111111111111111112",
    venue: "uniswap",
    slippageBps: 10000,
  };
  const sneaky = await createUtilityOrder(owner.id, sneakyInput);
  assert.equal(sneaky.sourceMint, SWAP_SOURCE_MINT, "source mint not client-controlled");
  assert.equal(sneaky.targetMint, SWAP_TARGET_MINT, "target mint not client-controlled");
  assert.equal(sneaky.venue, SWAP_VENUE, "venue not client-controlled");

  // 9. Exact decimals: 7 places rejected; dust exact; display exact.
  await expectCode(
    createUtilityOrder(owner.id, { targetSlug: "aaplx-on-solana", sourceAmount: "1.0000001", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "invalid-request",
    "7-decimal amount rejected",
  );
  assert.equal(usdcAmountToSubunits("0.000001"), "1", "dust subunit exact");
  assert.equal(formatSubunits("7317016", 8), "0.07317016", "AAPLx display exact");

  // 10. Prepare guards: fresh quote required; moved prices re-quote.
  await expectCode(prepareUtilitySwap(created.id, owner.id, mockJupiter("7317016")), "quote-expired", "stale quote blocked");
  const fresh = await refreshUtilityQuote(created.id, owner.id, mockJupiter("7317016"));
  assert.equal(fresh.status, "quoting", "fresh quote stored");
  await expectCode(prepareUtilitySwap(created.id, owner.id, mockJupiter("1000")), "quote-expired", "moved price blocked");
  const prepared = await prepareUtilitySwap(created.id, owner.id, mockJupiter("7317016"));
  assert.equal(prepared.order.status, "ready", "prepared");
  assert.equal(prepared.swapTransaction, "OPAQUE_UNSIGNED_TX_BYTES", "opaque bytes pass through");
  assert.equal(prepared.minOutSubunits, "7280430", "minimum travels with the transaction");

  // 11. Confirm proves the exact route from in-transaction deltas.
  const confirmed = await confirmUtilitySwap(
    created.id,
    owner.id,
    { signature: SIGNATURE },
    mockSolana({ usdc: "-25000000", aaplx: "7317016" }),
  );
  assert.equal(confirmed.status, "confirmed", "route proven → confirmed");
  assert.equal(confirmed.targetAmount, "7317016", "received amount recorded");
  assert.ok(confirmed.swapExplorerUrl?.includes(SIGNATURE), "explorer link bound to the signature");
  const immutable = await confirmUtilitySwap(created.id, owner.id, { signature: SIGNATURE }, mockSolana({ usdc: "0", aaplx: "0" }));
  assert.equal(immutable.targetAmount, "7317016", "confirmed receipt immutable");
  // Wrong deltas (e.g. someone else's signature) stay unconfirmed.
  const other = await createUtilityOrder(owner.id, {
    targetSlug: "aaplx-on-solana",
    sourceAmount: "25",
    executionWallet: OTHER_WALLET,
    eligibilityAcknowledged: true,
  });
  await refreshUtilityQuote(other.id, owner.id, mockJupiter("7317016"));
  await prepareUtilitySwap(other.id, owner.id, mockJupiter("7317016"));
  const badRoute = await confirmUtilitySwap(other.id, owner.id, { signature: SIGNATURE }, mockSolana({ usdc: "-100", aaplx: "10" }));
  assert.equal(badRoute.status, "submitted", "unproven route stays submitted");
  assert.equal(badRoute.failureReason, "verification-failed", "honest failure, funds visible onchain");
  // Unconfirmed signatures stay retryable, never complete.
  const pending = await confirmUtilitySwap(other.id, owner.id, { signature: SIGNATURE }, mockSolana(null, null));
  assert.equal(pending.status, "submitted", "unconfirmed stays retryable");
  // A second distinct signature on a tracked order is rejected, not re-swapped.
  await expectCode(
    confirmUtilitySwap(other.id, owner.id, { signature: SIGNATURE.replace(/A$/, "B") }, mockSolana({ usdc: "-25000000", aaplx: "7317016" })),
    "invalid-transition",
    "second signature blocked",
  );

  // 12. Owner scope: strangers see and change nothing.
  assert.equal((await listMyUtilityOrders(stranger.id)).length, 0, "no cross-user orders");
  await expectCode(getUtilityOrder(created.id, stranger.id), "not-found", "cross-user read blocked");
  await expectCode(refreshUtilityQuote(created.id, stranger.id, mockJupiter("1")), "not-found", "cross-user quote blocked");
  await expectCode(confirmUtilitySwap(created.id, stranger.id, { signature: SIGNATURE }, mockSolana({ usdc: "0", aaplx: "0" })), "not-found", "cross-user confirm blocked");
  assert.ok((await listMyUtilityOrders(owner.id)).length >= 3, "owner history durable");

  // 13. Signed-out blocked; receipts carry no secrets.
  await expectCode(listMyUtilityOrders(null), "unauthenticated", "signed-out list blocked");
  await expectCode(createUtilityOrder(null, {}), "unauthenticated", "signed-out create blocked");
  const receipt = JSON.stringify(confirmed);
  assert.ok(!receipt.includes("privateKey") && !/seed phrase/i.test(receipt), "no secret-shaped fields");

  // 14. Existing gates untouched: AAPLc router, Send, CCTP.
  assert.equal(getExecutionGate().enabled, false, "AAPLc acquisition still gated");
  assert.equal(getSendableAsset("aaplx-on-solana"), null, "new asset outside Send policy");
  assert.ok(getSendableAsset("usdc-on-stellar"), "USDC Send intact");
  assert.equal(ACCESS_MAINNET_ENABLED, false, "CCTP stays Testnet-only");

  // 15. No stablecoin-only assumption: access leads, swap executes, exit closes.
  assert.ok(actions.length >= 3, "full action set");
  assert.deepEqual(
    actions.map((action) => action.kind),
    ["access", "swap", "exit"],
    "access-first ordering",
  );

  // 16. Quote TTL enforced by the clock: backdate and prepare must refuse.
  await database
    .update(externalUtilityOrders)
    .set({ quoteAt: new Date(Date.now() - 120_000) })
    .where(eq(externalUtilityOrders.id, other.id));
  await expectCode(prepareUtilitySwap(other.id, owner.id, mockJupiter("7317016")), "quote-expired", "aged quote refused");

  console.log("external-utility:verify ok — 16 groups, all assertions passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  })
  .finally(async () => {
    for (const id of temporaryUserIds) {
      await database.delete(users).where(eq(users.id, id)).catch(() => undefined);
    }
  });
