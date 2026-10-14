import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import {
  Account,
  Asset,
  FeeBumpTransaction,
  Keypair,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import { users } from "../src/db/schema";
import { SendActionError } from "../src/lib/send/service";
import {
  SENDABLE_ASSETS,
  getSendableAsset,
  getSendTransfer,
  listMySendTransfers,
  prepareSend,
  submitSend,
  type SendAccount,
  type SendHorizon,
} from "../src/lib/send/service";
import {
  enableStellarReceiveEndpoint,
  saveUserContact,
} from "../src/lib/contacts/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const USDC = { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" };
const BENJI = { code: "BENJI", issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5" };

type MockAccounts = Map<string, SendAccount>;

function mockHorizon(accounts: MockAccounts, log: { submitted: string[] }) {
  const transport: SendHorizon & {
    confirmations: Map<string, { hash: string; successful: boolean; sourceAccount: string; ledger: number | null }>;
  } = {
    confirmations: new Map(),
    async getAccount(address: string) {
      return accounts.get(address) ?? null;
    },
    async submitTransaction(signedXdr: string) {
      log.submitted.push(signedXdr);
      const parsed = TransactionBuilder.fromXDR(signedXdr, Networks.PUBLIC);
      if (parsed instanceof FeeBumpTransaction) throw new Error("fee bump rejected in fixture");
      const hash = Buffer.from((parsed as Transaction).hash()).toString("hex");
      return { hash, successful: true, ledger: 99 };
    },
    async getTransaction(hash: string) {
      return transport.confirmations.get(hash) ?? null;
    },
  };
  return transport;
}

function fundedAccount(sequence: string, code: string, issuer: string, balance: string, authorized = true): SendAccount {
  return {
    sequence,
    balances: [{ assetCode: code, assetIssuer: issuer, balance, isAuthorized: authorized }],
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
    assert.ok(error instanceof SendActionError, `${label}: expected SendActionError`);
    assert.equal((error as SendActionError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

function signEnvelope(unsignedXdr: string, signer: Keypair): string {
  const parsed = TransactionBuilder.fromXDR(unsignedXdr, Networks.PUBLIC);
  if (parsed instanceof FeeBumpTransaction) throw new Error("unexpected fee bump in fixture");
  (parsed as Transaction).sign(signer);
  return (parsed as Transaction).toXDR();
}

function buildSignedPayment(args: {
  source: Keypair;
  sequence: string;
  destination: string;
  code: string;
  issuer: string;
  amount: string;
  extraOp?: boolean;
  memo?: boolean;
}): string {
  const builder = new TransactionBuilder(new Account(args.source.publicKey(), args.sequence), {
    fee: "100",
    networkPassphrase: Networks.PUBLIC,
  }).addOperation(
    Operation.payment({
      destination: args.destination,
      asset: new Asset(args.code, args.issuer),
      amount: args.amount,
    }),
  );
  if (args.extraOp) {
    builder.addOperation(
      Operation.payment({
        destination: args.destination,
        asset: new Asset(args.code, args.issuer),
        amount: "0.5000000",
      }),
    );
  }
  if (args.memo) builder.addMemo(Memo.text("sneaky"));
  const tx = builder.setTimeout(120).build();
  tx.sign(args.source);
  return tx.toXDR();
}

async function main() {
  const sender = await createUser("send-sender");
  const recipient = await createUser("send-recipient");
  const stranger = await createUser("send-stranger");
  const senderKeys = Keypair.random();
  const recipientKeys = Keypair.random();

  // Recipient enables an authenticated Stellar endpoint; sender saves them.
  await enableStellarReceiveEndpoint(recipient.id, recipientKeys.publicKey(), { enabled: true });
  const contact = await saveUserContact(sender.id, recipient.handle);

  const accounts: MockAccounts = new Map([
    [senderKeys.publicKey(), fundedAccount("10", USDC.code, USDC.issuer, "12.4000000")],
    [recipientKeys.publicKey(), fundedAccount("7", USDC.code, USDC.issuer, "0.0000000")],
  ]);
  const log = { submitted: [] as string[] };
  const horizon = mockHorizon(accounts, log);

  // 1. Policy: only source-backed transferable assets enabled.
  assert.deepEqual(
    SENDABLE_ASSETS.map((entry) => entry.slug).sort(),
    ["benji-on-stellar", "pyusd-on-stellar", "usdc-on-stellar", "wtgxx-on-stellar"],
  );
  assert.equal(getSendableAsset("tipsx-on-stellar"), null, "no-issuer assets disabled");
  assert.equal(getSendableAsset("usdy-on-stellar"), null, "unverified-issuer assets disabled");
  assert.equal(getSendableAsset("usdc-on-base"), null, "non-Stellar never sendable");
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "tipsx-on-stellar", handle: recipient.handle, amount: "1" }, horizon),
    "unsupported-asset",
    "unsupported asset has no Send",
  );

  // 2. Resolver visibility respected.
  await expectCode(
    prepareSend(stranger.id, Keypair.random().publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "1" }, horizon),
    "invalid-request",
    "stranger blocked by contacts_only",
  );

  // 3. Recipient preflight: trustline required, authorization enforced.
  const noTrustAccounts: MockAccounts = new Map([
    [senderKeys.publicKey(), fundedAccount("10", USDC.code, USDC.issuer, "12.4000000")],
    [recipientKeys.publicKey(), { sequence: "7", balances: [] }],
  ]);
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "1" }, mockHorizon(noTrustAccounts, { submitted: [] })),
    "invalid-request",
    "recipient trustline required",
  );
  const lockedAccounts: MockAccounts = new Map([
    [senderKeys.publicKey(), fundedAccount("10", USDC.code, USDC.issuer, "12.4000000")],
    [recipientKeys.publicKey(), fundedAccount("7", USDC.code, USDC.issuer, "0.0000000", false)],
  ]);
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "1" }, mockHorizon(lockedAccounts, { submitted: [] })),
    "invalid-request",
    "recipient authorization enforced",
  );

  // 4. Sender balance + exact decimals; self-send blocked.
  const poorAccounts: MockAccounts = new Map([
    [senderKeys.publicKey(), fundedAccount("10", USDC.code, USDC.issuer, "0.5000000")],
    [recipientKeys.publicKey(), fundedAccount("7", USDC.code, USDC.issuer, "0.0000000")],
  ]);
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "5" }, mockHorizon(poorAccounts, { submitted: [] })),
    "invalid-request",
    "sender balance enforced",
  );
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "5.12345678" }, horizon),
    "invalid-request",
    "8-decimal amount rejected",
  );
  const selfHandle = (await database.select().from(users).where(eq(users.id, sender.id)).limit(1))[0]!.handle;
  await enableStellarReceiveEndpoint(sender.id, senderKeys.publicKey(), { enabled: true });
  await saveUserContact(sender.id, selfHandle).catch(() => null);
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: selfHandle, amount: "1" }, horizon),
    "invalid-request",
    "self-send blocked",
  );

  // 5. Happy path: prepare → sign → submit → confirmed receipt.
  // Saved-contact selection resolves the same endpoint as @handle.
  const viaContact = await prepareSend(
    sender.id,
    senderKeys.publicKey(),
    { circleSlug: "usdc-on-stellar", contactId: contact.id, amount: "1" },
    horizon,
  );
  assert.equal(viaContact.amount, "1.0000000");
  assert.equal(viaContact.destinationAddress, recipientKeys.publicKey());
  const prepared = await prepareSend(
    sender.id,
    senderKeys.publicKey(),
    { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "5.5" },
    horizon,
  );
  assert.equal(prepared.amount, "5.5000000", "exact decimal normalization");
  assert.equal(prepared.senderBalance, "12.4000000");
  assert.equal(prepared.network, "stellar_mainnet");
  assert.equal(prepared.permissioned, false);
  // The prepared envelope is a single native payment — never CCTP.
  const unsigned = TransactionBuilder.fromXDR(prepared.unsignedXdr, Networks.PUBLIC) as Transaction;
  assert.equal(unsigned.operations.length, 1);
  const unsignedOp = unsigned.operations[0] as { type: string; destination: string };
  assert.equal(unsignedOp.type, "payment");
  assert.equal(unsignedOp.destination, recipientKeys.publicKey());

  const signedXdr = signEnvelope(prepared.unsignedXdr, senderKeys);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.PUBLIC) as Transaction;
  const txHash = Buffer.from(signedTx.hash()).toString("hex");
  horizon.confirmations.set(txHash, { hash: txHash, successful: true, sourceAccount: senderKeys.publicKey(), ledger: 99 });
  const confirmed = await submitSend(prepared.transferId, sender.id, senderKeys.publicKey(), signedXdr, horizon);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.transactionHash, txHash);
  assert.equal(confirmed.ledger, 99);
  assert.ok(confirmed.confirmedAt);
  assert.equal(log.submitted.length, 1, "submitted exactly once");

  // 6. Duplicate submit safe: same envelope returns the receipt, no rebroadcast.
  const duplicate = await submitSend(prepared.transferId, sender.id, senderKeys.publicKey(), signedXdr, horizon);
  assert.equal(duplicate.status, "confirmed");
  assert.equal(duplicate.transactionHash, txHash);
  assert.equal(log.submitted.length, 1, "no rebroadcast on duplicate");

  // 7. Source wallet cannot be substituted.
  const otherKeys = Keypair.random();
  const accounts2: MockAccounts = new Map([
    [senderKeys.publicKey(), fundedAccount("11", USDC.code, USDC.issuer, "12.4000000")],
    [recipientKeys.publicKey(), fundedAccount("7", USDC.code, USDC.issuer, "0.0000000")],
  ]);
  const horizon2 = mockHorizon(accounts2, { submitted: [] });
  const prepared2 = await prepareSend(
    sender.id, senderKeys.publicKey(),
    { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "1" }, horizon2,
  );
  const signed2 = signEnvelope(prepared2.unsignedXdr, senderKeys);
  await expectCode(
    submitSend(prepared2.transferId, sender.id, otherKeys.publicKey(), signed2, horizon2),
    "invalid-request",
    "source substitution rejected",
  );

  // 8. XDR verification rejects every modification class.
  async function expectTampered(tampered: string, label: string) {
    await expectCode(submitSend(prepared2.transferId, sender.id, senderKeys.publicKey(), tampered, horizon2), "invalid-request", label);
  }
  const strangerKeys = Keypair.random();
  await expectTampered(buildSignedPayment({ source: senderKeys, sequence: "11", destination: strangerKeys.publicKey(), code: USDC.code, issuer: USDC.issuer, amount: "1.0000000" }), "modified destination rejected");
  await expectTampered(buildSignedPayment({ source: senderKeys, sequence: "11", destination: recipientKeys.publicKey(), code: USDC.code, issuer: USDC.issuer, amount: "2.0000000" }), "modified amount rejected");
  await expectTampered(buildSignedPayment({ source: senderKeys, sequence: "11", destination: recipientKeys.publicKey(), code: "FAKE", issuer: USDC.issuer, amount: "1.0000000" }), "modified asset rejected");
  await expectTampered(buildSignedPayment({ source: senderKeys, sequence: "11", destination: recipientKeys.publicKey(), code: USDC.code, issuer: USDC.issuer, amount: "0.5000000", extraOp: true }), "extra operations rejected");
  await expectTampered(buildSignedPayment({ source: senderKeys, sequence: "11", destination: recipientKeys.publicKey(), code: USDC.code, issuer: USDC.issuer, amount: "1.0000000", memo: true }), "memo rejected");

  // 9. Permissioned assets fail closed when readiness is unknown.
  const benjiRecipient = Keypair.random();
  const benjiRecipientUser = await createUser("send-benji-recipient");
  await enableStellarReceiveEndpoint(benjiRecipientUser.id, benjiRecipient.publicKey(), { enabled: true });
  await saveUserContact(sender.id, benjiRecipientUser.handle);
  const benjiAccounts: MockAccounts = new Map([
    [senderKeys.publicKey(), fundedAccount("12", BENJI.code, BENJI.issuer, "10.0000000")],
    [benjiRecipient.publicKey(), { sequence: "3", balances: [] }],
  ]);
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "benji-on-stellar", handle: benjiRecipientUser.handle, amount: "1" }, mockHorizon(benjiAccounts, { submitted: [] })),
    "invalid-request",
    "permissioned readiness unknown fails closed",
  );

  // 10. Privacy: history owner-scoped; receipts carry no CCTP/public-feed data.
  const mine = await listMySendTransfers(sender.id);
  assert(mine.length >= 1, "sender history durable");
  assert(mine.every((entry) => entry.network === "stellar_mainnet"));
  const theirs = await listMySendTransfers(stranger.id);
  assert.equal(theirs.length, 0, "no cross-user history");
  await expectCode(getSendTransfer(prepared.transferId, stranger.id), "invalid-request", "cross-user read blocked");
  const receiptKeys = Object.keys(confirmed).sort();
  assert.deepEqual(receiptKeys, ["amount", "assetCode", "circleSlug", "confirmedAt", "createdAt", "destinationAddress", "destinationHandle", "failureReason", "id", "lastError", "ledger", "network", "networkLabel", "permissioned", "status", "transactionHash"]);
  assert(!JSON.stringify(confirmed).toLowerCase().includes("cctp"), "USDC Send never invokes CCTP");

  // 11. P3.3 Permissioned-asset boundaries: grant vs deny distinguished on
  // live Horizon evidence at the single prepare choke point (every UI entry
  // — form, ?asset= deep link — funnels through prepareSend; cross-chain is
  // USDC-only by pinned config so BENJI-class assets cannot enter there).
  // Sender-side denial: authorized recipient, locked sender trustline.
  const benjiSender = Keypair.random();
  const benjiSenderUser = await createUser("send-benji-sender");
  await enableStellarReceiveEndpoint(benjiRecipientUser.id, benjiRecipient.publicKey(), { enabled: true });
  await saveUserContact(benjiSenderUser.id, benjiRecipientUser.handle);
  const senderLockedAccounts: MockAccounts = new Map([
    [benjiSender.publicKey(), fundedAccount("12", BENJI.code, BENJI.issuer, "10.0000000", false)],
    [benjiRecipient.publicKey(), fundedAccount("3", BENJI.code, BENJI.issuer, "0.0000000", true)],
  ]);
  await expectCode(
    prepareSend(benjiSenderUser.id, benjiSender.publicKey(), { circleSlug: "benji-on-stellar", handle: benjiRecipientUser.handle, amount: "1" }, mockHorizon(senderLockedAccounts, { submitted: [] })),
    "invalid-request",
    "sender authorization denied fails closed",
  );
  // Permission granted: both trustlines authorized → prepare succeeds and
  // marks the transfer permissioned. No submit: preparation is the read
  // gate; settlement stays a human-signed step outside this verifier.
  const grantedAccounts: MockAccounts = new Map([
    [benjiSender.publicKey(), fundedAccount("12", BENJI.code, BENJI.issuer, "10.0000000", true)],
    [benjiRecipient.publicKey(), fundedAccount("3", BENJI.code, BENJI.issuer, "0.0000000", true)],
  ]);
  const granted = await prepareSend(benjiSenderUser.id, benjiSender.publicKey(), { circleSlug: "benji-on-stellar", handle: benjiRecipientUser.handle, amount: "1" }, mockHorizon(grantedAccounts, { submitted: [] }));
  assert.equal(granted.permissioned, true, "granted transfer marked permissioned");
  assert.equal(granted.amount, "1.0000000", "granted transfer carries the exact amount");
  // RPC failure fails closed with a retryable code, never a silent pass.
  const failingHorizon = {
    ...mockHorizon(new Map(), { submitted: [] }),
    getAccount: async () => {
      throw new Error("simulated Horizon outage");
    },
  };
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "1" }, failingHorizon),
    "verification-unavailable",
    "Horizon outage fails closed",
  );
  // Client-claimed permission is ignored: extra fields cannot authorize.
  await expectCode(
    prepareSend(sender.id, senderKeys.publicKey(), { circleSlug: "usdc-on-stellar", handle: recipient.handle, amount: "1", isAuthorized: true } as unknown as Parameters<typeof prepareSend>[2], mockHorizon(lockedAccounts, { submitted: [] })),
    "invalid-request",
    "client permission claim ignored",
  );
  // Policy flag drives every entry point identically.
  assert.equal(getSendableAsset("benji-on-stellar")?.permissioned, true, "BENJI policy is permissioned everywhere");
  assert.equal(getSendableAsset("usdc-on-stellar")?.permissioned, false, "USDC policy stays unrestricted");

  console.log("send:verify ok — 11 groups, all assertions passed.");
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
