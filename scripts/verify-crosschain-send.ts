import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { crosschainTransfers, users } from "../src/db/schema";
import {
  addMyReceiveEndpoint,
  deleteMyContact,
  resolveRecipient,
  saveUserContact,
  updateMyReceiveEndpoint,
} from "../src/lib/contacts/service";
import { getSendableAsset } from "../src/lib/send/service";
import { listPublicAssets } from "../src/lib/agent-api/service";
import {
  CrosschainSendError,
  createCrosschainSend,
  getCrosschainSend,
  listMyCrosschainSends,
  refreshCrosschainSend,
} from "../src/lib/crosschain-send/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const SENDER_WALLET = `G${"A".repeat(55)}`;
const BOB_BASE = "0x1111111111111111111111111111111111111111";
const BOB_ETH = "0x2222222222222222222222222222222222222222";
const FORGED = "0x9999999999999999999999999999999999999999";

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
    await database.delete(crosschainTransfers).where(eq(crosschainTransfers.userId, id));
    await database.delete(users).where(eq(users.id, id));
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof CrosschainSendError, "expected CrosschainSendError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected cross-chain error ${code}`);
}

async function intentCount(userId: string, address: string): Promise<number> {
  const rows = await database
    .select({ id: crosschainTransfers.id })
    .from(crosschainTransfers)
    .where(and(eq(crosschainTransfers.userId, userId), eq(crosschainTransfers.destinationAddress, address)));
  return rows.length;
}

async function main() {
  const alice = await createUser("cc-alice");
  const bob = await createUser("cc-bob");
  const carol = await createUser("cc-carol");

  // Recipient endpoints: Base public, Ethereum contacts_only.
  const baseEp = await addMyReceiveEndpoint(bob.id, { network: "base", address: BOB_BASE, label: "Base wallet" });
  await updateMyReceiveEndpoint(baseEp.id, bob.id, { enabled: true, visibility: "public" });
  const ethEp = await addMyReceiveEndpoint(bob.id, { network: "ethereum", address: BOB_ETH, label: "Eth wallet" });
  await updateMyReceiveEndpoint(ethEp.id, bob.id, { enabled: true, visibility: "contacts_only" });

  // 1. Public endpoint resolves when enabled.
  const first = await createCrosschainSend(alice.id, SENDER_WALLET, {
    handle: bob.handle,
    destinationNetwork: "base",
    amount: "5",
  });
  assert.equal(first.transfer.destinationNetwork, "base");
  assert.equal(first.transfer.destinationAddress, BOB_BASE, "server-resolved destination");
  assert.equal(first.recipientHandle, bob.handle, "human recipient surfaced");
  assert.equal(first.transfer.asset, "USDC", "USDC only");
  assert.equal(first.transfer.sourceNetwork, "stellar_testnet", "Stellar Testnet source");
  assert.equal(first.environment, "testnet", "testnet labeled");
  assert.equal(first.transfer.environment, "testnet");

  // 2. contacts_only resolves only for a saved contact.
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "ethereum", amount: "5" }),
    "recipient-not-permitted",
  );
  const contact = await saveUserContact(alice.id, bob.handle);
  const eth = await createCrosschainSend(alice.id, SENDER_WALLET, {
    handle: bob.handle,
    destinationNetwork: "ethereum",
    amount: "5",
  });
  assert.equal(eth.transfer.destinationAddress, BOB_ETH);

  // 3. Rejected after contact removal.
  await deleteMyContact(contact.id, alice.id);
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "ethereum", amount: "6" }),
    "recipient-not-permitted",
  );

  // 4. Disabled endpoint rejected.
  await updateMyReceiveEndpoint(baseEp.id, bob.id, { enabled: false });
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "base", amount: "7" }),
    "recipient-no-endpoint",
  );
  await updateMyReceiveEndpoint(baseEp.id, bob.id, { enabled: true });

  // 5. Unsupported networks rejected; Solana stays gated, never executable.
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "solana", amount: "5" }),
    "destination-coming-soon",
  );
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "doge", amount: "5" }),
    "unsupported-destination",
  );

  // 6. Client destination substitution rejected by construction.
  const forged = await createCrosschainSend(alice.id, SENDER_WALLET, {
    handle: bob.handle,
    destinationNetwork: "base",
    amount: "8",
    destinationAddress: FORGED,
  } as unknown as { handle: string; destinationNetwork: string; amount: string });
  assert.equal(forged.transfer.destinationAddress, BOB_BASE, "forged address ignored");

  // 7. Sender must be the authenticated Stellar wallet; amounts are strict.
  await expectCode(
    createCrosschainSend(alice.id, "not-a-wallet", { handle: bob.handle, destinationNetwork: "base", amount: "5" }),
    "invalid-request",
  );
  await expectCode(createCrosschainSend(null, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "base", amount: "5" }), "unauthenticated");
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: bob.handle, destinationNetwork: "base", amount: "0" }),
    "invalid-amount",
  );
  await expectCode(
    createCrosschainSend(alice.id, SENDER_WALLET, { handle: "no-such-handle-xyz", destinationNetwork: "base", amount: "5" }),
    "recipient-not-found",
  );

  // 8. Duplicate intent reuses the live transfer — no second burn.
  const before = await intentCount(alice.id, BOB_BASE);
  const retry = await createCrosschainSend(alice.id, SENDER_WALLET, {
    handle: bob.handle,
    destinationNetwork: "base",
    amount: "5",
  });
  assert.equal(retry.transfer.id, first.transfer.id, "same intent reuses the transfer");
  assert.equal(await intentCount(alice.id, BOB_BASE), before, "no duplicate row");

  // 9. Reload resumes the persisted transfer; refresh never reburns drafts.
  const resumed = await getCrosschainSend(first.transfer.id, alice.id);
  assert.equal(resumed.transfer.id, first.transfer.id);
  assert.equal(resumed.recipientHandle, bob.handle, "handle survives reload");
  const refreshed = await refreshCrosschainSend(first.transfer.id, alice.id);
  assert.equal(refreshed.transfer.id, first.transfer.id, "refresh keeps the same transfer");
  assert.equal(await intentCount(alice.id, BOB_BASE), before, "refresh creates nothing");

  // 10. Completed receipts are immutable.
  await database
    .update(crosschainTransfers)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(crosschainTransfers.id, first.transfer.id));
  const immutable = await refreshCrosschainSend(first.transfer.id, alice.id);
  assert.equal(immutable.transfer.status, "completed", "completed stays completed");

  // 11. Owner scoping: strangers see nothing.
  await expectCode(getCrosschainSend(first.transfer.id, carol.id), "not-found");
  await expectCode(refreshCrosschainSend(first.transfer.id, carol.id), "not-found");
  assert.equal((await listMyCrosschainSends(carol.id)).length, 0, "stranger history empty");
  const mine = await listMyCrosschainSends(alice.id);
  assert.ok(mine.length >= 2 && mine.every((s) => s.recipientHandle !== undefined), "owner history with handles");

  // 12. Same-network Send untouched.
  assert.ok(getSendableAsset("usdc-on-stellar"), "Stellar USDC still sendable same-network");

  // 13. Privacy: public loaders and strangers leak no endpoints.
  const directory = await listPublicAssets({});
  assert.ok(!JSON.stringify(directory).includes(BOB_BASE.slice(2)), "directory leaks no endpoint");
  const strangerResolution = await resolveRecipient({ senderUserId: carol.id, handle: bob.handle, targetNetwork: "ethereum" });
  assert.equal(strangerResolution.ok, false, "stranger blocked from contacts_only");
  assert.ok(!("address" in strangerResolution), "no address leaks on denial");

  await cleanup();
  console.log("crosschain-send:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
