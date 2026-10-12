import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import { users } from "../src/db/schema";
import {
  ACCESS_STELLAR_DOMAIN,
  ACCESS_TESTNET,
  getPublicAccessConfig,
} from "../src/lib/access/config";
import {
  AccessActionError,
  accessAmountToSubunits6,
  attachAccessBurn,
  compareAccessAmount,
  createAccessTransfer,
  evmAddressToBytes32,
  formatSubunits6,
  getAccessTransfer,
  normalizeAccessAmount,
  prepareAccessBurn,
  refreshAccessTransfer,
  toAccessCompletionProof,
  type AccessAttestationResult,
  type AccessFeeResult,
} from "../src/lib/access/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const EVM_A = "0xAbCdef0123456789aBcDEf0123456789ABCDEF01";
const EVM_B = "0x1111111111111111111111111111111111111111";
const SOLANA_VALID = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const DEST_TX = "c".repeat(64);

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Offline-built Freighter-style burn envelope. Never submitted anywhere. */
function buildBurnEnvelope(source: Keypair, recipientBytes32: string): string {
  const fromScVal = new Address(source.publicKey()).toScVal();
  const tx = new TransactionBuilder(new Account(source.publicKey(), "100"), {
    fee: "100",
    networkPassphrase: ACCESS_TESTNET.networkPassphrase,
  })
    .addOperation(
      new Contract(ACCESS_TESTNET.tokenMessengerMinter).call(
        "deposit_for_burn_with_hook",
        fromScVal,
        nativeToScVal(BigInt(10000000), { type: "i128" }),
        nativeToScVal(6, { type: "u32" }),
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes(recipientBytes32))),
        new Address(ACCESS_TESTNET.usdcSac).toScVal(),
        xdr.ScVal.scvBytes(Buffer.alloc(32)),
        nativeToScVal(BigInt(500000), { type: "i128" }),
        nativeToScVal(2000, { type: "u32" }),
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes("0x636374702d666f72776172640000000000000000000000000000000000000000"))),
      ),
    )
    .setTimeout(300)
    .build();
  tx.sign(source);
  return tx.toXDR();
}

function buildClassicEnvelope(source: Keypair): string {
  const tx = new TransactionBuilder(new Account(source.publicKey(), "100"), {
    fee: "100",
    networkPassphrase: ACCESS_TESTNET.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(300)
    .build();
  tx.sign(source);
  return tx.toXDR();
}

type MockTransport = {
  calls: { attestation: string[]; fee: Array<[number, number]> };
  attestationResult: AccessAttestationResult;
  feeResult: AccessFeeResult;
  attestationDown: boolean;
  fetchAttestation: (sourceDomain: number, txHash: string) => Promise<AccessAttestationResult>;
  fetchFee: (sourceDomain: number, destDomain: number) => Promise<AccessFeeResult>;
};

function mockTransport(): MockTransport {
  const transport = {
    calls: { attestation: [] as string[], fee: [] as Array<[number, number]> },
    attestationResult: {
      state: "pending",
      message: null,
      attestation: null,
      destinationTxHash: null,
    } as AccessAttestationResult,
    feeResult: { feeSubunits6: "50000" } as AccessFeeResult,
    attestationDown: false,
    async fetchAttestation(sourceDomain: number, txHash: string) {
      transport.calls.attestation.push(`${sourceDomain}:${txHash}`);
      if (transport.attestationDown) throw new Error("Iris unreachable in fixture.");
      return transport.attestationResult;
    },
    async fetchFee(sourceDomain: number, destDomain: number) {
      transport.calls.fee.push([sourceDomain, destDomain]);
      return transport.feeResult;
    },
  };
  return transport;
}

async function createUser(handle: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database
    .insert(users)
    .values({ id, handle, displayName: `${handle} tester`, avatarUrl: null, role: "member" });
  return id;
}

async function expectCode(promise: Promise<unknown>, code: string, label: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AccessActionError, `${label}: expected AccessActionError`);
    assert.equal((error as AccessActionError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

async function main() {
  const userA = await createUser(`access-a-${Date.now()}`);
  const userB = await createUser(`access-b-${Date.now()}`);
  const walletA = Keypair.random();
  const walletB = Keypair.random();

  // 1. Signed-out is blocked everywhere.
  await expectCode(createAccessTransfer(null, {}), "unauthenticated", "signed-out create");
  await expectCode(getAccessTransfer(randomUUID(), undefined), "unauthenticated", "signed-out read");
  await expectCode(prepareAccessBurn(randomUUID(), null, walletA.publicKey()), "unauthenticated", "signed-out prepare");

  // 2. Unsupported asset / destination / invalid destination / precision.
  await expectCode(
    createAccessTransfer(userA, { asset: "ETH", destinationNetwork: "base", destinationAddress: EVM_A, amount: "1", sourceWallet: walletA.publicKey() }),
    "unsupported-asset",
    "unsupported asset",
  );
  await expectCode(
    createAccessTransfer(userA, { destinationNetwork: "polygon", destinationAddress: EVM_A, amount: "1", sourceWallet: walletA.publicKey() }),
    "unsupported-destination",
    "unsupported destination",
  );
  await expectCode(
    createAccessTransfer(userA, { destinationNetwork: "base", destinationAddress: "0x123", amount: "1", sourceWallet: walletA.publicKey() }),
    "invalid-destination",
    "invalid evm destination",
  );
  await expectCode(
    createAccessTransfer(userA, { destinationNetwork: "base", destinationAddress: EVM_A, amount: "1.2345678", sourceWallet: walletA.publicKey() }),
    "invalid-amount",
    ">6 decimal amount",
  );

  // 3. Exact amount conversion, decimal-safe (no floats).
  assert.equal(normalizeAccessAmount("1.5"), "1.500000");
  assert.equal(normalizeAccessAmount("0.000001"), "0.000001");
  assert.equal(normalizeAccessAmount("007.50"), "7.500000");
  assert.equal(accessAmountToSubunits6("1.500000").toString(), "1500000");
  assert.equal(accessAmountToSubunits6("0.000001").toString(), "1");
  assert.equal(formatSubunits6(BigInt(1450000)), "1.450000");
  assert.equal(compareAccessAmount("1.500000", "1.500000"), 0);
  assert.equal(compareAccessAmount("0.000001", "1.500000"), -1);
  assert.equal(evmAddressToBytes32(EVM_A), `0x${"0".repeat(24)}abcdef0123456789abcdef0123456789abcdef01`);

  // 4. Destination capability gating follows config; Solana validates but never executes.
  const publicConfig = getPublicAccessConfig();
  const solanaEntry = publicConfig.destinations.find((entry) => entry.key === "solana");
  assert.ok(solanaEntry && solanaEntry.executable === false, "solana gated off in config");
  assert.ok(publicConfig.destinations.find((entry) => entry.key === "base")?.executable, "base executable");
  assert.ok(publicConfig.destinations.find((entry) => entry.key === "ethereum")?.executable, "ethereum executable");
  await expectCode(
    createAccessTransfer(userA, { destinationNetwork: "solana", destinationAddress: SOLANA_VALID, amount: "1", sourceWallet: walletA.publicKey() }),
    "destination-coming-soon",
    "solana coming soon",
  );
  await expectCode(
    createAccessTransfer(userA, { destinationNetwork: "solana", destinationAddress: "not-a-key", amount: "1", sourceWallet: walletA.publicKey() }),
    "destination-coming-soon",
    "solana gated before format validation",
  );

  // 5. Happy-path draft: participant controls only amount/chain/address.
  const draft = await createAccessTransfer(userA, {
    destinationNetwork: "base",
    destinationAddress: EVM_A,
    amount: "1.5",
    sourceWallet: walletA.publicKey(),
  });
  assert.equal(draft.asset, "USDC");
  assert.equal(draft.sourceNetwork, "stellar_testnet");
  assert.equal(draft.environment, "testnet");
  assert.equal(draft.status, "draft");
  assert.equal(draft.amount, "1.500000");
  assert.equal(draft.amountSubunits6, "1500000");
  assert.equal(draft.destinationAddress, EVM_A.toLowerCase());
  assert.equal(draft.destinationDomain, 6);

  // 6. Preparation is server-owned: domains/contracts/token cannot be overridden.
  const plan = await prepareAccessBurn(draft.id, userA, walletA.publicKey());
  assert.equal(plan.tokenMessengerMinter, ACCESS_TESTNET.tokenMessengerMinter);
  assert.equal(plan.usdcSac, ACCESS_TESTNET.usdcSac);
  assert.equal(plan.sourceDomain, ACCESS_STELLAR_DOMAIN);
  assert.equal(plan.sourceDomain, 27);
  assert.equal(plan.destinationDomain, 6);
  assert.equal(plan.network, "stellar_testnet");
  assert.equal(plan.finalityThreshold, 2000);
  assert.equal(plan.amountSubunits6, "1500000");
  assert.equal(plan.burnSubunits7, "15000000");
  assert.equal(plan.mintRecipientBytes32, evmAddressToBytes32(EVM_A.toLowerCase()));
  await expectCode(prepareAccessBurn(draft.id, userA, walletB.publicKey()), "wrong-source-wallet", "prepare wrong wallet");

  // 7. Burn attach: wrong network / wrong wallet / foreign envelopes rejected.
  const goodEnvelope = buildBurnEnvelope(walletA, plan.mintRecipientBytes32);
  const foreignEnvelope = buildBurnEnvelope(walletA, evmAddressToBytes32(EVM_B));
  const classicEnvelope = buildClassicEnvelope(walletA);
  await expectCode(
    attachAccessBurn(draft.id, userA, { sourceTxHash: HASH_A, signedXdr: goodEnvelope, network: "stellar_mainnet", sourceWallet: walletA.publicKey() }),
    "wrong-network",
    "wrong network envelope",
  );
  await expectCode(
    attachAccessBurn(draft.id, userA, { sourceTxHash: HASH_A, signedXdr: goodEnvelope, network: "stellar_testnet", sourceWallet: walletB.publicKey() }),
    "wrong-source-wallet",
    "wrong source wallet",
  );
  await expectCode(
    attachAccessBurn(draft.id, userA, { sourceTxHash: HASH_A, signedXdr: foreignEnvelope, network: "stellar_testnet", sourceWallet: walletA.publicKey() }),
    "invalid-request",
    "foreign recipient envelope",
  );
  await expectCode(
    attachAccessBurn(draft.id, userA, { sourceTxHash: HASH_A, signedXdr: classicEnvelope, network: "stellar_testnet", sourceWallet: walletA.publicKey() }),
    "invalid-request",
    "non-soroban envelope",
  );

  // 8. Attach once; the same hash re-attached is a no-op, never a reburn.
  const burned = await attachAccessBurn(draft.id, userA, {
    sourceTxHash: HASH_A,
    signedXdr: goodEnvelope,
    network: "stellar_testnet",
    sourceWallet: walletA.publicKey(),
  });
  assert.equal(burned.status, "burned");
  assert.equal(burned.sourceTxHash, HASH_A);
  const resumed = await attachAccessBurn(draft.id, userA, {
    sourceTxHash: HASH_A,
    signedXdr: goodEnvelope,
    network: "stellar_testnet",
    sourceWallet: walletA.publicKey(),
  });
  assert.equal(resumed.id, burned.id, "refresh resumes same transfer");
  assert.equal(resumed.sourceTxHash, HASH_A);
  await expectCode(
    attachAccessBurn(draft.id, userA, { sourceTxHash: HASH_B, signedXdr: goodEnvelope, network: "stellar_testnet", sourceWallet: walletA.publicKey() }),
    "invalid-transition",
    "second burn rejected",
  );

  // 9. Refresh tracks without reburning; fee derives from the fee API (never invented).
  const transport = mockTransport();
  const tracking = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(tracking.id, draft.id);
  assert.equal(tracking.status, "attesting");
  assert.equal(tracking.fee, "0.050000");
  assert.equal(tracking.expectedDestinationAmount, "1.450000");
  assert.deepEqual(transport.calls.fee[0], [27, 6]);
  assert.deepEqual(transport.calls.attestation[0], `27:${HASH_A}`);
  const trackingAgain = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(trackingAgain.id, draft.id, "refresh resumes same transfer");
  assert.equal(trackingAgain.sourceTxHash, HASH_A);

  // 10. Attestation/fee outage is retryable, never failure-as-fact.
  transport.attestationDown = true;
  const outage = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(outage.retryable, true);
  assert.equal(outage.status, "attesting");
  assert.ok(outage.lastError);
  transport.attestationDown = false;
  const recovered = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(recovered.retryable, false);

  // 11. Forwarding → completion persists exactly once.
  transport.attestationResult = {
    state: "complete",
    message: "0xdeadbeef",
    attestation: "0xattest",
    destinationTxHash: null,
  };
  const forwarding = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(forwarding.status, "forwarding");
  transport.attestationResult = {
    state: "complete",
    message: "0xdeadbeef",
    attestation: "0xattest",
    destinationTxHash: DEST_TX,
  };
  const completed = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(completed.status, "completed");
  assert.equal(completed.destinationTxHash, DEST_TX);
  assert.ok(completed.completedAt);
  const completedAgain = await refreshAccessTransfer(draft.id, userA, transport);
  assert.equal(completedAgain.status, "completed");
  assert.equal(completedAgain.completedAt, completed.completedAt, "completion persists once");

  // 12. Another user cannot read or mutate the transfer.
  await expectCode(getAccessTransfer(draft.id, userB), "not-found", "cross-user read");
  await expectCode(
    attachAccessBurn(draft.id, userB, { sourceTxHash: HASH_A, signedXdr: goodEnvelope, network: "stellar_testnet", sourceWallet: walletA.publicKey() }),
    "not-found",
    "cross-user mutate",
  );
  await expectCode(refreshAccessTransfer(draft.id, userB, transport), "not-found", "cross-user refresh");

  // 13. Completion proofs leak no destination or transaction data.
  const proof = toAccessCompletionProof(completed);
  assert.deepEqual(Object.keys(proof).sort(), ["amount", "asset", "completedAt", "destinationNetwork", "id", "status"]);
  assert.ok(!JSON.stringify(proof).includes(DEST_TX));
  assert.ok(!JSON.stringify(proof).includes(EVM_A.toLowerCase().slice(2)));

  console.log("access:verify ok — 13 groups, all assertions passed.");
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
