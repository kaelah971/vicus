import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { externalUtilityOrders, users } from "../src/db/schema";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import {
  AgentApiError,
  getAgentOrderStatus,
  getPublicAsset,
  getPublicAssetActions,
  listPublicAssets,
  requestAgentQuote,
} from "../src/lib/agent-api/service";
import { createUtilityOrder } from "../src/lib/external-utility/service";
import { SWAP_SOURCE_MINT, SWAP_TARGET_MINT } from "../src/lib/external-utility/config";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const ROOT = join(__dirname, "..");

const WALLET = "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7";

function mockQuote(outAmount: string | null) {
  return {
    async fetchQuote() {
      return outAmount === null ? null : { outAmount };
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
    assert.ok(error instanceof AgentApiError, "expected AgentApiError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected agent error ${code}`);
}

async function main() {
  // 1. Directory lists production assets only; filters compose.
  const all = await listPublicAssets({});
  assert.ok(all.assets.length >= 10, "directory is non-empty");
  assert.ok(!all.assets.some((a) => a.slug === "tokenized-treasury-education"), "no education entries");
  assert.ok(all.assets.every((a) => a.slug && a.code && a.ecosystem && a.assetClass && a.issuer), "summaries complete");
  const solanaEquities = await listPublicAssets({ ecosystem: "solana", assetClass: "equity_fund", query: "" });
  assert.deepEqual(solanaEquities.assets.map((a) => a.slug).sort(), ["aaplx-on-solana", "tslax-on-solana"]);
  const queried = await listPublicAssets({ query: "nvdac" });
  assert.ok(queried.assets.some((a) => a.slug === "nvdac-on-base"), "query finds NVDAc");
  const none = await listPublicAssets({ ecosystem: "no-such-chain" });
  assert.equal(none.assets.length, 0, "unknown filter matches nothing");

  // 2. Detail returns identity + lifecycle; unknown/education → not-found.
  const detail = await getPublicAsset("aaplx-on-solana");
  assert.equal(detail.code, "AAPLx");
  assert.ok(detail.description.length > 20 && detail.eligibilityNote.length > 0, "safe metadata present");
  assert.ok(detail.sourceUrl.startsWith("https://"), "source present");
  assert.ok(detail.lifecycle.length >= 3, "lifecycle attached");
  assert.ok(detail.lifecycle.some((s) => s.stage === "access"), "access stage present");
  await expectCode(getPublicAsset("no-such-asset"), "not-found");
  await expectCode(getPublicAsset("tokenized-treasury-education"), "not-found");
  await expectCode(getPublicAsset(""), "not-found");

  // 3. Actions exactly reuse the Action Engine — same kinds, same order.
  const viaApi = await getPublicAssetActions("aaplx-on-solana");
  const viaEngine = await resolveAssetActions("aaplx-on-solana", "Solana");
  assert.deepEqual(
    viaApi.actions.map((a) => a.kind),
    viaEngine.map((a) => a.kind),
    "agent sees exactly the UI actions",
  );
  assert.ok(!viaApi.actions.some((a) => a.kind === "borrow" || a.kind === "collateral"), "unsupported absent");
  for (const action of viaApi.actions) {
    assert.ok(action.sourceUrl.startsWith("https://"), "every action sourced");
  }
  await expectCode(getPublicAssetActions("no-such-asset"), "not-found");

  // 4. Quote resolves the server-owned route; extras cannot be supplied.
  const quote = await requestAgentQuote(
    {
      action: "access",
      assetSlug: "aaplx-on-solana",
      sourceNetwork: "solana",
      sourceAsset: "USDC",
      amount: "25",
      mint: "FORGED",
      venue: "evil-router",
      slippageBps: 9999,
      calldata: "0xdeadbeef",
      router: "0x0000000000000000000000000000000000000000",
    },
    mockQuote("7317016"),
  );
  assert.equal(quote.amountOutSubunits, "7317016", "live adapter price flows through");
  assert.equal(quote.venue, "jupiter", "server owns the venue");
  assert.ok(!JSON.stringify(quote).includes("FORGED"), "supplied mint ignored");
  await expectCode(
    requestAgentQuote({ action: "access", assetSlug: "aaplx-on-solana", sourceNetwork: "stellar", sourceAsset: "USDC", amount: "25" }, mockQuote("1")),
    "execution-disabled",
  );
  await expectCode(
    requestAgentQuote({ action: "access", assetSlug: "aaplx-on-solana", sourceNetwork: "ethereum", sourceAsset: "USDC", amount: "25" }, mockQuote("1")),
    "unsupported-route",
  );
  await expectCode(
    requestAgentQuote({ action: "access", assetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "USDC", amount: "25" }, mockQuote(null)),
    "quote-unavailable",
  );
  await expectCode(
    requestAgentQuote({ action: "access", assetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "USDC", amount: "0" }, mockQuote("1")),
    "invalid-request",
  );
  await expectCode(
    requestAgentQuote({ action: "teleport", assetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "USDC", amount: "1" }, mockQuote("1")),
    "invalid-request",
  );

  // 5. Exit quote is pinned to the verified reverse direction.
  const exitQuote = await requestAgentQuote(
    { action: "exit", assetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "AAPLx", amount: "0.05" },
    mockQuote("120000"),
  );
  assert.equal(exitQuote.amountOutSubunits, "120000");
  assert.equal(exitQuote.sourceAsset, "AAPLx");
  await expectCode(
    requestAgentQuote({ action: "exit", assetSlug: "aaplx-on-solana", sourceNetwork: "solana", sourceAsset: "USDC", amount: "1" }, mockQuote("1")),
    "unsupported-route",
  );

  // 6. Private orders: auth required, owner-scoped, leak-free.
  await expectCode(getAgentOrderStatus(randomUUID(), null), "not-authenticated");
  const alice = await createUser("agent-alice");
  const bob = await createUser("agent-bob");
  const order = await createUtilityOrder(alice.id, {
    targetSlug: "aaplx-on-solana",
    sourceAmount: "25",
    executionWallet: WALLET,
    eligibilityAcknowledged: true,
  });
  const status = await getAgentOrderStatus(order.id, alice.id);
  assert.equal(status.id, order.id);
  assert.equal(status.type, "swap");
  assert.equal(status.assetSlug, "aaplx-on-solana");
  assert.equal(status.actionRequired, "request-quote", "draft orders need a quote");
  assert.equal(status.retryable, true);
  const payload = JSON.stringify(status);
  assert.ok(!payload.includes(WALLET), "no wallet addresses exposed");
  assert.ok(!/privateKey|seed|secret|signature/i.test(payload.replace("explorerUrl", "")), "no secrets or raw state");
  assert.ok(!payload.includes(SWAP_SOURCE_MINT) && !payload.includes(SWAP_TARGET_MINT), "no raw mints exposed");
  await expectCode(getAgentOrderStatus(order.id, bob.id), "not-found");
  await expectCode(getAgentOrderStatus(randomUUID(), alice.id), "not-found");

  // 7. No signing bypass anywhere in v1: routes never touch keys or calldata.
  const v1Files = [
    "src/app/api/v1/assets/route.ts",
    "src/app/api/v1/assets/[slug]/route.ts",
    "src/app/api/v1/assets/[slug]/actions/route.ts",
    "src/app/api/v1/quote/route.ts",
    "src/app/api/v1/orders/[id]/route.ts",
  ];
  for (const file of v1Files) {
    const path = join(ROOT, file);
    assert.ok(existsSync(path), `${file} exists`);
    const text = readFileSync(path, "utf8");
    assert.ok(!/privateKey|seed phrase|signTransaction|calldata|secret/i.test(text), `${file}: no signing material`);
  }
  const ordersRoute = readFileSync(join(ROOT, "src/app/api/v1/orders/[id]/route.ts"), "utf8");
  assert.ok(!ordersRoute.includes("POST"), "status route is read-only");

  // 8. Skill doc teaches the signature boundary.
  const skillPath = join(ROOT, "skills/vicus/SKILL.md");
  assert.ok(existsSync(skillPath), "skill doc exists");
  const skill = readFileSync(skillPath, "utf8");
  assert.ok(/USER WALLET SIGNS/i.test(skill), "skill states the signature rule");
  assert.ok(/never.*(private key|seed phrase)/i.test(skill), "skill forbids key requests");
  assert.ok(/confirmed/i.test(skill), "skill gates completion on verified status");
  assert.ok(skill.includes("/api/v1/quote") && skill.includes("/api/v1/orders/:id"), "skill documents endpoints");

  await cleanup();
  console.log("agent-api:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
