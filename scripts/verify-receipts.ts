import { strict as assert } from "node:assert";
import {
  accessReceipt,
  campaignReceipt,
  crosschainReceipt,
  explorerTxUrl,
  rewardReceipt,
  sendReceipt,
  swapReceipt,
  type CanonicalReceipt,
} from "../src/lib/receipts/receipts";

const HASH_A = "36798e6e184e1c031236d47940dbf6e894447bce260cb918c8c1a2e6985b78fc";
const HASH_B = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function stages(receipt: CanonicalReceipt) {
  return `${receipt.flow}:${receipt.flowStatus}->${receipt.stage}`;
}

async function main() {
  // 1. Send lifecycle: initiated → prepared → submitted → settled | failed.
  const sendDraft = sendReceipt({ id: ID(1), status: "draft", network: "stellar_mainnet", assetCode: "USDC", createdAt: "2026-10-14T00:00:00.000Z" });
  assert.equal(sendDraft.stage, "initiated", "send draft is initiated, not prepared");
  assert.equal(sendDraft.txHash, null, "no hash invented");
  assert.equal(sendDraft.explorerUrl, null, "no link without a reference");
  const sendPrep = sendReceipt({ id: ID(2), status: "prepared", network: "stellar_mainnet", assetCode: "USDC" });
  assert.equal(sendPrep.stage, "prepared", "prepared is not signed");
  const sendSub = sendReceipt({ id: ID(3), status: "submitted", network: "stellar_mainnet", assetCode: "USDC", transactionHash: HASH_A });
  assert.equal(sendSub.stage, "submitted", "submitted is not settled");
  assert.ok(sendSub.explorerUrl?.includes(HASH_A) && sendSub.explorerUrl?.includes("stellar.expert"), "stellar explorer link");
  const sendDone = sendReceipt({ id: ID(4), status: "confirmed", network: "stellar_mainnet", assetCode: "USDC", transactionHash: HASH_A, ledger: 99, confirmedAt: "2026-10-14T01:00:00.000Z" });
  assert.equal(sendDone.stage, "settled", "confirmed with hash settles");
  assert.equal(sendDone.ledger, 99, "ledger preserved");
  assert.equal(sendDone.timestamps.settledAt, "2026-10-14T01:00:00.000Z", "settlement timestamp preserved");
  const sendFail = sendReceipt({ id: ID(5), status: "failed", network: "stellar_mainnet", assetCode: "USDC", failureReason: "rejected", lastError: "tx failed" });
  assert.equal(sendFail.stage, "failed", "failed stays failed");
  assert.equal(sendFail.failure.code, "rejected", "failure code preserved");
  // Confirmed WITHOUT a hash must not become success.
  const sendHollow = sendReceipt({ id: ID(6), status: "confirmed", network: "stellar_mainnet", assetCode: "USDC" });
  assert.equal(sendHollow.stage, "unknown", "confirmed-without-hash is unknown");
  assert.ok((sendHollow.recovery.note ?? "").length > 0, "downgrade explained");
  assert.equal(sendHollow.flowStatus, "confirmed", "original status never rewritten");

  // 2. Rewards: claimable is initiated (a submitted claim is not a payout);
  // expired is unknown, never failure.
  const rwClaim = rewardReceipt({ id: ID(10), status: "claimable", network: "testnet", asset: "XLM" });
  assert.equal(rwClaim.stage, "initiated", "claimable is initiated, not submitted");
  const rwSub = rewardReceipt({ id: ID(11), status: "submitted", network: "testnet", asset: "XLM", transactionHash: HASH_A });
  assert.equal(rwSub.stage, "submitted", "submitted claim is not a payout");
  assert.ok(rwSub.explorerUrl?.includes("testnet"), "testnet explorer, not mainnet");
  const rwDone = rewardReceipt({ id: ID(12), status: "confirmed", network: "testnet", asset: "XLM", transactionHash: HASH_A, ledger: 5066878 });
  assert.equal(rwDone.stage, "settled", "confirmed payout with hash settles");
  const rwExp = rewardReceipt({ id: ID(13), status: "expired", network: "testnet", asset: "XLM" });
  assert.equal(rwExp.stage, "unknown", "expired is unknown, not failed");

  // 3. Campaign payouts: reserved is prepared; paid needs its payout hash.
  const cpRes = campaignReceipt({ id: ID(20), status: "reserved", rewardAsset: "USDC", rewardNetwork: "stellar_testnet" });
  assert.equal(cpRes.stage, "prepared", "reserved is prepared, not paid");
  const cpPaid = campaignReceipt({ id: ID(21), status: "paid", rewardAsset: "USDC", rewardNetwork: "stellar_testnet", payoutTxHash: HASH_A, payoutLedger: 7, paidAt: "2026-10-14T02:00:00.000Z" });
  assert.equal(cpPaid.stage, "settled", "paid with hash settles");
  const cpHollow = campaignReceipt({ id: ID(22), status: "paid", rewardAsset: "USDC", rewardNetwork: "stellar_testnet" });
  assert.equal(cpHollow.stage, "unknown", "paid-without-hash is unknown");

  // 4. Access orders: a quote is not a transaction; approval is signed only
  // before any swap; completion settles only with a recorded result.
  const axQuote = accessReceipt({ id: ID(30), status: "quoting", sourceNetwork: "stellar_testnet", destinationNetwork: "base", venue: "aerodrome" });
  assert.equal(axQuote.stage, "initiated", "quote is not a transaction");
  const axAppr = accessReceipt({ id: ID(31), status: "quoting", sourceNetwork: "stellar_testnet", destinationNetwork: "base", approvalHash: HASH_B });
  assert.equal(axAppr.stage, "signed", "approval signature recorded as signed");
  const axSwap = accessReceipt({ id: ID(32), status: "ready_to_swap", sourceNetwork: "stellar_testnet", destinationNetwork: "base", approvalHash: HASH_B, swapHash: HASH_A });
  assert.equal(axSwap.stage, "submitted", "swap hash means submitted, not settled");
  const axDone = accessReceipt({ id: ID(33), status: "completed", sourceNetwork: "stellar_testnet", destinationNetwork: "base", swapHash: HASH_A, targetAmount: "1.5", completedAt: "2026-10-14T03:00:00.000Z" });
  assert.equal(axDone.stage, "settled", "completed with result settles");
  assert.equal(axDone.legs.length, 2, "two legs kept separate");
  const axHollow = accessReceipt({ id: ID(34), status: "completed", sourceNetwork: "stellar_testnet", destinationNetwork: "base" });
  assert.equal(axHollow.stage, "unknown", "completed-without-result is unknown");

  // 5. Swaps: signature means submitted, never settled by itself.
  const swReady = swapReceipt({ id: ID(40), status: "ready", actionKind: "swap", destinationNetwork: "solana", venue: "jupiter" });
  assert.equal(swReady.stage, "prepared", "ready is prepared");
  const swSub = swapReceipt({ id: ID(41), status: "submitted", actionKind: "swap", destinationNetwork: "solana", swapSignature: HASH_A });
  assert.equal(swSub.stage, "submitted", "signature is submitted, not settled");
  assert.ok(swSub.explorerUrl?.includes("explorer.solana.com"), "solana explorer link");
  const swDone = swapReceipt({ id: ID(42), status: "confirmed", actionKind: "exit", destinationNetwork: "solana", swapSignature: HASH_A });
  assert.equal(swDone.stage, "settled", "confirmed with signature settles");
  const swHollow = swapReceipt({ id: ID(43), status: "confirmed", actionKind: "swap", destinationNetwork: "solana" });
  assert.equal(swHollow.stage, "unknown", "confirmed-without-signature is unknown");

  // 6. Cross-chain: source success never proves destination delivery.
  const ccBurn = crosschainReceipt({ id: ID(50), status: "burned", sourceNetwork: "stellar_testnet", destinationNetwork: "base", sourceTxHash: HASH_A });
  assert.equal(ccBurn.stage, "submitted", "burned source leg is submitted, not settled");
  assert.equal(ccBurn.legs[0]!.settled, true, "source leg settled");
  assert.equal(ccBurn.legs[1]!.settled, false, "destination leg explicitly unsettled");
  const ccDone = crosschainReceipt({ id: ID(51), status: "completed", sourceNetwork: "stellar_testnet", destinationNetwork: "base", sourceTxHash: HASH_A, destinationTxHash: HASH_B, completedAt: "2026-10-14T04:00:00.000Z" });
  assert.equal(ccDone.stage, "settled", "completed with destination reference settles");
  assert.ok(ccDone.legs.every((leg) => leg.settled), "both legs settled");
  const ccHollow = crosschainReceipt({ id: ID(52), status: "completed", sourceNetwork: "stellar_testnet", destinationNetwork: "base", sourceTxHash: HASH_A });
  assert.equal(ccHollow.stage, "unknown", "completed-without-destination is unknown");
  assert.ok(ccHollow.explorerUrl?.includes(HASH_A), "explorer falls back to the source leg honestly");

  // 7. Unrecognized statuses pass through as unknown with originals intact.
  const weird = sendReceipt({ id: ID(60), status: "migrated_legacy", network: "stellar_mainnet", assetCode: "USDC" });
  assert.equal(weird.stage, "unknown", "legacy status is unknown, not reclassified");
  assert.equal(weird.flowStatus, "migrated_legacy", "original preserved");

  // 8. Explorer discipline: correct network, never fabricated.
  assert.equal(explorerTxUrl("stellar_mainnet", HASH_A), `https://stellar.expert/explorer/public/tx/${HASH_A}`, "mainnet base");
  assert.equal(explorerTxUrl("base", HASH_B), `https://basescan.org/tx/${HASH_B}`, "base link");
  assert.equal(explorerTxUrl("ethereum", HASH_A), null, "unsupported network yields null");
  assert.equal(explorerTxUrl("solana", ""), null, "empty reference yields null");
  assert.equal(explorerTxUrl("solana", "not a hash!!"), null, "malformed reference yields null");
  assert.equal(explorerTxUrl(null, HASH_A), null, "missing network yields null");

  // 9. Duplicate evidence never escalates: same hash twice, same receipt.
  const dupA = sendReceipt({ id: ID(70), status: "confirmed", network: "stellar_mainnet", assetCode: "USDC", transactionHash: HASH_A, ledger: 99 });
  const dupB = sendReceipt({ id: ID(70), status: "confirmed", network: "stellar_mainnet", assetCode: "USDC", transactionHash: HASH_A, ledger: 99 });
  assert.deepEqual(dupA, dupB, "identical evidence yields identical receipts");

  // 10. Historical compatibility: minimal legacy rows degrade gracefully.
  const legacy = rewardReceipt({ id: ID(80), status: "confirmed", network: "public", asset: "XLM" });
  assert.equal(legacy.stage, "unknown", "legacy confirmed-without-hash is unknown, not success");
  assert.equal(legacy.asset.code, "XLM", "asset identity kept");
  assert.equal(legacy.timestamps.createdAt, null, "absent timestamps stay null, never now");

  // 11. Cross-wallet isolation: hints differ per destination, nothing shared.
  const w1 = sendReceipt({ id: ID(90), status: "submitted", network: "stellar_mainnet", assetCode: "USDC", transactionHash: HASH_A, destinationAddress: `G${"A".repeat(55)}` });
  const w2 = sendReceipt({ id: ID(91), status: "submitted", network: "stellar_mainnet", assetCode: "USDC", transactionHash: HASH_A, destinationAddress: `G${"B".repeat(55)}` });
  assert.notEqual(w1.walletHint, w2.walletHint, "hints track their own destination");
  assert.ok(!JSON.stringify([w1, w2]).includes("A".repeat(55)), "no full keys leak");
  for (const receipt of [sendDone, rwDone, cpPaid, axDone, swDone, ccDone, w1]) {
    const blob = JSON.stringify(receipt);
    assert.ok(!/userId|orderId|secret|privateKey/i.test(blob), `${stages(receipt)}: no identity/secret fields`);
  }

  // 12. No false success anywhere in the matrix.
  const matrix: CanonicalReceipt[] = [sendDraft, sendPrep, sendSub, rwClaim, rwSub, cpRes, axQuote, axAppr, axSwap, swReady, swSub, ccBurn];
  for (const receipt of matrix) {
    assert.notEqual(receipt.stage, "settled", `${stages(receipt)}: non-terminal evidence never settles`);
  }

  console.log("receipts:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
