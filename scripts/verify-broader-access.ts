import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { externalUtilityOrders, users } from "../src/db/schema";
import {
  SWAP_SOURCE_MINT,
  TSLAX_MINT,
  TSLAX_SLUG,
  SWAP_TARGET_MINT,
  SWAP_TARGET_SLUG,
  getSwapTarget,
  isSwapTargetSlug,
} from "../src/lib/external-utility/config";
import {
  UtilityOrderError,
  confirmUtilitySwap,
  createUtilityOrder,
  prepareUtilitySwap,
  refreshUtilityQuote,
  swapAdapter,
} from "../src/lib/external-utility/service";
import {
  getAccessRoutesForSlug,
  requireExecutableRoute,
  resolveAccessRoute,
} from "../src/lib/asset-access/routes";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import { getAgentOrderStatus, requestAgentQuote } from "../src/lib/agent-api/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const WALLET = "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7";
const SIGNATURE = "5K9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7A";

function mockJupiter(outAmount: string | null) {
  return {
    async fetchQuote() {
      return outAmount === null ? null : { outAmount };
    },
    async buildSwapTransaction() {
      return { swapTransaction: "OPAQUE_BROADER_TX" };
    },
  };
}

function mockSolana(targetDelta: string) {
  return {
    async getSignatureStatus() {
      return "confirmed" as const;
    },
    async getTransactionDeltas() {
      return { usdc: "-25000000", aaplx: targetDelta };
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

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UtilityOrderError, "expected UtilityOrderError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected utility error ${code}`);
}

async function main() {
  // 1. Registry pins both executable targets; AAPLx untouched.
  assert.ok(isSwapTargetSlug(SWAP_TARGET_SLUG) && isSwapTargetSlug(TSLAX_SLUG), "registry holds both");
  assert.ok(!isSwapTargetSlug("nvdac-on-base") && !isSwapTargetSlug("doge-on-solana"), "unknown slugs rejected");
  assert.equal(getSwapTarget(TSLAX_SLUG)?.mint, TSLAX_MINT, "TSLAx mint pinned");
  assert.equal(getSwapTarget(SWAP_TARGET_SLUG)?.mint, SWAP_TARGET_MINT, "AAPLx mint unchanged");
  assert.equal(getSwapTarget("nope"), null);

  // 2. TSLAx route executable through the shared adapter (no second stack).
  assert.ok(swapAdapter.targets[TSLAX_SLUG], "adapter serves TSLAx from config");
  const tslaxRoutes = getAccessRoutesForSlug(TSLAX_SLUG);
  assert.equal(tslaxRoutes.length, 2, "TSLAx exposes Solana + Stellar legs");
  assert.equal(
    requireExecutableRoute({ targetSlug: TSLAX_SLUG, sourceNetwork: "solana", sourceAsset: "USDC" }).targetMint,
    TSLAX_MINT,
  );
  try {
    requireExecutableRoute({ targetSlug: TSLAX_SLUG, sourceNetwork: "stellar", sourceAsset: "USDC" });
    assert.fail("stellar leg must stay gated");
  } catch (error) {
    assert.ok(error instanceof Error && "code" in error && (error as { code: string }).code === "execution-disabled");
  }
  assert.equal(resolveAccessRoute({ targetSlug: "nvdac-on-base", sourceNetwork: "base", sourceAsset: "USDC" })?.executable, false, "NVDAc gated with reason");

  const alice = await createUser("broader-alice");
  const bob = await createUser("broader-bob");

  // 3. TSLAx order lifecycle on the generalized adapter.
  const tslax = await createUtilityOrder(alice.id, {
    targetSlug: TSLAX_SLUG, sourceAmount: "25", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  assert.equal(tslax.targetMint, TSLAX_MINT, "server pins the TSLAx mint");
  assert.equal(tslax.targetCode, "TSLAx", "view carries TSLAx identity");
  await refreshUtilityQuote(tslax.id, alice.id, mockJupiter("6655775"));
  const prepared = await prepareUtilitySwap(tslax.id, alice.id, mockJupiter("6655775"));
  assert.equal(prepared.order.targetMint, TSLAX_MINT, "prepare keeps the pinned mint");
  const confirmed = await confirmUtilitySwap(tslax.id, alice.id, { signature: SIGNATURE }, mockSolana("6655775"));
  assert.equal(confirmed.status, "confirmed", "TSLAx target delta proves the route");
  assert.equal(confirmed.targetAmount, "6655775");

  // 4. Wrong-mint and unsupported-asset rejection.
  await expectCode(
    createUtilityOrder(alice.id, { targetSlug: "nvdac-on-base", sourceAmount: "25", executionWallet: WALLET, eligibilityAcknowledged: true }),
    "unsupported-asset",
  );
  const victim = await createUtilityOrder(alice.id, {
    targetSlug: TSLAX_SLUG, sourceAmount: "1", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  await database.update(externalUtilityOrders).set({ targetMint: "FORGED_MINT_11111111111111111111111111111" }).where(eq(externalUtilityOrders.id, victim.id));
  await expectCode(refreshUtilityQuote(victim.id, alice.id, mockJupiter("1")), "verification-failed");
  // Exit rows cannot flow through the swap path.
  const exitRow = await createUtilityOrder(bob.id, {
    targetSlug: SWAP_TARGET_SLUG, sourceAmount: "5", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  await database.update(externalUtilityOrders).set({ actionKind: "exit", sourceMint: SWAP_TARGET_MINT, targetMint: SWAP_SOURCE_MINT }).where(eq(externalUtilityOrders.id, exitRow.id));
  await expectCode(refreshUtilityQuote(exitRow.id, bob.id, mockJupiter("1")), "verification-failed");

  // 5. Quote discipline: fresh-only, min enforced, never fabricated.
  const stale = await createUtilityOrder(alice.id, {
    targetSlug: TSLAX_SLUG, sourceAmount: "10", executionWallet: WALLET, eligibilityAcknowledged: true,
  });
  await expectCode(prepareUtilitySwap(stale.id, alice.id, mockJupiter("1")), "quote-expired");
  await refreshUtilityQuote(stale.id, alice.id, mockJupiter(null));
  const agentQuote = await requestAgentQuote(
    { action: "access", assetSlug: TSLAX_SLUG, sourceNetwork: "solana", sourceAsset: "USDC", amount: "25" },
    mockJupiter("6655775"),
  );
  assert.equal(agentQuote.assetSlug, TSLAX_SLUG, "agent quotes the requested target");
  assert.equal(agentQuote.amountOutSubunits, "6655775");
  const agentStatus = await getAgentOrderStatus(tslax.id, alice.id);
  assert.equal(agentStatus.assetCode, "TSLAx", "agent labels the right asset");

  // 6. Engine: TSLAx access + swap executable; NVDAc access stays non-executable; Stellar rows honest.
  const tslaxActions = await resolveAssetActions(TSLAX_SLUG, "Solana");
  assert.deepEqual(tslaxActions.map((a) => a.kind), ["access", "swap", "redeem"], "TSLAx access+swap plus seeded official redeem");
  const access = tslaxActions.find((a) => a.kind === "access")!;
  assert.equal(access.state, "available");
  assert.equal(access.href, `/acquire/${TSLAX_SLUG}`);
  const nvdac = await resolveAssetActions("nvdac-on-base", "Base");
  assert.ok(!nvdac.some((a) => a.kind === "swap" || (a.kind === "access" && a.state === "available")), "NVDAc nothing falsely executable");
  const aaplx = await resolveAssetActions(SWAP_TARGET_SLUG, "Solana");
  assert.deepEqual(aaplx.map((a) => a.kind), ["access", "swap", "exit"], "AAPLx unchanged");
  for (const slug of ["benji-on-stellar", "wtgxx-on-stellar", "usdy-on-stellar"]) {
    const actions = await resolveAssetActions(slug, "Stellar");
    const accessAction = actions.find((a) => a.kind === "access");
    assert.ok(accessAction, `${slug}: issuer access present`);
    assert.ok(accessAction!.executionMode !== "vicus", `${slug}: access never claims Vicus execution`);
  }

  // 7. AAPLc remains gated while venue liquidity is insufficient.
  try {
    requireExecutableRoute({ targetSlug: "aaplc-on-base", sourceNetwork: "stellar_testnet", sourceAsset: "USDC" });
    assert.fail("aaplc must stay gated");
  } catch (error) {
    assert.ok(error instanceof Error && "code" in error && (error as { code: string }).code === "execution-disabled");
  }

  await cleanup();
  console.log("broader-access:verified — TSLAx executable, NVDAc/AAPLc gated");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
