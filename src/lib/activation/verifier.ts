import "server-only";
import { compareDecimal7, normalizeDecimal7 } from "@/lib/missions/config";

const HORIZON_BASE_URL = "https://horizon.stellar.org";

export type HorizonFetch = (url: string) => Promise<unknown>;

export type OnchainVerificationFailure =
  | "transaction-not-found"
  | "transaction-failed"
  | "no-qualifying-payment"
  | "wallet-mismatch"
  | "wrong-asset"
  | "amount-below-minimum"
  | "predates-campaign"
  | "proof-reused"
  | "verification-unavailable";

export type VerifiedOnchainPayment = {
  sourceAccount: string;
  destinationAccount: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  ledger: number | null;
  transactionCreatedAt: string | null;
  operationIndex: number;
};

export type OnchainVerificationResult =
  | { ok: true; payment: VerifiedOnchainPayment }
  | { ok: false; failure: OnchainVerificationFailure };

export type OnchainVerificationExpectation = {
  expectedSource: string;
  assetCode: string;
  assetIssuer: string;
  minimumAmount: string;
  proofNotBefore: string;
};

async function defaultFetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Horizon responded with status ${response.status}.`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeTransactionHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

/**
 * Verify a Stellar Mainnet payment proof against server-controlled expectations.
 * Every rule is enforced here; the caller only supplies the hash and the
 * session-derived wallet. fetchJson is injectable for deterministic tests.
 */
export async function verifyOnchainPayment(
  transactionHash: string,
  expectation: OnchainVerificationExpectation,
  fetchJson: HorizonFetch = defaultFetchJson,
): Promise<OnchainVerificationResult> {
  let transaction: unknown;
  let operations: unknown;
  try {
    [transaction, operations] = await Promise.all([
      fetchJson(`${HORIZON_BASE_URL}/transactions/${transactionHash}`),
      fetchJson(`${HORIZON_BASE_URL}/transactions/${transactionHash}/operations?limit=200&order=asc`),
    ]);
  } catch {
    return { ok: false, failure: "verification-unavailable" };
  }

  if (transaction === null || transaction === undefined) {
    return { ok: false, failure: "transaction-not-found" };
  }
  if (!isRecord(transaction) || !isRecord(operations) || !Array.isArray(operations.records)) {
    return { ok: false, failure: "verification-unavailable" };
  }
  if (transaction.successful !== true) {
    return { ok: false, failure: "transaction-failed" };
  }

  const txSource = typeof transaction.source_account === "string" ? transaction.source_account : "";
  const txCreatedAt = typeof transaction.created_at === "string" ? transaction.created_at : null;
  const txLedger = typeof transaction.ledger === "number" ? transaction.ledger : null;

  const records = operations.records.filter(isRecord);
  let match: VerifiedOnchainPayment | null = null;
  let sawPaymentFromOtherWallet = false;
  let sawWrongAsset = false;
  let sawLowAmount = false;

  for (let index = 0; index < records.length; index += 1) {
    const operation = records[index]!;
    if (operation.type !== "payment") continue;
    const effectiveSource =
      typeof operation.source_account === "string" ? operation.source_account : txSource;
    if (typeof operation.to !== "string" || !effectiveSource) continue;

    const assetType = operation.asset_type;
    const opAssetCode = typeof operation.asset_code === "string" ? operation.asset_code : null;
    const opAssetIssuer = typeof operation.asset_issuer === "string" ? operation.asset_issuer : null;
    const isExpectedAsset =
      assetType !== "native" &&
      opAssetCode === expectation.assetCode &&
      opAssetIssuer === expectation.assetIssuer;
    if (!isExpectedAsset) {
      sawWrongAsset = true;
      continue;
    }
    if (effectiveSource !== expectation.expectedSource) {
      sawPaymentFromOtherWallet = true;
      continue;
    }
    const amount = normalizeDecimal7(operation.amount);
    if (!amount || compareDecimal7(amount, expectation.minimumAmount) < 0) {
      sawLowAmount = true;
      continue;
    }
    if (operation.to === effectiveSource) continue;
    if (
      txCreatedAt &&
      Number.isFinite(Date.parse(txCreatedAt)) &&
      Date.parse(txCreatedAt) < Date.parse(expectation.proofNotBefore)
    ) {
      return { ok: false, failure: "predates-campaign" };
    }
    // First qualifying operation wins deterministically; the index is persisted.
    if (!match) {
      match = {
        sourceAccount: effectiveSource,
        destinationAccount: operation.to,
        assetCode: expectation.assetCode,
        assetIssuer: expectation.assetIssuer,
        amount,
        ledger: txLedger,
        transactionCreatedAt: txCreatedAt,
        operationIndex: index,
      };
    }
  }

  if (match) return { ok: true, payment: match };
  if (sawPaymentFromOtherWallet) return { ok: false, failure: "wallet-mismatch" };
  if (sawLowAmount) return { ok: false, failure: "amount-below-minimum" };
  if (sawWrongAsset) return { ok: false, failure: "wrong-asset" };
  return { ok: false, failure: "no-qualifying-payment" };
}

export function verificationFailureMessage(failure: OnchainVerificationFailure): string {
  switch (failure) {
    case "transaction-not-found":
      return "That transaction hash was not found on Stellar Mainnet. Check the hash and try again.";
    case "transaction-failed":
      return "That Stellar transaction did not succeed, so it cannot prove this activation.";
    case "no-qualifying-payment":
      return "No qualifying USDC payment was found in that transaction.";
    case "wallet-mismatch":
      return "The qualifying payment was not sent from the wallet connected to this Vicus session.";
    case "wrong-asset":
      return "The payment used the wrong asset. This activation requires the official USDC asset.";
    case "amount-below-minimum":
      return "The payment amount is below this campaign's minimum.";
    case "predates-campaign":
      return "That transaction predates this campaign. Make a new qualifying payment to activate.";
    case "proof-reused":
      return "That transaction has already been used for this activation.";
    case "verification-unavailable":
      return "Onchain verification is temporarily unavailable. Nothing was judged — try again shortly.";
  }
}
