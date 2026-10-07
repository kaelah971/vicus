import "server-only";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  NotFoundError,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { compareXlmAmounts, getRewardSettlementConfig, normalizeXlmAmount } from "@/lib/rewards/config";
import { RewardConfigurationError, RewardSettlementError } from "@/lib/rewards/errors";
import type { RewardNetwork } from "@/lib/rewards/types";

export type RewardSettlementClaim = {
  network: RewardNetwork;
  amount: string;
  destinationPublicKey: string;
  transactionHash: string | null;
  signedEnvelopeXdr: string | null;
};

export type ConfirmedRewardSettlement = {
  transactionHash: string;
  ledger: number | null;
  confirmedAt: Date;
};

export type PreparedPaymentMetadata = {
  transactionHash: string;
  signedEnvelopeXdr: string;
};

export type PreparedRewardPayment = {
  kind: "submit";
  server: Horizon.Server;
  transaction: Transaction;
  transactionHash: string;
  signedEnvelopeXdr: string;
};

const horizonServers = new Map<string, Horizon.Server>();

function getHorizonServer(url: string): Horizon.Server {
  const cached = horizonServers.get(url);
  if (cached) return cached;

  const server = new Horizon.Server(url);
  server.httpClient.defaults.timeout = 10_000;
  horizonServers.set(url, server);
  return server;
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFoundError) return true;
  if (typeof error !== "object" || error === null || !("response" in error)) return false;
  const response = error.response;
  return typeof response === "object" && response !== null && "status" in response && response.status === 404;
}

function isNetworkError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("response" in error)) return true;
  const response = error.response;
  if (typeof response !== "object" || response === null || !("status" in response)) return true;
  return typeof response.status !== "number" || response.status >= 500;
}

function mapConfigurationError(error: unknown): RewardSettlementError {
  if (error instanceof RewardConfigurationError) {
    if (error.code === "mainnet_disabled") {
      return new RewardSettlementError("mainnet_disabled", error.message);
    }
    if (error.code === "distributor_not_configured") {
      return new RewardSettlementError("distributor_not_configured", error.message);
    }
    if (error.code === "invalid-max-amount") {
      return new RewardSettlementError("invalid_reward_amount", error.message);
    }
  }

  return new RewardSettlementError("distributor_not_configured", "The reward distributor is not configured.");
}

async function findConfirmedRewardSettlement(
  server: Horizon.Server,
  transactionHash: string,
): Promise<ConfirmedRewardSettlement | null> {
  try {
    const transaction = await server.transactions().transaction(transactionHash).call();
    return {
      transactionHash: transaction.hash,
      ledger: transaction.ledger_attr ?? null,
      confirmedAt: new Date(),
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw new RewardSettlementError(
      isNetworkError(error) ? "horizon_unavailable" : "transaction_rejected",
      isNetworkError(error)
        ? "Stellar could not be reached while checking the reward transaction."
        : "Stellar rejected the reward transaction lookup.",
    );
  }
}

export async function prepareRewardPayment(claim: RewardSettlementClaim): Promise<PreparedRewardPayment | ConfirmedRewardSettlement> {
  let config;
  try {
    config = getRewardSettlementConfig();
  } catch (error) {
    throw mapConfigurationError(error);
  }

  if (config.network !== claim.network) {
    throw new RewardSettlementError("transaction_rejected", "The configured reward network changed before settlement.");
  }

  let amount: string;
  try {
    amount = normalizeXlmAmount(claim.amount);
  } catch {
    throw new RewardSettlementError("invalid_reward_amount", "The configured XLM reward amount is invalid.");
  }
  if (compareXlmAmounts(amount, "0") <= 0 || compareXlmAmounts(amount, config.maxXlm) > 0) {
    throw new RewardSettlementError("invalid_reward_amount", "The XLM reward exceeds the configured payout limit.");
  }

  if (!StrKey.isValidEd25519PublicKey(claim.destinationPublicKey)) {
    throw new RewardSettlementError("invalid_destination", "The verified Stellar destination is invalid.");
  }

  const server = getHorizonServer(config.horizonUrl);
  if (claim.transactionHash) {
    const confirmed = await findConfirmedRewardSettlement(server, claim.transactionHash);
    if (confirmed) return confirmed;
    if (!claim.signedEnvelopeXdr) {
      throw new RewardSettlementError(
        "recovery_required",
        "The prior reward transaction needs operator recovery before another submission is attempted.",
      );
    }
  }

  if (claim.signedEnvelopeXdr) {
    try {
      const transaction = TransactionBuilder.fromXDR(claim.signedEnvelopeXdr, config.networkPassphrase);
      if (!(transaction instanceof Transaction)) {
        throw new Error("The stored reward envelope is not a normal payment transaction.");
      }
      const transactionHash = Buffer.from(transaction.hash()).toString("hex");
      if (claim.transactionHash && claim.transactionHash !== transactionHash) {
        throw new Error("The stored reward transaction hash does not match its envelope.");
      }
      return {
        kind: "submit",
        server,
        transaction,
        transactionHash,
        signedEnvelopeXdr: claim.signedEnvelopeXdr,
      };
    } catch {
      throw new RewardSettlementError("recovery_required", "The stored reward transaction could not be recovered safely.");
    }
  }

  try {
    await server.loadAccount(claim.destinationPublicKey);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new RewardSettlementError(
        "destination_not_ready",
        `This Stellar address is not active on ${config.label} yet.`,
      );
    }
    throw new RewardSettlementError(
      isNetworkError(error) ? "horizon_unavailable" : "transaction_rejected",
      isNetworkError(error)
        ? "Stellar could not be reached while checking the reward destination."
        : "Stellar rejected the reward destination lookup.",
    );
  }

  let distributor: Keypair;
  try {
    distributor = Keypair.fromSecret(config.distributorSecret);
  } catch {
    throw new RewardSettlementError("distributor_not_configured", "The reward distributor secret is invalid.");
  }

  let sourceAccount: Horizon.AccountResponse;
  try {
    sourceAccount = await server.loadAccount(distributor.publicKey());
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new RewardSettlementError("source_not_ready", "The Vicus reward distributor is not active on the selected network.");
    }
    throw new RewardSettlementError(
      isNetworkError(error) ? "horizon_unavailable" : "transaction_rejected",
      isNetworkError(error)
        ? "Stellar could not be reached while checking the reward distributor."
        : "Stellar rejected the reward distributor lookup.",
    );
  }

  try {
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: claim.destinationPublicKey,
          asset: Asset.native(),
          amount,
        }),
      )
      .setTimeout(180)
      .build();
    transaction.sign(distributor);

    return {
      kind: "submit",
      server,
      transaction,
      transactionHash: Buffer.from(transaction.hash()).toString("hex"),
      signedEnvelopeXdr: transaction.toEnvelope().toXDR("base64"),
    };
  } catch {
    throw new RewardSettlementError("transaction_rejected", "The XLM reward transaction could not be prepared.");
  }
}

export async function submitPreparedRewardPayment(
  prepared: PreparedRewardPayment,
): Promise<ConfirmedRewardSettlement> {
  try {
    const result = await prepared.server.submitTransaction(prepared.transaction);
    return {
      transactionHash: result.hash || prepared.transactionHash,
      ledger: result.ledger ?? null,
      confirmedAt: new Date(),
    };
  } catch (error) {
    const confirmed = await findConfirmedRewardSettlement(prepared.server, prepared.transactionHash);
    if (confirmed) return confirmed;

    throw new RewardSettlementError(
      isNetworkError(error) ? "horizon_unavailable" : "transaction_rejected",
      isNetworkError(error)
        ? "Stellar could not be reached while submitting the reward."
        : "Stellar rejected the reward transaction. No reward was recorded as confirmed.",
    );
  }
}

export async function settleReward(
  claim: RewardSettlementClaim,
  persistPreparedPayment: (metadata: PreparedPaymentMetadata) => Promise<void>,
): Promise<ConfirmedRewardSettlement> {
  const prepared = await prepareRewardPayment(claim);
  if (!("kind" in prepared)) return prepared;

  await persistPreparedPayment({
    transactionHash: prepared.transactionHash,
    signedEnvelopeXdr: prepared.signedEnvelopeXdr,
  });
  return submitPreparedRewardPayment(prepared);
}
