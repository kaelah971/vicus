import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { crosschainTransfers } from "@/db/schema";
import {
  ACCESS_ASSET,
  ACCESS_FINALITY_THRESHOLD,
  ACCESS_FORWARD_HOOK_V0,
  ACCESS_SOURCE_NETWORK,
  ACCESS_STELLAR_DOMAIN,
  ACCESS_TESTNET,
  getAccessDestination,
  isAccessDestinationKey,
  type AccessDestinationKey,
} from "@/lib/access/config";

export type AccessErrorCode =
  | "unauthenticated"
  | "invalid-request"
  | "unsupported-asset"
  | "unsupported-destination"
  | "destination-coming-soon"
  | "invalid-destination"
  | "invalid-amount"
  | "not-found"
  | "invalid-transition"
  | "wrong-network"
  | "wrong-source-wallet"
  | "verification-unavailable";

export class AccessActionError extends Error {
  constructor(
    public readonly code: AccessErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type AccessStatus =
  | "draft"
  | "approving"
  | "burn_pending"
  | "burned"
  | "attesting"
  | "forwarding"
  | "completed"
  | "failed";

export const ACCESS_STATUSES: readonly AccessStatus[] = [
  "draft",
  "approving",
  "burn_pending",
  "burned",
  "attesting",
  "forwarding",
  "completed",
  "failed",
];

export type AccessTransferView = {
  id: string;
  sourceNetwork: string;
  sourceWallet: string;
  destinationNetwork: AccessDestinationKey;
  destinationLabel: string;
  destinationDomain: number;
  asset: string;
  /** 6-decimal USDC units, exact decimal string (e.g. "1.500000"). */
  amount: string;
  /** 6-decimal subunits as an integer string. */
  amountSubunits6: string;
  destinationAddress: string;
  status: AccessStatus;
  environment: "testnet";
  forwarding: boolean;
  sourceTxHash: string | null;
  cctpMessage: string | null;
  destinationTxHash: string | null;
  /** 6-decimal USDC units or null when the fee API has not answered yet. */
  fee: string | null;
  expectedDestinationAmount: string;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

/**
 * Redacted completion proof for future onchain-action mission references.
 * Carries verified completion data only — never the destination address or
 * transaction hashes.
 */
export type AccessCompletionProof = {
  id: string;
  destinationNetwork: AccessDestinationKey;
  asset: string;
  amount: string;
  status: AccessStatus;
  completedAt: string | null;
};

/** Injectable Circle/Stellar transports. Defaults hit the live sandbox API. */
export type AccessAttestationResult = {
  state: "pending" | "complete" | "not_found";
  message: string | null;
  attestation: string | null;
  destinationTxHash: string | null;
};

export type AccessFeeResult = {
  /** Fee in 6-decimal USDC subunits, integer string. */
  feeSubunits6: string;
} | null;

export type AccessTransport = {
  fetchAttestation?: (sourceDomain: number, txHash: string) => Promise<AccessAttestationResult>;
  fetchFee?: (sourceDomain: number, destDomain: number) => Promise<AccessFeeResult>;
};

function preserveExpectedError(error: unknown): boolean {
  return error instanceof AccessActionError || isDatabaseUnavailableError(error);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;
const TX_HASH_RE = /^[0-9a-f]{64}$/i;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(value: string): Uint8Array | null {
  if (!value || /[^1-9A-HJ-NP-Za-km-z]/.test(value)) return null;
  const bytes: number[] = [0];
  for (const char of value) {
    let carry = BASE58_ALPHABET.indexOf(char);
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (const char of value) {
    if (char !== "1") break;
    leadingZeros += 1;
  }
  const stripped = bytes.reverse();
  while (stripped.length > 0 && stripped[0] === 0) stripped.shift();
  return new Uint8Array([...new Array(leadingZeros).fill(0), ...stripped]);
}

function isSolanaPublicKey(value: string): boolean {
  const decoded = decodeBase58(value);
  return decoded !== null && decoded.length === 32;
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new AccessActionError("unauthenticated", "Sign in to use Access.", 401);
  }
  return userId;
}

function requireRunId(runId: string): string {
  if (!UUID_RE.test(runId)) {
    throw new AccessActionError("not-found", "That transfer could not be found.", 404);
  }
  return runId;
}

/**
 * Accept max 6 fractional decimal places (CCTP messages use 6-decimal
 * subunits; Stellar USDC shows 7). Integer/decimal-safe: no floats anywhere.
 */
export function normalizeAccessAmount(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(trimmed);
  if (!match) return null;
  const whole = (match[1] ?? "0").replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").padEnd(6, "0");
  if (/^0+$/.test(whole) && /^0+$/.test(fraction)) return null;
  return `${whole}.${fraction}`;
}

/** Exact 6-decimal subunits as a BigInt. Input must be normalized first. */
export function accessAmountToSubunits6(normalized: string): bigint {
  const [whole = "0", fraction = "000000"] = normalized.split(".");
  return BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0").slice(0, 6));
}

/** Exact decimal-safe comparison of normalized 6dp strings. */
export function compareAccessAmount(left: string, right: string): number {
  const li = accessAmountToSubunits6(left);
  const ri = accessAmountToSubunits6(right);
  return li < ri ? -1 : li > ri ? 1 : 0;
}

export function formatSubunits6(subunits: bigint): string {
  const negative = subunits < BigInt(0);
  const absolute = negative ? -subunits : subunits;
  const whole = absolute / BigInt(1000000);
  const fraction = (absolute % BigInt(1000000)).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/** Normalize an EVM destination to 0x-checksummed-lowercase form. */
export function normalizeEvmAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return EVM_ADDRESS_RE.test(trimmed) ? `0x${trimmed.slice(2).toLowerCase()}` : null;
}

function validateDestination(network: AccessDestinationKey, address: unknown): string {
  if (network === "solana") {
    if (typeof address === "string" && isSolanaPublicKey(address.trim())) return address.trim();
    throw new AccessActionError(
      "invalid-destination",
      "That Solana address is not valid. Use the recipient wallet address.",
      400,
    );
  }
  const normalized = normalizeEvmAddress(address);
  if (!normalized) {
    throw new AccessActionError(
      "invalid-destination",
      "That destination address is not valid. Use a 0x address.",
      400,
    );
  }
  return normalized;
}

/** EVM 20-byte address left-padded to bytes32, as Circle requires. */
export function evmAddressToBytes32(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

/** Solana wallet pubkey to raw 32 bytes hex (mint-recipient encoding). */
export function solanaAddressToBytes32(address: string): string {
  const decoded = decodeBase58(address);
  if (!decoded || decoded.length !== 32) {
    throw new AccessActionError("invalid-destination", "That Solana address is not valid.", 400);
  }
  return `0x${Buffer.from(decoded).toString("hex")}`;
}

export function mintRecipientBytes32(network: AccessDestinationKey, address: string): string {
  return network === "solana" ? solanaAddressToBytes32(address) : evmAddressToBytes32(address);
}

function mapTransferView(
  row: typeof crosschainTransfers.$inferSelect,
): AccessTransferView {
  const destination = getAccessDestination(row.destinationNetwork as AccessDestinationKey);
  const amount = normalizeAccessAmount(row.amount) ?? "0.000000";
  const fee = row.feeSubunits6 ? formatSubunits6(BigInt(row.feeSubunits6)) : null;
  let expected = amount;
  if (row.feeSubunits6) {
    const net = accessAmountToSubunits6(amount) - BigInt(row.feeSubunits6);
    expected = formatSubunits6(net < BigInt(0) ? BigInt(0) : net);
  }
  return {
    id: row.id,
    sourceNetwork: row.sourceNetwork,
    sourceWallet: row.sourceWallet,
    destinationNetwork: row.destinationNetwork as AccessDestinationKey,
    destinationLabel: destination.label,
    destinationDomain: destination.domain,
    asset: row.asset,
    amount,
    amountSubunits6: accessAmountToSubunits6(amount).toString(),
    destinationAddress: row.destinationAddress,
    status: row.status as AccessStatus,
    environment: "testnet",
    forwarding: row.forwarding,
    sourceTxHash: row.sourceTxHash,
    cctpMessage: row.cctpMessage,
    destinationTxHash: row.destinationTxHash,
    fee,
    expectedDestinationAmount: expected,
    retryable: row.retryable,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function toAccessCompletionProof(view: AccessTransferView): AccessCompletionProof {
  return {
    id: view.id,
    destinationNetwork: view.destinationNetwork,
    asset: view.asset,
    amount: view.amount,
    status: view.status,
    completedAt: view.completedAt,
  };
}

/**
 * Loser path for the burn gate: the winner persists its hash; losers reuse the
 * persisted transfer. Returns null when nobody finishes, so the caller still
 * fails safe instead of burning twice.
 */
async function waitForBurnedTransfer(
  transferId: string,
  userId: string,
): Promise<typeof crosschainTransfers.$inferSelect | null> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const current = await requireOwnedTransfer(transferId, userId).catch(() => null);
    if (!current) return null;
    if (current.sourceTxHash) return current;
    if (current.status !== "burn_pending" && current.status !== "approving") return null;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

async function requireOwnedTransfer(transferId: string, userId: string) {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(crosschainTransfers)
    .where(eq(crosschainTransfers.id, transferId))
    .limit(1);
  if (!row || row.userId !== userId) {
    throw new AccessActionError("not-found", "That transfer could not be found.", 404);
  }
  return row;
}

export async function createAccessTransfer(
  userId: string | null | undefined,
  input: {
    asset?: unknown;
    destinationNetwork?: unknown;
    destinationAddress?: unknown;
    amount?: unknown;
    sourceWallet?: unknown;
  },
): Promise<AccessTransferView> {
  try {
    const owner = requireUserId(userId);
    const asset = typeof input.asset === "string" ? input.asset.trim().toUpperCase() : ACCESS_ASSET;
    if (asset !== ACCESS_ASSET) {
      throw new AccessActionError(
        "unsupported-asset",
        "Access moves native USDC only. Other assets are not CCTP-compatible.",
        400,
      );
    }
    if (!isAccessDestinationKey(input.destinationNetwork)) {
      throw new AccessActionError(
        "unsupported-destination",
        "That destination is not supported. Choose Base, Ethereum, or Solana.",
        400,
      );
    }
    const destination = getAccessDestination(input.destinationNetwork);
    // Capability gating follows config: Solana validates but never executes.
    if (!destination.executable) {
      throw new AccessActionError(
        "destination-coming-soon",
        destination.unavailableReason ?? "That destination is coming soon.",
        409,
      );
    }
    const destinationAddress = validateDestination(destination.key, input.destinationAddress);
    const amount = normalizeAccessAmount(input.amount);
    if (!amount) {
      const raw = typeof input.amount === "string" ? input.amount.trim() : "";
      if (/^\d+\.\d{7,}$/.test(raw)) {
        throw new AccessActionError(
          "invalid-amount",
          "Use up to 6 decimal places. CCTP settles in 6-decimal units, so extra digits would be left behind on Stellar.",
          400,
        );
      }
      throw new AccessActionError("invalid-amount", "Enter an amount greater than zero.", 400);
    }
    const sourceWallet =
      typeof input.sourceWallet === "string" && STELLAR_KEY_RE.test(input.sourceWallet.trim())
        ? input.sourceWallet.trim()
        : null;
    if (!sourceWallet) {
      throw new AccessActionError(
        "invalid-request",
        "Provide the Stellar wallet that will sign the burn.",
        400,
      );
    }

    const database = getDatabase();
    const [row] = await database
      .insert(crosschainTransfers)
      .values({
        userId: owner,
        sourceNetwork: ACCESS_SOURCE_NETWORK,
        sourceWallet,
        destinationNetwork: destination.key,
        asset: ACCESS_ASSET,
        amount,
        destinationAddress,
        status: "draft",
        forwarding: destination.forwardingSupported,
        retryable: false,
        lastError: null,
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("create access transfer");
    return mapTransferView(row);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create access transfer");
  }
}

export async function getAccessTransfer(
  transferId: string,
  userId: string | null | undefined,
): Promise<AccessTransferView> {
  try {
    const owner = requireUserId(userId);
    const row = await requireOwnedTransfer(requireRunId(transferId), owner);
    return mapTransferView(row);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read access transfer");
  }
}

export async function listMyAccessTransfers(
  userId: string | null | undefined,
): Promise<AccessTransferView[]> {
  try {
    const owner = requireUserId(userId);
    const database = getDatabase();
    const rows = await database
      .select()
      .from(crosschainTransfers)
      .where(eq(crosschainTransfers.userId, owner))
      .orderBy(desc(crosschainTransfers.createdAt))
      .limit(25);
    return rows.map(mapTransferView);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list access transfers");
  }
}

export type AccessBurnPreparation = {
  transferId: string;
  /** Soroban invocation descriptors for Freighter signing. No secrets. */
  network: typeof ACCESS_SOURCE_NETWORK;
  networkPassphrase: typeof ACCESS_TESTNET.networkPassphrase;
  rpcUrl: typeof ACCESS_TESTNET.rpcUrl;
  sourceWallet: string;
  asset: typeof ACCESS_ASSET;
  amount: string;
  amountSubunits6: string;
  /** Stellar-side burn amount in 7-decimal subunits (amount × 10, exact). */
  burnSubunits7: string;
  destinationNetwork: AccessDestinationKey;
  destinationDomain: number;
  sourceDomain: typeof ACCESS_STELLAR_DOMAIN;
  mintRecipientBytes32: string;
  usdcSac: typeof ACCESS_TESTNET.usdcSac;
  tokenMessengerMinter: typeof ACCESS_TESTNET.tokenMessengerMinter;
  /** Ordered Freighter steps: SAC allowance approval, then the burn w/ hook. */
  steps: Array<{ method: string; description: string }>;
  hookData: typeof ACCESS_FORWARD_HOOK_V0;
  finalityThreshold: typeof ACCESS_FINALITY_THRESHOLD;
  maxFeeSubunits7: string;
};

/**
 * Prepare the two Freighter steps (SAC approve + deposit_for_burn_with_hook).
 * Server owns every protocol constant; the participant supplies nothing but
 * the wallet that signs. Safe to repeat: re-preparing returns the same plan.
 */
export async function prepareAccessBurn(
  transferId: string,
  userId: string | null | undefined,
  sourceWallet: unknown,
): Promise<AccessBurnPreparation> {
  try {
    const owner = requireUserId(userId);
    const wallet =
      typeof sourceWallet === "string" && STELLAR_KEY_RE.test(sourceWallet.trim())
        ? sourceWallet.trim()
        : null;
    if (!wallet) {
      throw new AccessActionError(
        "wrong-source-wallet",
        "The signing wallet must match your connected Stellar wallet.",
        400,
      );
    }
    const row = await requireOwnedTransfer(requireRunId(transferId), owner);
    if (row.sourceWallet !== wallet) {
      throw new AccessActionError(
        "wrong-source-wallet",
        "The signing wallet must match the wallet recorded for this transfer.",
        403,
      );
    }
    if (row.status !== "draft" && row.status !== "approving" && row.status !== "burn_pending") {
      throw new AccessActionError(
        "invalid-transition",
        "This transfer already moved past approval.",
        409,
      );
    }
    const destination = getAccessDestination(row.destinationNetwork as AccessDestinationKey);
    if (!destination.executable) {
      throw new AccessActionError(
        "destination-coming-soon",
        destination.unavailableReason ?? "That destination is coming soon.",
        409,
      );
    }
    const amount = normalizeAccessAmount(row.amount);
    if (!amount) {
      throw new AccessActionError("invalid-amount", "That transfer amount is not valid.", 400);
    }
    const amountSubunits6 = accessAmountToSubunits6(amount);
    // Stellar burns 7-decimal subunits; a 6dp amount scales exactly by 10.
    const burnSubunits7 = amountSubunits6 * BigInt(10);
    // Default max fee: 0.05 USDC forwarding service fee in 7-decimal units.
    const maxFeeSubunits7 = BigInt(500000);

    const database = getDatabase();
    await database
      .update(crosschainTransfers)
      .set({ status: "burn_pending", retryable: false, lastError: null, updatedAt: new Date() })
      .where(and(eq(crosschainTransfers.id, row.id), eq(crosschainTransfers.userId, owner)));

    return {
      transferId: row.id,
      network: ACCESS_SOURCE_NETWORK,
      networkPassphrase: ACCESS_TESTNET.networkPassphrase,
      rpcUrl: ACCESS_TESTNET.rpcUrl,
      sourceWallet: row.sourceWallet,
      asset: ACCESS_ASSET,
      amount,
      amountSubunits6: amountSubunits6.toString(),
      burnSubunits7: burnSubunits7.toString(),
      destinationNetwork: destination.key,
      destinationDomain: destination.domain,
      sourceDomain: ACCESS_STELLAR_DOMAIN,
      mintRecipientBytes32: mintRecipientBytes32(destination.key, row.destinationAddress),
      usdcSac: ACCESS_TESTNET.usdcSac,
      tokenMessengerMinter: ACCESS_TESTNET.tokenMessengerMinter,
      steps: [
        { method: "approve", description: "Approve the CCTP minter to move your USDC." },
        {
          method: "deposit_for_burn_with_hook",
          description: "Burn USDC on Stellar and request forwarding to the destination.",
        },
      ],
      hookData: ACCESS_FORWARD_HOOK_V0,
      finalityThreshold: ACCESS_FINALITY_THRESHOLD,
      maxFeeSubunits7: maxFeeSubunits7.toString(),
    };
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("prepare access burn");
  }
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;
  const out = new Uint8Array((value.length - 2) / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(value.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return out;
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let match = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

async function stellarBytesFor(strkey: string): Promise<Uint8Array> {
  const { Address } = await import("@stellar/stellar-sdk");
  return new Address(strkey).toBuffer();
}

/**
 * Attach the Freighter-signed burn. The signed envelope is verified offline:
 * network label, wallet source, Soroban invocation shape, and embedded
 * protocol bytes (minter, USDC SAC, mint recipient) must all match the
 * server-owned plan. The hash is persisted BEFORE any status progresses, so
 * retries and refreshes can never trigger a second burn.
 */
export async function attachAccessBurn(
  transferId: string,
  userId: string | null | undefined,
  input: { sourceTxHash?: unknown; signedXdr?: unknown; network?: unknown; sourceWallet?: unknown },
): Promise<AccessTransferView> {
  try {
    const owner = requireUserId(userId);
    const row = await requireOwnedTransfer(requireRunId(transferId), owner);

    // Refresh-resume: the same burn re-attached is a no-op, never a reburn.
    const hash =
      typeof input.sourceTxHash === "string" && TX_HASH_RE.test(input.sourceTxHash.trim())
        ? input.sourceTxHash.trim().toLowerCase()
        : null;
    if (!hash) {
      throw new AccessActionError("invalid-request", "Provide the Stellar burn transaction hash.", 400);
    }
    if (row.sourceTxHash) {
      if (row.sourceTxHash.toLowerCase() === hash) {
        return mapTransferView(row);
      }
      throw new AccessActionError(
        "invalid-transition",
        "This transfer already has a burn. Retrying cannot burn twice.",
        409,
      );
    }
    if (row.status !== "burn_pending" && row.status !== "approving" && row.status !== "draft") {
      throw new AccessActionError(
        "invalid-transition",
        "This transfer already moved past the burn step.",
        409,
      );
    }

    if (input.network !== ACCESS_SOURCE_NETWORK) {
      throw new AccessActionError(
        "wrong-network",
        "That envelope is not for Stellar Testnet. Sign the prepared Testnet transaction.",
        400,
      );
    }
    const wallet =
      typeof input.sourceWallet === "string" ? input.sourceWallet.trim() : "";
    if (wallet !== row.sourceWallet) {
      throw new AccessActionError(
        "wrong-source-wallet",
        "The signing wallet must match the wallet recorded for this transfer.",
        403,
      );
    }
    const signedXdr = typeof input.signedXdr === "string" ? input.signedXdr.trim() : "";
    if (!signedXdr) {
      throw new AccessActionError(
        "invalid-request",
        "Provide the signed Stellar envelope for verification.",
        400,
      );
    }

    let transaction: { source: string; operations: Array<{ type: string }> };
    try {
      const sdk = await import("@stellar/stellar-sdk");
      const parsed = sdk.TransactionBuilder.fromXDR(signedXdr, ACCESS_TESTNET.networkPassphrase);
      if (parsed instanceof sdk.FeeBumpTransaction) {
        throw new AccessActionError(
          "invalid-request",
          "Fee-bump envelopes are not accepted. Sign the prepared Testnet envelope.",
          400,
        );
      }
      transaction = {
        source: (parsed as { source: string }).source,
        operations: (parsed as { operations: Array<{ type: string }> }).operations,
      };
    } catch (error) {
      if (error instanceof AccessActionError) throw error;
      throw new AccessActionError(
        "invalid-request",
        "That signed transaction could not be read. Sign the prepared Testnet envelope.",
        400,
      );
    }
    if (transaction.source !== row.sourceWallet) {
      throw new AccessActionError(
        "wrong-source-wallet",
        "The envelope source must match the wallet recorded for this transfer.",
        403,
      );
    }
    if (
      transaction.operations.length === 0 ||
      transaction.operations.some((op) => op.type !== "invokeHostFunction")
    ) {
      throw new AccessActionError(
        "invalid-request",
        "That envelope is not the prepared CCTP burn. Sign the prepared Testnet envelope.",
        400,
      );
    }
    // The envelope must embed the server-owned protocol bytes: minter, USDC
    // SAC, and this transfer's mint recipient. A foreign envelope cannot pass.
    let envelopeBytes: Uint8Array;
    try {
      envelopeBytes = new Uint8Array(Buffer.from(signedXdr, "base64"));
    } catch {
      throw new AccessActionError(
        "invalid-request",
        "That signed transaction could not be read. Sign the prepared Testnet envelope.",
        400,
      );
    }
    const destination = getAccessDestination(row.destinationNetwork as AccessDestinationKey);
    const expectedRecipient = mintRecipientBytes32(destination.key, row.destinationAddress);
    const [minterBytes, usdcBytes, recipientBytes] = await Promise.all([
      stellarBytesFor(ACCESS_TESTNET.tokenMessengerMinter),
      stellarBytesFor(ACCESS_TESTNET.usdcSac),
      Promise.resolve(hexToBytes(expectedRecipient)),
    ]);
    if (!recipientBytes) {
      throw new AccessActionError("invalid-request", "That transfer cannot be verified.", 400);
    }
    if (
      !containsBytes(envelopeBytes, minterBytes) ||
      !containsBytes(envelopeBytes, usdcBytes) ||
      !containsBytes(envelopeBytes, recipientBytes)
    ) {
      throw new AccessActionError(
        "invalid-request",
        "That envelope does not match this transfer's CCTP plan. Sign the prepared Testnet envelope.",
        400,
      );
    }

    // Claim the burn exactly once: concurrent attachers race on this UPDATE
    // guarded by sourceTxHash IS NULL; only the winner persists its hash,
    // losers reuse the winner's transfer.
    const database = getDatabase();
    const updated = await database
      .update(crosschainTransfers)
      .set({ sourceTxHash: hash, status: "burned", retryable: false, lastError: null, updatedAt: new Date() })
      .where(
        and(
          eq(crosschainTransfers.id, row.id),
          eq(crosschainTransfers.userId, owner),
          isNull(crosschainTransfers.sourceTxHash),
        ),
      )
      .returning();
    const winner = updated[0];
    if (winner?.sourceTxHash?.toLowerCase() === hash) {
      return mapTransferView(winner);
    }
    const resumed = await waitForBurnedTransfer(row.id, owner);
    if (resumed && resumed.sourceTxHash?.toLowerCase() === hash) return mapTransferView(resumed);
    if (resumed) {
      throw new AccessActionError(
        "invalid-transition",
        "This transfer already has a burn. Retrying cannot burn twice.",
        409,
      );
    }
    throw new AccessActionError(
      "invalid-transition",
      "This transfer already moved past the burn step.",
      409,
    );
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("attach access burn");
  }
}

async function defaultFetchAttestation(
  sourceDomain: number,
  txHash: string,
): Promise<AccessAttestationResult> {
  const response = await fetch(
    `${ACCESS_TESTNET.irisBaseUrl}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(txHash)}`,
    { method: "GET" },
  );
  if (response.status === 404) {
    return { state: "pending", message: null, attestation: null, destinationTxHash: null };
  }
  if (!response.ok) throw new Error(`Iris answered ${response.status}`);
  const payload = (await response.json().catch(() => null)) as {
    messages?: Array<{ status?: string; message?: string; attestation?: string; destinationTxHash?: string }>;
  } | null;
  const first = payload?.messages?.[0];
  if (!first) return { state: "pending", message: null, attestation: null, destinationTxHash: null };
  if (first.status === "complete") {
    return {
      state: "complete",
      message: typeof first.message === "string" ? first.message : null,
      attestation: typeof first.attestation === "string" ? first.attestation : null,
      destinationTxHash: typeof first.destinationTxHash === "string" ? first.destinationTxHash : null,
    };
  }
  return { state: "pending", message: null, attestation: null, destinationTxHash: null };
}

async function defaultFetchFee(sourceDomain: number, destDomain: number): Promise<AccessFeeResult> {
  const response = await fetch(
    `${ACCESS_TESTNET.feeBaseUrl}/v2/burn/USDC/fees/${sourceDomain}/${destDomain}?forward=true`,
    { method: "GET" },
  );
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    forwardFee?: number | string;
    totalFee?: number | string;
  } | null;
  const raw = payload?.forwardFee ?? payload?.totalFee;
  if (raw === undefined || raw === null) return null;
  // Circle quotes USDC fees in 6-decimal subunits; keep integer-safe.
  const asInt = typeof raw === "number" ? Math.trunc(raw) : /^\d+$/.test(String(raw).trim()) ? String(raw).trim() : null;
  if (asInt === null || asInt === undefined) return null;
  return { feeSubunits6: String(asInt) };
}

/**
 * Advance tracking from Circle/Iris state. Refresh resumes the same transfer:
 * it never creates another burn, never invents progress, and marks retryable
 * (not failed) when Circle/RPC is unreachable. Completion persists once.
 */
export async function refreshAccessTransfer(
  transferId: string,
  userId: string | null | undefined,
  transport: AccessTransport = {},
): Promise<AccessTransferView> {
  try {
    const owner = requireUserId(userId);
    const row = await requireOwnedTransfer(requireRunId(transferId), owner);
    if (row.status === "completed" || row.status === "failed") {
      return mapTransferView(row);
    }
    if (!row.sourceTxHash) return mapTransferView(row);

    const database = getDatabase();
    const destination = getAccessDestination(row.destinationNetwork as AccessDestinationKey);

    const markRetryable = async (message: string) => {
      const [next] = await database
        .update(crosschainTransfers)
        .set({ retryable: true, lastError: message, updatedAt: new Date() })
        .where(and(eq(crosschainTransfers.id, row.id), eq(crosschainTransfers.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("refresh access transfer");
      return mapTransferView(next);
    };

    // Quote the forwarding fee once real data is flowing; a fee-API outage
    // leaves fee null (never invented) and stays retryable.
    if (!row.feeSubunits6) {
      try {
        const fee = await (transport.fetchFee ?? defaultFetchFee)(
          ACCESS_STELLAR_DOMAIN,
          destination.domain,
        );
        if (fee && /^\d+$/.test(fee.feeSubunits6)) {
          const [feeUpdated] = await database
            .update(crosschainTransfers)
            .set({ feeSubunits6: fee.feeSubunits6, updatedAt: new Date() })
            .where(and(eq(crosschainTransfers.id, row.id), eq(crosschainTransfers.userId, owner)))
            .returning();
          if (feeUpdated) Object.assign(row, feeUpdated);
        }
      } catch {
        return markRetryable("The Circle fee service is unreachable. Tracking will resume.");
      }
    }

    let attestation: AccessAttestationResult;
    try {
      attestation = await (transport.fetchAttestation ?? defaultFetchAttestation)(
        ACCESS_STELLAR_DOMAIN,
        row.sourceTxHash,
      );
    } catch {
      return markRetryable("Circle attestation is unreachable. Tracking will resume.");
    }

    const advance = async (status: AccessStatus, patch: Partial<typeof row> = {}) => {
      const [next] = await database
        .update(crosschainTransfers)
        .set({ ...patch, status, retryable: false, lastError: null, updatedAt: new Date() })
        .where(and(eq(crosschainTransfers.id, row.id), eq(crosschainTransfers.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("refresh access transfer");
      return mapTransferView(next);
    };

    if (attestation.state === "not_found" || attestation.state === "pending") {
      const nextStatus: AccessStatus = row.status === "burned" ? "attesting" : (row.status as AccessStatus);
      if (nextStatus !== row.status) return advance(nextStatus);
      // Normal waiting for attestation: clear any stale retryable flag.
      // Only transport outages mark retryable — waiting is not an error.
      if (row.retryable || row.lastError) return advance(row.status as AccessStatus);
      return mapTransferView(row);
    }

    // Attestation complete: Circle forwards the destination mint.
    if (attestation.destinationTxHash) {
      return advance("completed", {
        cctpMessage: attestation.message ?? row.cctpMessage,
        destinationTxHash: attestation.destinationTxHash,
        completedAt: row.completedAt ?? new Date(),
      });
    }
    const nextStatus: AccessStatus = "forwarding";
    if (row.status !== nextStatus || (attestation.message && attestation.message !== row.cctpMessage)) {
      return advance(nextStatus, { cctpMessage: attestation.message ?? row.cctpMessage });
    }
    return mapTransferView(row);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("refresh access transfer");
  }
}
