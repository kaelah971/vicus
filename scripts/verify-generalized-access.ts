import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { externalUtilityOrders, users } from "../src/db/schema";
import { ACQUISITION_DISABLED_REASONS } from "../src/lib/asset-access/config";
import { AccessOrderError } from "../src/lib/asset-access/service";
import {
  ACCESS_ROUTES,
  getAccessRoutesForSlug,
  requireExecutableRoute,
  resolveAccessRoute,
} from "../src/lib/asset-access/routes";
import {
  SWAP_SOURCE_MINT,
  SWAP_TARGET_MINT,
} from "../src/lib/external-utility/config";
import {
  UtilityOrderError,
  checkOrderFunding,
  confirmUtilitySwap,
  createUtilityOrder,
  getSolanaTokenBalance,
  prepareUtilitySwap,
  refreshUtilityQuote,
  type JupiterTransport,
  type SolanaBalanceTransport,
  type SolanaTransport,
} from "../src/lib/external-utility/service";
import { resolveAssetActions } from "../src/lib/asset-actions/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const WALLET = "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7";
const OTHER_WALLET = "3xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9";
const SIGNATURE = "5K9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7yUi7A";

function mockJupiter(outAmount: string | null): JupiterTransport {
  return {
    async fetchQuote() {
      return outAmount === null ? null : { outAmount };
    },
    async buildSwapTransaction() {
      return { swapTransaction: "OPAQUE_ACCESS_TX_BYTES" };
    },
  };
}

function mockBalance(balance: string | null): SolanaBalanceTransport {
  return {
    async getTokenBalanceSubunits() {
      return balance;
    },
  };
}

function mockSolana(deltas: { usdc: string; aaplx: string } | null): SolanaTransport {
  return {
    async getSignatureStatus() {
      return "confirmed";
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

async function expectUtilityError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UtilityOrderError, "expected UtilityOrderError");
    assert.equal((error as UtilityOrderError).code, code);
    return;
  }
  assert.fail(`expected utility error ${code}`);
}

async function expectAccessError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AccessOrderError, "expected AccessOrderError");
    assert.equal((error as AccessOrderError).code, code);
    return;
  }
  assert.fail(`expected access error ${code}`);
}

async function main() {
  // 1. Route model explicitly carries sourceNetwork + sourceAsset.
  const aaplxRoutes = getAccessRoutesForSlug("aaplx-on-solana");
  assert.equal(aaplxRoutes.length, 2, "AAPLx exposes exactly two funding routes");
  for (const route of aaplxRoutes) {
    const keys = Object.keys(route);
    assert.ok(keys.includes("sourceNetwork") && keys.includes("sourceAsset"), `${route.id}: model carries source legs`);
  }
  const solanaRoute = aaplxRoutes.find((r) => r.sourceNetwork === "solana")!;
  assert.ok(solanaRoute, "Solana USDC route listed");
  assert.equal(solanaRoute.sourceAsset, "USDC");
  assert.equal(solanaRoute.executable, true, "Solana USDC → AAPLx executable");
  assert.equal(solanaRoute.sourceMint, SWAP_SOURCE_MINT, "canonical USDC mint pinned");
  assert.equal(solanaRoute.targetMint, SWAP_TARGET_MINT, "canonical AAPLx mint pinned");
  assert.equal(solanaRoute.adapter, "jupiter-swap");
  const stellarRoute = aaplxRoutes.find((r) => r.sourceNetwork === "stellar")!;
  assert.ok(stellarRoute, "Stellar USDC route listed");
  assert.equal(stellarRoute.executable, false, "Stellar USDC gated");
  assert.ok(
    (stellarRoute.reasonUnavailable ?? "").length > 10,
    "gated route carries a truthful reason",
  );
  assert.ok(
    getAccessRoutesForSlug("no-such-asset").length === 0,
    "unknown targets expose no routes",
  );
  assert.ok(
    ACCESS_ROUTES.some((r) => r.targetSlug === "aaplc-on-base" && !r.executable),
    "AAPLc Stellar route still represented as gated",
  );

  // 2. Exact resolution; wrong source asset/network rejected.
  assert.equal(
    resolveAccessRoute({ targetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "USDC" })?.id,
    "solana-usdc-to-aaplx",
  );
  assert.equal(resolveAccessRoute({ targetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "SOL" }), null);
  assert.equal(resolveAccessRoute({ targetSlug: "aaplx-on-solana", sourceNetwork: "ethereum", sourceAsset: "USDC" }), null);
  assert.equal(resolveAccessRoute({ targetSlug: "aaplx-on-solana", sourceNetwork: "base", sourceAsset: "USDC" }), null);
  assert.equal(resolveAccessRoute({ targetSlug: "nope", sourceNetwork: "solana", sourceAsset: "USDC" }), null);
  assert.equal(resolveAccessRoute({}), null);

  // 3. Gated routes can never masquerade as executable.
  assert.equal(
    requireExecutableRoute({ targetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "USDC" }).executable,
    true,
  );
  await expectAccessError(
    (async () => requireExecutableRoute({ targetSlug: "aaplx-on-solana", sourceNetwork: "stellar", sourceAsset: "USDC" }))(),
    "execution-disabled",
  );
  await expectAccessError(
    (async () => requireExecutableRoute({ targetSlug: "aaplx-on-base", sourceNetwork: "stellar", sourceAsset: "USDC" }))(),
    "unsupported-asset",
  );
  await expectAccessError(
    (async () => requireExecutableRoute({ targetSlug: "aaplc-on-base", sourceNetwork: "stellar", sourceAsset: "USDC" }))(),
    "unsupported-asset",
  );
  await expectAccessError(
    (async () => requireExecutableRoute({ targetSlug: "aaplc-on-base", sourceNetwork: "stellar_testnet", sourceAsset: "USDC" }))(),
    "execution-disabled",
  );

  const alice = await createUser("gacc-alice");
  const bob = await createUser("gacc-bob");

  // 4. Connected execution wallet required — no typed-in substitute.
  await expectUtilityError(
    createUtilityOrder(alice.id, {
      targetSlug: "aaplx-on-solana",
      sourceAmount: "25",
      executionWallet: "not-a-wallet",
      eligibilityAcknowledged: true,
    }),
    "invalid-request",
  );
  const order = await createUtilityOrder(alice.id, {
    targetSlug: "aaplx-on-solana",
    sourceAmount: "25",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  });
  assert.equal(order.sourceMint, SWAP_SOURCE_MINT, "server pins source mint");
  await database
    .update(externalUtilityOrders)
    .set({ executionWallet: null, updatedAt: new Date() })
    .where(eq(externalUtilityOrders.id, order.id));
  await expectUtilityError(prepareUtilitySwap(order.id, alice.id, mockJupiter("100000")), "invalid-request");
  await database
    .update(externalUtilityOrders)
    .set({ executionWallet: WALLET, updatedAt: new Date() })
    .where(eq(externalUtilityOrders.id, order.id));

  // 5. Real balance reads: sufficient / insufficient / unreadable / invalid.
  assert.equal(await getSolanaTokenBalance(WALLET, SWAP_SOURCE_MINT, mockBalance("25000000")), "25000000");
  assert.equal(await getSolanaTokenBalance(WALLET, SWAP_SOURCE_MINT, mockBalance(null)), null);
  assert.equal(await getSolanaTokenBalance("bogus", SWAP_SOURCE_MINT, mockBalance("1")), null);

  // 6. Order-scoped funding gate uses the server-stored wallet.
  const rich = await checkOrderFunding(order.id, alice.id, mockBalance("99999999"));
  assert.equal(rich.sufficient, true);
  assert.equal(rich.fundingMint, SWAP_SOURCE_MINT, "funding mint server-pinned");
  assert.equal(rich.executionWallet, WALLET, "wallet server-resolved, not client input");
  assert.equal(rich.requiredSubunits, "25000000");
  const poor = await checkOrderFunding(order.id, alice.id, mockBalance("100"));
  assert.equal(poor.sufficient, false, "insufficient balance reported");
  const unreadable = await checkOrderFunding(order.id, alice.id, mockBalance(null));
  assert.equal(unreadable.sufficient, null, "unreadable stays retryable, never fake-sufficient");
  await expectUtilityError(checkOrderFunding(order.id, bob.id, mockBalance("99999999")), "not-found");

  // 7. Quotes are real-or-nothing; stale quotes must refresh.
  await expectUtilityError(prepareUtilitySwap(order.id, alice.id, mockJupiter("100000")), "quote-expired");
  const noPrice = await refreshUtilityQuote(order.id, alice.id, {
    async fetchQuote() {
      return null;
    },
  });
  assert.equal(noPrice.failureReason, "quote-unavailable", "no fallback price invented");
  await refreshUtilityQuote(order.id, alice.id, mockJupiter("73000"));
  await database
    .update(externalUtilityOrders)
    .set({ quoteAt: new Date(Date.now() - 10 * 60_1000), updatedAt: new Date() })
    .where(eq(externalUtilityOrders.id, order.id));
  await expectUtilityError(prepareUtilitySwap(order.id, alice.id, mockJupiter("73000")), "quote-expired");

  // 8. Accepted-minimum enforced; wrong-mint transactions rejected.
  await refreshUtilityQuote(order.id, alice.id, mockJupiter("100000"));
  await expectUtilityError(prepareUtilitySwap(order.id, alice.id, mockJupiter("1000")), "quote-expired");
  const prepared = await prepareUtilitySwap(order.id, alice.id, mockJupiter("100000"));
  assert.equal(prepared.swapTransaction, "OPAQUE_ACCESS_TX_BYTES");
  const wrongMint = await confirmUtilitySwap(order.id, alice.id, { signature: SIGNATURE }, mockSolana(null));
  assert.equal(wrongMint.status, "submitted");
  assert.equal(wrongMint.failureReason, "verification-failed", "unprovable route rejected");
  const confirmed = await confirmUtilitySwap(
    order.id,
    alice.id,
    { signature: SIGNATURE },
    mockSolana({ usdc: "-25000000", aaplx: "100000" }),
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.targetAmount, "100000");

  // 9. Duplicate execution safe; orders owner-scoped.
  const again = await confirmUtilitySwap(
    order.id,
    alice.id,
    { signature: SIGNATURE },
    mockSolana({ usdc: "-25000000", aaplx: "100000" }),
  );
  assert.equal(again.status, "confirmed");
  assert.equal(again.swapSignature, SIGNATURE);
  await expectUtilityError(checkOrderFunding(order.id, bob.id, mockBalance("1")), "not-found");
  const other = await createUtilityOrder(bob.id, {
    targetSlug: "aaplx-on-solana",
    sourceAmount: "5",
    executionWallet: OTHER_WALLET,
    eligibilityAcknowledged: true,
  });
  await expectUtilityError(prepareUtilitySwap(other.id, alice.id, mockJupiter("1")), "not-found");

  // 10. Mint tampering breaks verification, never execution.
  await database
    .update(externalUtilityOrders)
    .set({ sourceMint: "FORGED_MINT_11111111111111111111111111111", updatedAt: new Date() })
    .where(eq(externalUtilityOrders.id, other.id));
  await expectUtilityError(checkOrderFunding(other.id, bob.id, mockBalance("99999999")), "verification-failed");

  // 11. Engine routes AAPLx Access to the acquire page; Swap + Exit intact.
  const actions = await resolveAssetActions("aaplx-on-solana", "Solana");
  const access = actions.find((a) => a.kind === "access");
  assert.ok(access, "AAPLx ACCESS resolves");
  assert.equal(access!.state, "available", "Solana route honestly available");
  assert.equal(access!.href, "/acquire/aaplx-on-solana", "ACCESS opens the route page");
  assert.ok(!/stellar/i.test(`${access!.title} ${access!.description}`), "no Stellar funding claim on AAPLx access");
  assert.ok(actions.some((a) => a.kind === "swap"), "Swap intact");
  assert.ok(actions.some((a) => a.kind === "exit"), "Exit intact");
  const aaplc = await resolveAssetActions("aaplc-on-base", "Base");
  const aaplcAccess = aaplc.find((a) => a.kind === "access");
  assert.ok(aaplcAccess, "AAPLc ACCESS still resolves");
  assert.equal(aaplcAccess!.state, "permissioned", "AAPLc stays gated");
  assert.ok(
    (aaplcAccess!.description + ACQUISITION_DISABLED_REASONS.join(" ")).length > 0,
    "gate copy present",
  );

  await cleanup();
  console.log("generalized-access:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error);
  process.exit(1);
});
