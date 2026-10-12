import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { crosschainTransfers, userReceiveEndpoints, users } from "@/db/schema";
import {
  ACCESS_ASSET,
  ACCESS_DESTINATIONS,
  ACCESS_ENVIRONMENT,
  ACCESS_SOURCE_NETWORK,
  getAccessDestination,
  isAccessDestinationKey,
  type AccessDestinationKey,
} from "@/lib/access/config";
import {
  ACCESS_STATUSES,
  AccessActionError,
  createAccessTransfer,
  getAccessTransfer,
  listMyAccessTransfers,
  normalizeAccessAmount,
  refreshAccessTransfer,
  type AccessTransferView,
  type AccessTransport,
} from "@/lib/access/service";
import { resolveRecipient } from "@/lib/contacts/service";

/**
 * Cross-chain Send to @handle V1 — thin social wrapper over Vicus Access.
 *
 * Stellar USDC (testnet) → CCTP → recipient's Base/Ethereum USDC endpoint.
 * No new bridge, no new transfer table, no new state machine: recipient
 * resolution (Contacts privacy) + the existing Access transfer lifecycle.
 * The destination address is always server-resolved from the recipient's
 * receive endpoint — the client cannot supply or substitute it.
 */

export type CrosschainSendErrorCode =
  | "unauthenticated"
  | "invalid-request"
  | "unsupported-asset"
  | "unsupported-destination"
  | "destination-coming-soon"
  | "recipient-not-found"
  | "recipient-no-endpoint"
  | "recipient-not-permitted"
  | "recipient-disabled"
  | "invalid-amount"
  | "not-found";

export class CrosschainSendError extends Error {
  constructor(
    public readonly code: CrosschainSendErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type CrosschainSendNetwork = "base" | "ethereum";

export function isCrosschainSendNetwork(value: unknown): value is CrosschainSendNetwork {
  return value === "base" || value === "ethereum";
}

export type CrosschainSendView = {
  transfer: AccessTransferView;
  /** Public @handle of the recipient — the human, not the address. */
  recipientHandle: string | null;
  recipientNetwork: CrosschainSendNetwork;
  environment: typeof ACCESS_ENVIRONMENT;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;

function preserveExpectedError(error: unknown): boolean {
  return error instanceof CrosschainSendError || isDatabaseUnavailableError(error);
}

/** Access errors crossing the wrapper boundary become send errors — never 503s. */
function translateAccessError(error: AccessActionError): CrosschainSendError {
  if (error.code === "not-found") {
    return new CrosschainSendError("not-found", "That send could not be found.", 404);
  }
  if (error.code === "unauthenticated") {
    return new CrosschainSendError("unauthenticated", "Sign in to send.", 401);
  }
  if (error.code === "invalid-amount") {
    return new CrosschainSendError("invalid-amount", error.message, 400);
  }
  if (error.code === "unsupported-destination" || error.code === "destination-coming-soon") {
    return new CrosschainSendError(error.code, error.message, error.httpStatus);
  }
  return new CrosschainSendError("invalid-request", error.message, error.httpStatus);
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new CrosschainSendError("unauthenticated", "Sign in to send.", 401);
  }
  return userId;
}

async function handleForUser(userId: string): Promise<string | null> {
  const database = getDatabase();
  const [row] = await database.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.handle ?? null;
}

/** Reverse-lookup the recipient handle from a stored endpoint (no migration). */
async function handleForEndpoint(network: string, address: string): Promise<string | null> {
  const database = getDatabase();
  const [endpoint] = await database
    .select({ userId: userReceiveEndpoints.userId })
    .from(userReceiveEndpoints)
    .where(and(eq(userReceiveEndpoints.network, network), eq(userReceiveEndpoints.address, address.toLowerCase())))
    .limit(1);
  if (!endpoint) {
    const [exact] = await database
      .select({ userId: userReceiveEndpoints.userId })
      .from(userReceiveEndpoints)
      .where(and(eq(userReceiveEndpoints.network, network), eq(userReceiveEndpoints.address, address)))
      .limit(1);
    if (!exact) return null;
    return handleForUser(exact.userId);
  }
  return handleForUser(endpoint.userId);
}

function toSendView(transfer: AccessTransferView, recipientHandle: string | null): CrosschainSendView {
  return {
    transfer,
    recipientHandle,
    recipientNetwork: transfer.destinationNetwork as CrosschainSendNetwork,
    environment: ACCESS_ENVIRONMENT,
  };
}

async function resolveDestination(
  owner: string,
  input: { handle?: unknown; contactId?: unknown; destinationNetwork?: unknown },
): Promise<{ network: CrosschainSendNetwork; address: string; recipientUserId: string }> {
  const rawNetwork = typeof input.destinationNetwork === "string" ? input.destinationNetwork.trim().toLowerCase() : "";
  if (isAccessDestinationKey(rawNetwork)) {
    const destination = getAccessDestination(rawNetwork as AccessDestinationKey);
    if (!destination.executable) {
      throw new CrosschainSendError(
        "destination-coming-soon",
        destination.unavailableReason ?? "That destination is coming soon.",
        409,
      );
    }
  }
  if (!isCrosschainSendNetwork(rawNetwork)) {
    throw new CrosschainSendError(
      "unsupported-destination",
      "Cross-chain Send supports Base and Ethereum receive endpoints.",
      400,
    );
  }
  const resolution = await resolveRecipient({
    senderUserId: owner,
    handle: input.handle,
    contactId: input.contactId,
    targetNetwork: rawNetwork,
  });
  if (!resolution.ok) {
    if (resolution.reason === "not-found") {
      throw new CrosschainSendError("recipient-not-found", "That recipient could not be found.", 404);
    }
    if (resolution.reason === "no-endpoint") {
      throw new CrosschainSendError(
        "recipient-no-endpoint",
        "That person has not enabled a receive endpoint on that network.",
        400,
      );
    }
    if (resolution.reason === "not-permitted") {
      throw new CrosschainSendError(
        "recipient-not-permitted",
        "That person's endpoint is not shared with you. Save them as a contact and ask them to share it.",
        403,
      );
    }
    throw new CrosschainSendError("recipient-disabled", "That receive endpoint is disabled.", 400);
  }
  return { network: rawNetwork, address: resolution.address, recipientUserId: resolution.recipientUserId };
}

/**
 * Create (or idempotently reuse) the Access transfer for a social send.
 * USDC-only, Stellar-testnet-source-only, Base/Ethereum-only — all pinned
 * server-side. The input carries NO destination address: substitution is
 * impossible by construction.
 */
export async function createCrosschainSend(
  userId: string | null | undefined,
  sourceWallet: unknown,
  input: { handle?: unknown; contactId?: unknown; destinationNetwork?: unknown; amount?: unknown },
): Promise<CrosschainSendView> {
  try {
    const owner = requireUserId(userId);
    const wallet = typeof sourceWallet === "string" && STELLAR_KEY_RE.test(sourceWallet.trim()) ? sourceWallet.trim() : null;
    if (!wallet) {
      throw new CrosschainSendError("invalid-request", "Connect your Stellar wallet before sending.", 400);
    }
    const resolved = await resolveDestination(owner, input);
    const normalizedAmount = normalizeAccessAmount(input.amount);
    if (!normalizedAmount) {
      throw new CrosschainSendError("invalid-amount", "Enter a USDC amount greater than zero (max 6 decimals).", 400);
    }
    const database = getDatabase();
    // Duplicate safety: the same send intent reuses the live transfer instead
    // of burning twice. Only failed intents may start over.
    const reusable = ACCESS_STATUSES.filter((status) => status !== "failed");
    const [existing] = await database
      .select()
      .from(crosschainTransfers)
      .where(
        and(
          eq(crosschainTransfers.userId, owner),
          eq(crosschainTransfers.destinationNetwork, resolved.network),
          eq(crosschainTransfers.destinationAddress, resolved.address),
          eq(crosschainTransfers.amount, normalizedAmount),
          inArray(crosschainTransfers.status, reusable),
        ),
      )
      .orderBy(desc(crosschainTransfers.createdAt))
      .limit(1);
    if (existing) {
      const view = await getAccessTransfer(existing.id, owner);
      return toSendView(view, await handleForUser(resolved.recipientUserId));
    }
    const transfer = await createAccessTransfer(owner, {
      asset: ACCESS_ASSET,
      destinationNetwork: resolved.network,
      destinationAddress: resolved.address,
      amount: input.amount,
      sourceWallet: wallet,
    });
    return toSendView(transfer, await handleForUser(resolved.recipientUserId));
  } catch (error) {
    if (error instanceof CrosschainSendError) throw error;
    if (error instanceof AccessActionError) throw translateAccessError(error);
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create cross-chain send");
  }
}

export async function getCrosschainSend(
  transferId: string,
  userId: string | null | undefined,
): Promise<CrosschainSendView> {
  try {
    const owner = requireUserId(userId);
    const transfer = await getAccessTransfer(transferId, owner);
    if (transfer.destinationNetwork !== "base" && transfer.destinationNetwork !== "ethereum") {
      throw new CrosschainSendError("not-found", "That send could not be found.", 404);
    }
    return toSendView(transfer, await handleForEndpoint(transfer.destinationNetwork, transfer.destinationAddress));
  } catch (error) {
    if (error instanceof AccessActionError) throw translateAccessError(error);
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read cross-chain send");
  }
}

export async function listMyCrosschainSends(userId: string | null | undefined): Promise<CrosschainSendView[]> {
  try {
    const owner = requireUserId(userId);
    const transfers = await listMyAccessTransfers(owner);
    const sends = transfers.filter(
      (transfer) => transfer.destinationNetwork === "base" || transfer.destinationNetwork === "ethereum",
    );
    return Promise.all(
      sends.map(async (transfer) =>
        toSendView(transfer, await handleForEndpoint(transfer.destinationNetwork, transfer.destinationAddress)),
      ),
    );
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list cross-chain sends");
  }
}

/** Reload-safe resume: refreshes the linked Access transfer, never reburns. */
export async function refreshCrosschainSend(
  transferId: string,
  userId: string | null | undefined,
  transport?: AccessTransport,
): Promise<CrosschainSendView> {
  try {
    const owner = requireUserId(userId);
    const transfer = await refreshAccessTransfer(transferId, owner, transport);
    if (transfer.destinationNetwork !== "base" && transfer.destinationNetwork !== "ethereum") {
      throw new CrosschainSendError("not-found", "That send could not be found.", 404);
    }
    return toSendView(transfer, await handleForEndpoint(transfer.destinationNetwork, transfer.destinationAddress));
  } catch (error) {
    if (error instanceof AccessActionError) throw translateAccessError(error);
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("refresh cross-chain send");
  }
}

export { ACCESS_ASSET, ACCESS_DESTINATIONS, ACCESS_ENVIRONMENT, ACCESS_SOURCE_NETWORK };
