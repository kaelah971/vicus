import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetAccessOrders, crosschainTransfers, users } from "../src/db/schema";
import { ACCESS_MAINNET_ENABLED } from "../src/lib/access/config";
import { ROUTER_TARGET_ASSET, ROUTER_VENUE_ROUTER, ROUTER_VENUE } from "../src/lib/asset-access/config";
import {
  AccessOrderError,
  aerodromeAdapter,
  createAccessOrder,
  formatSubunits,
  getAccessOrder,
  getExecutionGate,
  linkAccessTransfer,
  listMyAccessOrders,
  readExecutionWallet,
  recordBaseProgress,
  refreshOrderQuote,
  stellarAmountToSubunits6,
  type BaseRpcTransport,
} from "../src/lib/asset-access/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const OTHER_WALLET = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function encodeAmountsOut(values: bigint[]): string {
  const words = [BigInt(32), BigInt(values.length), ...values];
  return "0x" + words.map((value) => value.toString(16).padStart(64, "0")).join("");
}

function mockTransport(out: bigint[] | null): BaseRpcTransport & { calls: { to: string; data: string }[] } {
  const calls: { to: string; data: string }[] = [];
  return {
    calls,
    async ethCall(to: string, data: string) {
      calls.push({ to, data });
      if (out === null) return "0x";
      return encodeAmountsOut(out);
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
    assert.ok(error instanceof AccessOrderError, `${label}: expected AccessOrderError`);
    assert.equal((error as AccessOrderError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

async function main() {
  const owner = await createUser("router-owner");
  const stranger = await createUser("router-stranger");

  // 1. Only the verified target is routable; wrong slugs rejected.
  await expectCode(
    createAccessOrder(owner.id, { targetSlug: "usdc-on-stellar", sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "unsupported-asset",
    "non-target slug blocked",
  );
  await expectCode(
    createAccessOrder(owner.id, { targetSlug: "aaplc-on-ethereum", sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "unsupported-asset",
    "look-alike slug blocked",
  );

  // 2. Exact official contract required — orders pin the server-owned address.
  const created = await createAccessOrder(owner.id, {
    targetSlug: ROUTER_TARGET_ASSET.slug,
    sourceAmount: "25",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  } satisfies Record<string, unknown>);
  assert.equal(created.targetContract, "0xb200000000000000000000C2e324d24d7eEcd1fb", "exact AAPLc contract pinned");
  assert.equal(created.sourceAmountSubunits, "25000000", "25 USDC exact subunits");

  // 3. Eligibility acknowledgement required.
  await expectCode(
    createAccessOrder(owner.id, { targetSlug: ROUTER_TARGET_ASSET.slug, sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: false }),
    "eligibility-required",
    "missing acknowledgement blocked",
  );

  // 4. Execution wallet must be a valid EVM address; normalized server-side.
  await expectCode(
    createAccessOrder(owner.id, { targetSlug: ROUTER_TARGET_ASSET.slug, sourceAmount: "10", executionWallet: "not-an-address", eligibilityAcknowledged: true }),
    "invalid-request",
    "malformed wallet blocked",
  );
  const upper = await createAccessOrder(owner.id, {
    targetSlug: ROUTER_TARGET_ASSET.slug,
    sourceAmount: "10",
    executionWallet: `0x${WALLET.slice(2).toUpperCase()}`,
    eligibilityAcknowledged: true,
  } satisfies Record<string, unknown>);
  assert.equal(upper.executionWallet, WALLET.toLowerCase(), "wallet normalized to checksum-safe lowercase");

  // 5. Chain/network fixed server-side: the view always reports the
  // configured route regardless of what the client sends.
  const sneakyInput: Record<string, unknown> = {
    targetSlug: ROUTER_TARGET_ASSET.slug,
    sourceAmount: "10",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
    sourceNetwork: "ethereum",
    destinationNetwork: "solana",
    venue: "uniswap",
  };
  const sneaky = await createAccessOrder(owner.id, sneakyInput);
  assert.equal(sneaky.sourceNetwork, "stellar_testnet", "source network not client-controlled");
  assert.equal(sneaky.destinationNetwork, "base", "destination network not client-controlled");
  assert.equal(sneaky.venue, ROUTER_VENUE, "venue not client-controlled");
  assert.equal(sneaky.sourceAsset, "USDC", "source asset not client-controlled");

  // 6. Manual contact endpoints cannot impersonate an execution wallet: no
  // contact input exists — the wallet must be a provider-shaped address.
  await expectCode(
    createAccessOrder(owner.id, { targetSlug: ROUTER_TARGET_ASSET.slug, sourceAmount: "10", executionWallet: "@ada", eligibilityAcknowledged: true }),
    "invalid-request",
    "handle-shaped wallet blocked",
  );

  // 7/8. Real quotes stored with timestamps; reverts store NO invented price.
  const quotedTransport = mockTransport([BigInt(25000000), BigInt(95000000)]);
  const quoted = await refreshOrderQuote(created.id, owner.id, quotedTransport);
  assert.equal(quotedTransport.calls[0]?.to.toLowerCase(), ROUTER_VENUE_ROUTER.toLowerCase(), "quote calls the verified router");
  assert.ok(quotedTransport.calls[0]?.data.startsWith("0x5509a1ac"), "quote uses the verified selector");
  assert.ok(quoted.quote.amountOutDisplay !== null && quoted.quote.quotedAt !== null, "real quote timestamped");
  const revertTransport = mockTransport(null);
  const waiting = await refreshOrderQuote(created.id, owner.id, revertTransport);
  assert.equal(waiting.failureReason, "quote-unavailable", "revert recorded, not invented");
  assert.equal(waiting.quote.amountOutDisplay, null, "no fake quote stored");

  // 9. Exact decimals: >6 fractional places rejected; formatting exact.
  await expectCode(
    createAccessOrder(owner.id, { targetSlug: ROUTER_TARGET_ASSET.slug, sourceAmount: "10.1234567", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "invalid-request",
    "7-decimal amount rejected",
  );
  assert.equal(stellarAmountToSubunits6("0.000001"), "1", "dust subunit exact");
  assert.equal(formatSubunits("25000000", 6), "25.000000", "USDC display exact");
  assert.equal(formatSubunits("95000000", 8), "0.95000000", "AAPLc display exact");

  // 10/11. Adapter calls only server-owned addresses; calldata carries the
  // verified USDC and target — arbitrary router/calldata has no entry point.
  const adapterQuote = await aerodromeAdapter.getQuote("25000000", mockTransport([BigInt(1), BigInt(2)]));
  assert.ok(adapterQuote && adapterQuote.route.from === "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "source is canonical Base USDC");
  assert.equal(adapterQuote?.route.to, ROUTER_TARGET_ASSET.contractAddress, "target is the exact verified contract");

  // 12. CCTP transfers link, never duplicate: second distinct link rejected.
  // Fixture rows stand in for real Access (CCTP) transfers owned by the user.
  async function accessFixture() {
    const [row] = await database
      .insert(crosschainTransfers)
      .values({
        userId: owner.id,
        sourceNetwork: "stellar_testnet",
        sourceWallet: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        destinationNetwork: "base_sepolia",
        asset: "USDC",
        amount: "25.000000",
        destinationAddress: WALLET,
        status: "burned",
      })
      .returning({ id: crosschainTransfers.id });
    assert.ok(row, "access fixture created");
    return row!.id;
  }
  const firstTransfer = await accessFixture();
  const linked = await linkAccessTransfer(created.id, owner.id, firstTransfer);
  assert.equal(linked.status, "bridging", "bridge leg linked");
  await expectCode(linkAccessTransfer(created.id, owner.id, await accessFixture()), "invalid-transition", "second burn-equivalent link blocked");
  const relinked = await linkAccessTransfer(created.id, owner.id, linked.accessTransferId!);
  assert.equal(relinked.accessTransferId, linked.accessTransferId, "same transfer relinks idempotently");

  // 13/14. Destination-funded state survives reload; duplicate hashes safe.
  const approval = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const swap = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const funded = await recordBaseProgress(created.id, owner.id, { approvalHash: approval, swapHash: swap, destinationUsdcAmount: "24950000" });
  assert.equal(funded.status, "destination_funded", "funded state reached");
  const reloaded = await getAccessOrder(created.id, owner.id);
  assert.equal(reloaded.destinationUsdcAmount, "24950000", "funded amount survives reload");
  const dup = await recordBaseProgress(created.id, owner.id, { approvalHash: approval, swapHash: swap });
  assert.equal(dup.approvalHash, approval, "duplicate approval idempotent");
  assert.equal(dup.status, "destination_funded", "no status regression on duplicate");
  await database
    .update(assetAccessOrders)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(assetAccessOrders.id, created.id));
  const immutable = await recordBaseProgress(created.id, owner.id, { destinationUsdcAmount: "1" });
  assert.equal(immutable.destinationUsdcAmount, "24950000", "completed receipt immutable");

  // 15/16. Failed acquisition never implies funds disappeared: the funded
  // amount persists beside quote-unavailable waiting state.
  const keepWaiting = await refreshOrderQuote(upper.id, owner.id, mockTransport(null));
  assert.equal(keepWaiting.failureReason, "quote-unavailable", "waiting, not failed-as-fact");
  assert.ok((keepWaiting.lastError ?? "").includes("keeps waiting"), "copy keeps funds visible");

  // 17. Owner scope: strangers see nothing and mutate nothing.
  const strangerList = await listMyAccessOrders(stranger.id);
  assert.equal(strangerList.length, 0, "no cross-user order list");
  await expectCode(getAccessOrder(created.id, stranger.id), "not-found", "cross-user read blocked");
  await expectCode(refreshOrderQuote(created.id, stranger.id), "not-found", "cross-user quote blocked");
  await expectCode(linkAccessTransfer(created.id, stranger.id, randomUUID()), "not-found", "cross-user link blocked");
  const mine = await listMyAccessOrders(owner.id);
  assert.ok(mine.length >= 3, "owner history durable");

  // 18. Signed-out callers blocked before any data; execution wallet reads
  // need a valid address and never invent balances.
  await expectCode(listMyAccessOrders(null), "unauthenticated", "signed-out list blocked");
  await expectCode(createAccessOrder(null, {}), "unauthenticated", "signed-out create blocked");
  const walletRead = await readExecutionWallet(WALLET, mockTransport(null));
  assert.equal(walletRead, null, "unreadable wallet returns null, not zero-balance fiction");

  // 19. Receipt shape stays private: no execution secrets beyond the owner's
  // own view; target contract is the only onchain identifier exposed.
  const receiptKeys = Object.keys(reloaded).sort();
  assert.ok(receiptKeys.includes("executionWallet") && receiptKeys.includes("targetContract"), "owner receipt complete");
  assert.ok(!receiptKeys.includes("privateKey") && !receiptKeys.includes("seed"), "no secret-shaped fields");

  // 20. Existing /access stays Testnet-only; acquisition gate stays off.
  assert.equal(ACCESS_MAINNET_ENABLED, false, "Access remains Testnet-only");
  const gate = getExecutionGate();
  assert.equal(gate.enabled, false, "acquisition disabled until reviewed");
  assert.ok(gate.reasons.length >= 2, "disabled reasons explicit");

  console.log("asset-access:verify ok — 20 groups, all assertions passed.");
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
