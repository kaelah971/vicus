import "server-only";
import {
  Account,
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  NotFoundError,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  CAMPAIGN_HORIZON_URL,
  CAMPAIGN_REWARD_ASSET,
  CAMPAIGN_REWARD_DECIMALS,
  CAMPAIGN_REWARD_ISSUER,
  baseUnitsToUsdc,
} from "@/lib/campaigns/config";

export type CampaignConfigurationErrorCode = "distributor_not_configured" | "invalid-max-amount";

export class CampaignConfigurationError extends Error {
  constructor(
    public readonly code: CampaignConfigurationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type CampaignSettlementErrorCode =
  | "distributor_not_configured"
  | "invalid_payout_amount"
  | "invalid_destination"
  | "destination_not_ready"
  | "destination_no_trustline"
  | "source_not_ready"
  | "horizon_unavailable"
  | "transaction_rejected"
  | "recovery_required";

export class CampaignSettlementError extends Error {
  constructor(
    public readonly code: CampaignSettlementErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Injectable Horizon transport. Production uses the Testnet Horizon SDK
 * server; the verifier substitutes a deterministic in-memory double. No
 * live funds move in tests.
 */
export type CampaignHorizonAccount = {
  sequence: string;
  balances: {
    assetType: string;
    assetCode?: string;
    assetIssuer?: string;
    balance: string;
    authorized?: boolean;
  }[];
};

export type CampaignHorizonTransaction = {
  hash: string;
  ledger: number | null;
  successful: boolean;
  createdAt: string;
  operations: {
    type: string;
    assetCode?: string;
    assetIssuer?: string;
    destination?: string;
    source?: string;
    amount?: string;
  }[];
};

export type CampaignHorizon = {
  loadAccount(address: string): Promise<CampaignHorizonAccount | null>;
  submitTransaction(signedXdr: string): Promise<{ hash: string; ledger: number | null }>;
  getTransaction(hash: string): Promise<CampaignHorizonTransaction | null>;
};

const sdkServers = new Map<string, Horizon.Server>();

function getSdkServer(): Horizon.Server {
  const cached = sdkServers.get(CAMPAIGN_HORIZON_URL);
  if (cached) return cached;
  const server = new Horizon.Server(CAMPAIGN_HORIZON_URL);
  server.httpClient.defaults.timeout = 10_000;
  sdkServers.set(CAMPAIGN_HORIZON_URL, server);
  return server;
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFoundError) return true;
  if (typeof error !== "object" || error === null || !("response" in error)) return false;
  const response = error.response as { status?: unknown };
  return response.status === 404;
}

async function sdkLoadAccount(address: string): Promise<CampaignHorizonAccount | null> {
  try {
    const account = await getSdkServer().loadAccount(address);
    return {
      sequence: account.sequenceNumber(),
      balances: account.balances.map((entry) => ({
        assetType: entry.asset_type,
        assetCode: "asset_code" in entry ? (entry.asset_code as string) : undefined,
        assetIssuer: "asset_issuer" in entry ? (entry.asset_issuer as string) : undefined,
        balance: "balance" in entry ? String(entry.balance) : "0",
        authorized: !("is_authorized" in entry) || entry.is_authorized !== false,
      })),
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function sdkSubmitTransaction(
  signedXdr: string,
): Promise<{ hash: string; ledger: number | null }> {
  const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  if (!(transaction instanceof Transaction)) {
    throw new Error("Stored campaign envelope is not a normal payment transaction.");
  }
  const result = await getSdkServer().submitTransaction(transaction);
  return { hash: result.hash || Buffer.from(transaction.hash()).toString("hex"), ledger: result.ledger ?? null };
}

async function sdkGetTransaction(hash: string): Promise<CampaignHorizonTransaction | null> {
  const server = getSdkServer();
  try {
    const [transaction, operationsPage] = await Promise.all([
      server.transactions().transaction(hash).call(),
      server.operations().forTransaction(hash).limit(20).call(),
    ]);
    return {
      hash: transaction.hash,
      ledger: transaction.ledger_attr ?? null,
      successful: transaction.successful,
      createdAt: transaction.created_at,
      operations: operationsPage.records.map((record) => ({
        type: record.type,
        assetCode: "asset_code" in record ? String(record.asset_code) : undefined,
        assetIssuer: "asset_issuer" in record ? String(record.asset_issuer) : undefined,
        destination: "to" in record ? String(record.to) : undefined,
        source: "source_account" in record ? String(record.source_account) : undefined,
        amount: "amount" in record ? String(record.amount) : undefined,
      })),
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export const defaultCampaignHorizon: CampaignHorizon = {
  loadAccount: sdkLoadAccount,
  submitTransaction: sdkSubmitTransaction,
  getTransaction: sdkGetTransaction,
};

export type CampaignSettlementConfig = {
  distributorSecret: string;
  maxUnits: bigint;
};

export function getCampaignSettlementConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CampaignSettlementConfig {
  const distributorSecret = environment.VICUS_CAMPAIGN_DISTRIBUTOR_SECRET?.trim();
  if (!distributorSecret) {
    throw new CampaignConfigurationError(
      "distributor_not_configured",
      "A dedicated campaign reward distributor is not configured.",
    );
  }
  let maxUnits = BigInt(10) * BigInt(10000000);
  const rawMax = environment.VICUS_CAMPAIGN_MAX_USDC?.trim();
  if (rawMax) {
    const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(rawMax);
    if (!match) {
      throw new CampaignConfigurationError("invalid-max-amount", "The configured USDC payout limit is invalid.");
    }
    maxUnits = BigInt(match[1]!) * BigInt(10000000) + BigInt((match[2] ?? "").padEnd(7, "0"));
    if (maxUnits <= BigInt(0)) {
      throw new CampaignConfigurationError("invalid-max-amount", "The configured USDC payout limit must be positive.");
    }
  }
  return { distributorSecret, maxUnits };
}

/** Public treasury address derived from the distributor secret. Never the secret. */
export function getCampaignTreasuryAccount(environment: NodeJS.ProcessEnv = process.env): string {
  const { distributorSecret } = getCampaignSettlementConfig(environment);
  return Keypair.fromSecret(distributorSecret).publicKey();
}

export function campaignUsdcAsset(): Asset {
  return new Asset(CAMPAIGN_REWARD_ASSET, CAMPAIGN_REWARD_ISSUER);
}

export type PreparedCampaignPayout = {
  transactionHash: string;
  signedEnvelopeXdr: string;
  amountUnits: bigint;
};

export type ConfirmedCampaignPayout = {
  transactionHash: string;
  ledger: number | null;
  confirmedAt: Date;
};

/**
 * Prepare a Testnet USDC payout. Network is hardcoded to TESTNET by
 * construction — there is no network parameter to override. Amount is
 * server-owned base units; destination must already exist with a USDC
 * trustline or preparation fails retryably (never auto-creates accounts).
 */
export async function prepareCampaignPayout(
  amountUnits: bigint,
  destinationPublicKey: string,
  horizon: CampaignHorizon = defaultCampaignHorizon,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PreparedCampaignPayout> {
  const config = getCampaignSettlementConfig(environment);
  if (amountUnits <= BigInt(0) || amountUnits > config.maxUnits) {
    throw new CampaignSettlementError("invalid_payout_amount", "The campaign payout amount is outside the configured limit.");
  }
  if (!StrKey.isValidEd25519PublicKey(destinationPublicKey)) {
    throw new CampaignSettlementError("invalid_destination", "The verified Stellar destination is invalid.");
  }
  let distributor: Keypair;
  try {
    distributor = Keypair.fromSecret(config.distributorSecret);
  } catch {
    throw new CampaignSettlementError("distributor_not_configured", "The campaign distributor secret is invalid.");
  }
  let destination: CampaignHorizonAccount | null;
  let source: CampaignHorizonAccount | null;
  try {
    [destination, source] = await Promise.all([
      horizon.loadAccount(destinationPublicKey),
      horizon.loadAccount(distributor.publicKey()),
    ]);
  } catch {
    throw new CampaignSettlementError("horizon_unavailable", "Stellar Testnet could not be reached while preparing the payout.");
  }
  if (!destination) {
    throw new CampaignSettlementError(
      "destination_not_ready",
      "That Stellar address is not active on Stellar Testnet yet. Activate it and add a USDC trustline first.",
    );
  }
  const trustline = destination.balances.find(
    (entry) => entry.assetCode === CAMPAIGN_REWARD_ASSET && entry.assetIssuer === CAMPAIGN_REWARD_ISSUER,
  );
  if (!trustline || trustline.authorized === false) {
    throw new CampaignSettlementError(
      "destination_no_trustline",
      "That address cannot receive Testnet USDC yet. Add the USDC trustline first.",
    );
  }
  if (!source) {
    throw new CampaignSettlementError("source_not_ready", "The campaign treasury is not active on Stellar Testnet.");
  }
  try {
    const transaction = new TransactionBuilder(new Account(distributor.publicKey(), source.sequence), {
      fee: BASE_FEE,
      // TESTNET ONLY by construction. Mainnet rewards require a separately
      // reviewed code decision — never an env flag.
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: destinationPublicKey,
          asset: campaignUsdcAsset(),
          amount: baseUnitsToUsdc(amountUnits),
        }),
      )
      .setTimeout(180)
      .build();
    transaction.sign(distributor);
    return {
      transactionHash: Buffer.from(transaction.hash()).toString("hex"),
      signedEnvelopeXdr: transaction.toEnvelope().toXDR("base64"),
      amountUnits,
    };
  } catch {
    throw new CampaignSettlementError("transaction_rejected", "The campaign payout transaction could not be prepared.");
  }
}

export type CampaignPayoutClaim = {
  amountUnits: bigint;
  destinationPublicKey: string;
  transactionHash: string | null;
  signedEnvelopeXdr: string | null;
};

/**
 * Settle a payout with envelope persistence + hash recovery. A prior hash
 * that already confirmed returns the confirmation (never a second payment);
 * a prior hash with no envelope requires operator recovery.
 */
export async function settleCampaignPayout(
  claim: CampaignPayoutClaim,
  persistPreparedPayment: (metadata: { transactionHash: string; signedEnvelopeXdr: string }) => Promise<void>,
  horizon: CampaignHorizon = defaultCampaignHorizon,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ConfirmedCampaignPayout> {
  if (claim.transactionHash) {
    let existing: CampaignHorizonTransaction | null;
    try {
      existing = await horizon.getTransaction(claim.transactionHash);
    } catch {
      throw new CampaignSettlementError("horizon_unavailable", "Stellar Testnet could not be reached while checking the payout.");
    }
    if (existing?.successful) {
      return { transactionHash: existing.hash, ledger: existing.ledger, confirmedAt: new Date() };
    }
    if (!claim.signedEnvelopeXdr) {
      throw new CampaignSettlementError(
        "recovery_required",
        "The prior payout transaction needs operator recovery before another submission is attempted.",
      );
    }
    // Re-verify the stored envelope matches the stored hash before resubmitting.
    try {
      const transaction = TransactionBuilder.fromXDR(claim.signedEnvelopeXdr, Networks.TESTNET);
      if (!(transaction instanceof Transaction)) throw new Error("bad envelope");
      const hash = Buffer.from(transaction.hash()).toString("hex");
      if (hash !== claim.transactionHash) throw new Error("hash mismatch");
      const result = await horizon.submitTransaction(claim.signedEnvelopeXdr);
      return { transactionHash: result.hash || hash, ledger: result.ledger, confirmedAt: new Date() };
    } catch (error) {
      if (error instanceof CampaignSettlementError) throw error;
      const recovered = await recoverByHash(horizon, claim.transactionHash);
      if (recovered) return recovered;
      throw new CampaignSettlementError("transaction_rejected", "Stellar rejected the payout transaction. Nothing was recorded as paid.");
    }
  }
  const prepared = await prepareCampaignPayout(claim.amountUnits, claim.destinationPublicKey, horizon, environment);
  await persistPreparedPayment({
    transactionHash: prepared.transactionHash,
    signedEnvelopeXdr: prepared.signedEnvelopeXdr,
  });
  try {
    const result = await horizon.submitTransaction(prepared.signedEnvelopeXdr);
    return { transactionHash: result.hash || prepared.transactionHash, ledger: result.ledger, confirmedAt: new Date() };
  } catch {
    const recovered = await recoverByHash(horizon, prepared.transactionHash);
    if (recovered) return recovered;
    throw new CampaignSettlementError(
      "transaction_rejected",
      "Stellar rejected the payout transaction. Nothing was recorded as paid.",
    );
  }
}

async function recoverByHash(
  horizon: CampaignHorizon,
  transactionHash: string,
): Promise<ConfirmedCampaignPayout | null> {
  try {
    const existing = await horizon.getTransaction(transactionHash);
    if (existing?.successful) {
      return { transactionHash: existing.hash, ledger: existing.ledger, confirmedAt: new Date() };
    }
    return null;
  } catch {
    return null;
  }
}

export { CAMPAIGN_REWARD_DECIMALS };
