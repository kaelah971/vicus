import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Operation, Transaction } from "@stellar/stellar-sdk";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { assetTransfers, circles, assets } from "@/db/schema";
export type SendErrorCode =
  | "unauthenticated"
  | "invalid-request"
  | "unsupported-asset"
  | "verification-unavailable"
  | "invalid-transition";

export class SendActionError extends Error {
  constructor(
    public readonly code: SendErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "SendActionError";
  }
}
import { compareDecimal7, normalizeDecimal7 } from "@/lib/missions/config";
import { getCircleLifecycle } from "@/lib/lifecycle/service";
import { resolveRecipient } from "@/lib/contacts/service";

export const SEND_NETWORK = "stellar_mainnet" as const;
export const SEND_NETWORK_LABEL = "Stellar Mainnet";
export const SEND_HORIZON_URL = "https://horizon.stellar.org";
export const SEND_EXPLORER_TX = "https://stellar.expert/explorer/public/tx/";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const TX_HASH_RE = /^[0-9a-f]{64}$/i;

/**
 * Server-owned transfer-support policy. An asset is Send-enabled ONLY when
 * every field below matches the database row exactly at runtime — the client
 * never supplies code or issuer. Lifecycle USE evidence is checked live too.
 * Assets without a verified Stellar issuer in Vicus stay disabled.
 */
export type SendableAsset = {
  slug: string;
  code: string;
  issuer: string;
  permissioned: boolean;
};

export const SENDABLE_ASSETS: SendableAsset[] = [
  {
    slug: "usdc-on-stellar",
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    permissioned: false,
  },
  {
    slug: "pyusd-on-stellar",
    code: "PYUSD",
    issuer: "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5",
    permissioned: false,
  },
  {
    slug: "benji-on-stellar",
    code: "BENJI",
    issuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    permissioned: true,
  },
  {
    slug: "wtgxx-on-stellar",
    code: "WTGXX",
    issuer: "GDMBNMFJ3TRFLASJ6UGETFME3PJPNKPU24C7KFDBEBPQFG2CI6UC3JG6",
    permissioned: true,
  },
];

export function getSendableAsset(slug: string): SendableAsset | null {
  return SENDABLE_ASSETS.find((entry) => entry.slug === slug) ?? null;
}

export type SendBalance = {
  assetCode: string | null;
  assetIssuer: string | null;
  balance: string;
  isAuthorized: boolean;
};

export type SendAccount = {
  sequence: string;
  balances: SendBalance[];
};

export type SendSubmission = {
  hash: string;
  successful: boolean;
  ledger: number | null;
};

export type SendTransaction = {
  hash: string;
  successful: boolean;
  sourceAccount: string;
  ledger: number | null;
};

export type SendHorizon = {
  getAccount(address: string): Promise<SendAccount | null>;
  submitTransaction(signedXdr: string): Promise<SendSubmission>;
  getTransaction(hash: string): Promise<SendTransaction | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function horizonJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Mainnet Horizon responded with status ${response.status}.`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export function createMainnetHorizon(): SendHorizon {
  return {
    async getAccount(address: string) {
      const data = await horizonJson(`${SEND_HORIZON_URL}/accounts/${address}`);
      if (!isRecord(data) || typeof data.sequence !== "string" || !Array.isArray(data.balances)) {
        return null;
      }
      return {
        sequence: data.sequence,
        balances: data.balances.filter(isRecord).map((entry) => ({
          assetCode: typeof entry.asset_code === "string" ? entry.asset_code : null,
          assetIssuer: typeof entry.asset_issuer === "string" ? entry.asset_issuer : null,
          balance: typeof entry.balance === "string" ? entry.balance : "0.0000000",
          isAuthorized: entry.is_authorized !== false,
        })),
      };
    },
    async submitTransaction(signedXdr: string) {
      const data = await horizonJson(`${SEND_HORIZON_URL}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ tx: signedXdr }).toString(),
      });
      if (!isRecord(data) || typeof data.hash !== "string") {
        throw new Error("Mainnet Horizon returned no transaction hash.");
      }
      return {
        hash: data.hash,
        successful: data.successful === true,
        ledger: typeof data.ledger === "number" ? data.ledger : null,
      };
    },
    async getTransaction(hash: string) {
      const data = await horizonJson(`${SEND_HORIZON_URL}/transactions/${hash}`);
      if (!isRecord(data) || typeof data.hash !== "string") return null;
      return {
        hash: data.hash,
        successful: data.successful === true,
        sourceAccount: typeof data.source_account === "string" ? data.source_account : "",
        ledger: typeof data.ledger === "number" ? data.ledger : null,
      };
    },
  };
}

export type SendTransferView = {
  id: string;
  network: string;
  networkLabel: string;
  circleSlug: string;
  assetCode: string;
  amount: string;
  destinationHandle: string | null;
  destinationAddress: string;
  status: string;
  transactionHash: string | null;
  ledger: number | null;
  failureReason: string | null;
  lastError: string | null;
  permissioned: boolean;
  createdAt: string;
  confirmedAt: string | null;
};

function mapTransferView(
  row: typeof assetTransfers.$inferSelect,
  circleSlug: string,
  destinationHandle: string | null,
  permissioned: boolean,
): SendTransferView {
  return {
    id: row.id,
    network: row.network,
    networkLabel: SEND_NETWORK_LABEL,
    circleSlug,
    assetCode: row.assetCode,
    amount: String(row.amount),
    destinationHandle,
    destinationAddress: row.destinationAddress,
    status: row.status,
    transactionHash: row.transactionHash,
    ledger: row.ledger,
    failureReason: row.failureReason,
    lastError: row.lastError,
    permissioned,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

function requireSender(senderId: string | null | undefined): string {
  if (!senderId || !UUID_RE.test(senderId)) {
    throw new SendActionError("unauthenticated", "Sign in to send assets.", 401);
  }
  return senderId;
}

function findTrustline(account: SendAccount, code: string, issuer: string): SendBalance | null {
  return (
    account.balances.find(
      (entry) => entry.assetCode === code && entry.assetIssuer === issuer,
    ) ?? null
  );
}

async function loadPolicyCircle(slug: string) {
  const policy = getSendableAsset(slug);
  if (!policy) {
    throw new SendActionError(
      "unsupported-asset",
      "Send is not enabled for that asset. Only verified transferable Stellar assets can be sent.",
      400,
    );
  }
  const database = getDatabase();
  const [row] = await database
    .select({ circle: circles, asset: assets })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(eq(circles.slug, slug))
    .limit(1);
  if (!row) {
    throw new SendActionError("invalid-request", "That asset could not be found.", 404);
  }
  // Server-owned enforcement: the stored asset MUST match the policy exactly.
  if (
    row.asset?.stellarAssetCode !== policy.code ||
    row.asset?.stellarIssuerAccount !== policy.issuer
  ) {
    throw new SendActionError(
      "unsupported-asset",
      "Send is not enabled for that asset. Only verified transferable Stellar assets can be sent.",
      400,
    );
  }
  // Lifecycle USE evidence must support transfer.
  const lifecycle = await getCircleLifecycle(slug);
  if (!lifecycle.some((step) => step.stage === "use")) {
    throw new SendActionError(
      "unsupported-asset",
      "Send is not enabled for that asset. Only verified transferable Stellar assets can be sent.",
      400,
    );
  }
  return { policy, circleId: row.circle.id };
}

export type SendPreparation = {
  transferId: string;
  unsignedXdr: string;
  network: typeof SEND_NETWORK;
  networkLabel: typeof SEND_NETWORK_LABEL;
  sourceWallet: string;
  assetCode: string;
  amount: string;
  senderBalance: string;
  destinationHandle: string | null;
  destinationAddress: string;
  permissioned: boolean;
};

export async function prepareSend(
  senderId: string | null | undefined,
  sourceWallet: unknown,
  input: { circleSlug?: unknown; handle?: unknown; contactId?: unknown; amount?: unknown },
  horizon: SendHorizon = createMainnetHorizon(),
): Promise<SendPreparation> {
  try {
    const sender = requireSender(senderId);
    const source =
      typeof sourceWallet === "string" && /^G[A-Z2-7]{55}$/.test(sourceWallet.trim())
        ? sourceWallet.trim()
        : null;
    if (!source) {
      throw new SendActionError("invalid-request", "Connect your Stellar wallet before sending.", 400);
    }
    if (typeof input.circleSlug !== "string") {
      throw new SendActionError("invalid-request", "Choose a supported asset.", 400);
    }
    const { policy, circleId } = await loadPolicyCircle(input.circleSlug);
    const amount = normalizeDecimal7(input.amount);
    if (!amount || compareDecimal7(amount, "0.0000000") <= 0) {
      throw new SendActionError("invalid-request", "Enter an amount greater than zero (max 7 decimals).", 400);
    }

    // Recipient resolution reuses the Contacts privacy model (Stellar only).
    const resolution = await resolveRecipient({
      senderUserId: sender,
      handle: input.handle,
      contactId: input.contactId,
      targetNetwork: "stellar",
    });
    if (!resolution.ok) {
      const reasons: Record<string, string> = {
        "not-found": "That recipient could not be found.",
        "no-endpoint": "That person has not enabled a Stellar receive endpoint.",
        "not-permitted": "That person's Stellar endpoint is not shared with you.",
        disabled: "That receive endpoint is disabled.",
      };
      throw new SendActionError("invalid-request", reasons[resolution.reason] ?? "That recipient cannot receive.", 400);
    }
    const destination = resolution.address;
    if (destination === source) {
      throw new SendActionError("invalid-request", "You cannot send to yourself.", 400);
    }

    // Recipient preflight against real Mainnet state.
    let recipientAccount: SendAccount | null;
    try {
      recipientAccount = await horizon.getAccount(destination);
    } catch {
      throw new SendActionError("verification-unavailable", "Stellar is unreachable. Try again shortly.", 503);
    }
    if (!recipientAccount) {
      throw new SendActionError("invalid-request", "That Stellar account does not exist yet.", 400);
    }
    const recipientTrustline = findTrustline(recipientAccount, policy.code, policy.issuer);
    if (!recipientTrustline) {
      throw new SendActionError(
        "invalid-request",
        `That person has not enabled ${policy.code} yet — no matching trustline.`,
        400,
      );
    }
    if (!recipientTrustline.isAuthorized) {
      throw new SendActionError(
        "invalid-request",
        `${policy.code} requires an authorized trustline, and theirs is not authorized.`,
        400,
      );
    }

    // Sender preflight: exact decimal-safe balance check, no floats.
    let senderAccount: SendAccount | null;
    try {
      senderAccount = await horizon.getAccount(source);
    } catch {
      throw new SendActionError("verification-unavailable", "Stellar is unreachable. Try again shortly.", 503);
    }
    if (!senderAccount) {
      throw new SendActionError("invalid-request", "Your Stellar account could not be found.", 400);
    }
    const senderTrustline = findTrustline(senderAccount, policy.code, policy.issuer);
    if (!senderTrustline) {
      throw new SendActionError("invalid-request", `You hold no ${policy.code} on Stellar.`, 400);
    }
    if (!senderTrustline.isAuthorized) {
      throw new SendActionError("invalid-request", `Your ${policy.code} trustline is not authorized to send.`, 400);
    }
    const senderBalance = normalizeDecimal7(senderTrustline.balance) ?? "0.0000000";
    if (compareDecimal7(senderBalance, amount) < 0) {
      throw new SendActionError(
        "invalid-request",
        `Insufficient balance: you hold ${senderBalance} ${policy.code}.`,
        400,
      );
    }

    const database = getDatabase();
    const [row] = await database
      .insert(assetTransfers)
      .values({
        senderUserId: sender,
        recipientUserId: resolution.recipientUserId,
        contactId: resolution.contactId,
        network: SEND_NETWORK,
        circleId,
        assetCode: policy.code,
        assetIssuer: policy.issuer,
        amount,
        destinationAddress: destination,
        status: "draft",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("prepare send");

    // Server-built unsigned payment: exactly one native payment operation.
    const sdk = await import("@stellar/stellar-sdk");
    const payment = new sdk.TransactionBuilder(new sdk.Account(source, senderAccount.sequence), {
      fee: sdk.BASE_FEE,
      networkPassphrase: sdk.Networks.PUBLIC,
    })
      .addOperation(
        sdk.Operation.payment({
          destination,
          asset: new sdk.Asset(policy.code, policy.issuer),
          amount,
        }),
      )
      .setTimeout(120)
      .build();

    await database
      .update(assetTransfers)
      .set({ status: "prepared", updatedAt: new Date() })
      .where(and(eq(assetTransfers.id, row.id), eq(assetTransfers.senderUserId, sender)));

    let destinationHandle: string | null = null;
    if (typeof input.handle === "string" && input.handle.trim()) {
      destinationHandle = input.handle.trim().replace(/^@/, "");
    }
    return {
      transferId: row.id,
      unsignedXdr: payment.toXDR(),
      network: SEND_NETWORK,
      networkLabel: SEND_NETWORK_LABEL,
      sourceWallet: source,
      assetCode: policy.code,
      amount,
      senderBalance,
      destinationHandle,
      destinationAddress: destination,
      permissioned: policy.permissioned,
    };
  } catch (error) {
    if (error instanceof SendActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("prepare send");
  }
}

async function requireOwnedTransfer(transferId: string, sender: string) {
  if (!UUID_RE.test(transferId)) {
    throw new SendActionError("invalid-request", "That transfer could not be found.", 404);
  }
  const database = getDatabase();
  const [row] = await database
    .select({ transfer: assetTransfers, slug: circles.slug })
    .from(assetTransfers)
    .innerJoin(circles, eq(assetTransfers.circleId, circles.id))
    .where(eq(assetTransfers.id, transferId))
    .limit(1);
  if (!row || row.transfer.senderUserId !== sender) {
    throw new SendActionError("invalid-request", "That transfer could not be found.", 404);
  }
  return row;
}

/**
 * Submit the Freighter-signed payment. The envelope is fully verified before
 * broadcast: Mainnet passphrase, source wallet, exactly one payment op with
 * the exact destination/asset/amount, no memo, no extras. Hash recovery (not
 * rebroadcast) handles uncertain Horizon responses. Confirmed is immutable.
 */
export async function submitSend(
  transferId: string,
  senderId: string | null | undefined,
  sourceWallet: unknown,
  signedXdr: unknown,
  horizon: SendHorizon = createMainnetHorizon(),
): Promise<SendTransferView> {
  try {
    const sender = requireSender(senderId);
    const source =
      typeof sourceWallet === "string" && /^G[A-Z2-7]{55}$/.test(sourceWallet.trim())
        ? sourceWallet.trim()
        : null;
    if (!source) {
      throw new SendActionError("invalid-request", "Connect your Stellar wallet before sending.", 400);
    }
    const { transfer, slug } = await requireOwnedTransfer(transferId, sender);
    if (transfer.status === "confirmed") {
      const policy = getSendableAsset(slug);
      return mapTransferView(transfer, slug, null, policy?.permissioned ?? false);
    }
    if (transfer.status !== "prepared" && transfer.status !== "draft") {
      throw new SendActionError("invalid-transition", "That transfer cannot be submitted again.", 409);
    }
    if (typeof signedXdr !== "string" || !signedXdr.trim()) {
      throw new SendActionError("invalid-request", "Provide the signed Stellar transaction.", 400);
    }

    const sdk = await import("@stellar/stellar-sdk");
    let transaction: Transaction;
    try {
      const parsed = sdk.TransactionBuilder.fromXDR(signedXdr.trim(), sdk.Networks.PUBLIC);
      if (parsed instanceof sdk.FeeBumpTransaction) {
        throw new SendActionError("invalid-request", "Fee-bump envelopes are not accepted.", 400);
      }
      transaction = parsed as Transaction;
    } catch (error) {
      if (error instanceof SendActionError) throw error;
      throw new SendActionError("invalid-request", "That signed transaction could not be read.", 400);
    }
    if (transaction.source !== source) {
      throw new SendActionError("invalid-request", "The envelope source must be your connected wallet.", 403);
    }
    if (transaction.memo.type !== sdk.Memo.none().type) {
      throw new SendActionError("invalid-request", "Envelopes with memos are not accepted.", 400);
    }
    if (transaction.operations.length !== 1) {
      throw new SendActionError("invalid-request", "The envelope must contain exactly the intended payment.", 400);
    }
    const operation = transaction.operations[0] as Operation.Payment;
    if (operation.type !== "payment") {
      throw new SendActionError("invalid-request", "The envelope must contain exactly the intended payment.", 400);
    }
    const expectedAmount = normalizeDecimal7(transfer.amount);
    const actualAmount = normalizeDecimal7(operation.amount);
    if (
      operation.destination !== transfer.destinationAddress ||
      !(operation.asset instanceof sdk.Asset) ||
      operation.asset.code !== transfer.assetCode ||
      operation.asset.issuer !== transfer.assetIssuer ||
      !expectedAmount ||
      !actualAmount ||
      compareDecimal7(expectedAmount, actualAmount) !== 0
    ) {
      throw new SendActionError("invalid-request", "The signed payment does not match the prepared transfer.", 400);
    }
    if (transaction.signatures.length < 1) {
      throw new SendActionError("invalid-request", "The transaction is not signed.", 400);
    }
    const hash = Buffer.from(transaction.hash()).toString("hex");
    if (!TX_HASH_RE.test(hash)) {
      throw new SendActionError("invalid-request", "That signed transaction could not be read.", 400);
    }

    const database = getDatabase();
    // Global replay guard: a confirmed hash is never rebroadcast.
    const [replay] = await database
      .select({ transfer: assetTransfers, slug: circles.slug })
      .from(assetTransfers)
      .innerJoin(circles, eq(assetTransfers.circleId, circles.id))
      .where(eq(assetTransfers.transactionHash, hash))
      .limit(1);
    if (replay && replay.transfer.status === "confirmed") {
      const policy = getSendableAsset(replay.slug);
      return mapTransferView(replay.transfer, replay.slug, null, policy?.permissioned ?? false);
    }

    await database
      .update(assetTransfers)
      .set({ transactionHash: hash, status: "submitted", failureReason: null, lastError: null, updatedAt: new Date() })
      .where(
        and(
          eq(assetTransfers.id, transfer.id),
          eq(assetTransfers.senderUserId, sender),
          isNull(assetTransfers.transactionHash),
        ),
      );

    let submission: SendSubmission | null = null;
    try {
      submission = await horizon.submitTransaction(signedXdr.trim());
    } catch {
      // Uncertain outcome: recover by hash instead of rebroadcasting blindly.
    }
    const lookupHash = submission?.hash ?? hash;
    let confirmed: SendTransaction | null = null;
    try {
      confirmed = await horizon.getTransaction(lookupHash);
    } catch {
      confirmed = null;
    }
    const policy = getSendableAsset(slug);
    if (confirmed?.successful && confirmed.sourceAccount === source) {
      const [done] = await database
        .update(assetTransfers)
        .set({
          status: "confirmed",
          transactionHash: lookupHash,
          ledger: confirmed.ledger,
          failureReason: null,
          lastError: null,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(assetTransfers.id, transfer.id), eq(assetTransfers.senderUserId, sender)))
        .returning();
      if (!done) throw toDatabaseUnavailableError("confirm send");
      return mapTransferView(done, slug, null, policy?.permissioned ?? false);
    }
    if (submission && !submission.successful) {
      const [failed] = await database
        .update(assetTransfers)
        .set({
          status: "failed",
          transactionHash: lookupHash,
          failureReason: "rejected",
          lastError: "Stellar rejected the transaction. Nothing moved.",
          updatedAt: new Date(),
        })
        .where(and(eq(assetTransfers.id, transfer.id), eq(assetTransfers.senderUserId, sender)))
        .returning();
      if (!failed) throw toDatabaseUnavailableError("submit send");
      return mapTransferView(failed, slug, null, policy?.permissioned ?? false);
    }
    const [retryable] = await database
      .update(assetTransfers)
      .set({
        status: "failed",
        transactionHash: lookupHash,
        failureReason: "uncertain",
        lastError: "Confirmation is uncertain. Check the hash before retrying — do not resubmit blindly.",
        updatedAt: new Date(),
      })
      .where(and(eq(assetTransfers.id, transfer.id), eq(assetTransfers.senderUserId, sender)))
      .returning();
    if (!retryable) throw toDatabaseUnavailableError("submit send");
    return mapTransferView(retryable, slug, null, policy?.permissioned ?? false);
  } catch (error) {
    if (error instanceof SendActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("submit send");
  }
}

export async function getSendTransfer(
  transferId: string,
  senderId: string | null | undefined,
): Promise<SendTransferView> {
  try {
    const sender = requireSender(senderId);
    const { transfer, slug } = await requireOwnedTransfer(transferId, sender);
    const policy = getSendableAsset(slug);
    return mapTransferView(transfer, slug, null, policy?.permissioned ?? false);
  } catch (error) {
    if (error instanceof SendActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("read transfer");
  }
}

/** Sender-private history. Recipients get no automatic feed in V1. */
export async function listMySendTransfers(
  senderId: string | null | undefined,
): Promise<SendTransferView[]> {
  try {
    const sender = requireSender(senderId);
    const database = getDatabase();
    const rows = await database
      .select({ transfer: assetTransfers, slug: circles.slug })
      .from(assetTransfers)
      .innerJoin(circles, eq(assetTransfers.circleId, circles.id))
      .where(eq(assetTransfers.senderUserId, sender))
      .orderBy(desc(assetTransfers.createdAt))
      .limit(25);
    return rows.map((row) => {
      const policy = getSendableAsset(row.slug);
      return mapTransferView(row.transfer, row.slug, null, policy?.permissioned ?? false);
    });
  } catch (error) {
    if (error instanceof SendActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("list transfers");
  }
}
