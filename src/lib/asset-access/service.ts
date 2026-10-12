import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { assetAccessOrders, circles } from "@/db/schema";
import {
  ACQUISITION_DISABLED_REASONS,
  ACQUISITION_ENABLED,
  ROUTER_BASE_EXPLORER_TX,
  ROUTER_BASE_RPC_URL,
  ROUTER_BASE_USDC,
  ROUTER_DESTINATION_NETWORK,
  ROUTER_ELIGIBILITY_COPY,
  ROUTER_SOURCE_ASSET,
  ROUTER_SOURCE_NETWORK,
  ROUTER_TARGET_ASSET,
  ROUTER_VENUE,
  ROUTER_VENUE_POOL,
  ROUTER_VENUE_ROUTER,
  type RouterTargetAsset,
} from "@/lib/asset-access/config";

export type AccessOrderErrorCode =
  | "unauthenticated"
  | "invalid-request"
  | "unsupported-asset"
  | "eligibility-required"
  | "not-found"
  | "invalid-transition"
  | "quote-unavailable"
  | "execution-disabled";

export class AccessOrderError extends Error {
  constructor(
    public readonly code: AccessOrderErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type AccessOrderStatus =
  | "draft"
  | "routing"
  | "bridging"
  | "destination_funded"
  | "quoting"
  | "approval_required"
  | "ready_to_swap"
  | "swapping"
  | "completed"
  | "failed";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** Precomputed keccak selectors (verified against known ERC-20 values). */
const SEL_GET_AMOUNTS_OUT = "5509a1ac";
const SEL_ALLOWANCE = "dd62ed3e";
const SEL_BALANCE_OF = "70a08231";

function preserveExpectedError(error: unknown): boolean {
  return error instanceof AccessOrderError || isDatabaseUnavailableError(error);
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new AccessOrderError("unauthenticated", "Sign in to access tokenized assets.", 401);
  }
  return userId;
}

export function normalizeSubunits(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "bigint") return null;
  try {
    const parsed = BigInt(value);
    return parsed > BigInt(0) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Accept max 6 fractional decimals (Stellar USDC CCTP units); exact BigInt math. */
export function stellarAmountToSubunits6(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  const subunits = BigInt(match[1]!) * BigInt(1000000) + BigInt((match[2] ?? "").padEnd(6, "0"));
  return subunits > BigInt(0) ? subunits.toString() : null;
}

export function formatSubunits(value: string, decimals: number): string {
  const raw = BigInt(value);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0");
  return `${whole.toString()}.${fraction}`;
}

export type BaseRpcTransport = {
  ethCall(to: string, data: string): Promise<string | null>;
};

async function defaultEthCall(to: string, data: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(ROUTER_BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { result?: unknown } | null;
    return typeof payload?.result === "string" ? payload.result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function padAddress(address: string): string {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

function padUint(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function parseUint256ArrayFirst(hex: string | null): bigint | null {
  // getAmountsOut returns (uint256[] amounts): offset, length, then values.
  if (!hex || !hex.startsWith("0x")) return null;
  const body = hex.slice(2);
  if (body.length < 256) return null;
  const length = BigInt(`0x${body.slice(64, 128)}`);
  if (length < BigInt(2)) return null;
  try {
    return BigInt(`0x${body.slice(128, 192)}`);
  } catch {
    return null;
  }
}

export type VenueQuote = {
  amountInSubunits: string;
  amountOutSubunits: string;
  minOutSubunits: string;
  venue: typeof ROUTER_VENUE;
  quotedAt: Date;
  route: { from: string; to: string; stable: boolean; factory: string };
};

/**
 * Acquisition adapter interface. V1 ships one Base/Aerodrome adapter; future
 * assets and venues plug in here without touching order logic or UI.
 */
export type AcquisitionAdapter = {
  readonly venue: string;
  readonly target: RouterTargetAsset;
  getQuote(amountInSubunits: string, transport?: BaseRpcTransport): Promise<VenueQuote | null>;
};

function buildRouteCalldata(amountInSubunits: string): string {
  const route =
    padAddress(ROUTER_BASE_USDC) +
    padAddress(ROUTER_TARGET_ASSET.contractAddress) +
    "0".repeat(63) +
    "0" +
    padAddress("0x0000000000000000000000000000000000000000");
  return `0x${SEL_GET_AMOUNTS_OUT}${padUint(BigInt(amountInSubunits))}${padUint(BigInt(32))}${padUint(BigInt(1))}${route}`;
}

export const aerodromeAdapter: AcquisitionAdapter = {
  venue: ROUTER_VENUE,
  target: ROUTER_TARGET_ASSET,
  async getQuote(amountInSubunits: string, transport?: BaseRpcTransport): Promise<VenueQuote | null> {
    const call = transport?.ethCall ?? defaultEthCall;
    let raw: string | null;
    try {
      raw = await call(ROUTER_VENUE_ROUTER, buildRouteCalldata(amountInSubunits));
    } catch {
      return null;
    }
    // A revert/empty answer means no executable price — never a fake quote.
    const out = parseUint256ArrayFirst(raw);
    if (out === null || out <= BigInt(0)) return null;
    const minOut = (out * BigInt(995)) / BigInt(1000);
    return {
      amountInSubunits,
      amountOutSubunits: out.toString(),
      minOutSubunits: minOut.toString(),
      venue: ROUTER_VENUE,
      quotedAt: new Date(),
      route: {
        from: ROUTER_BASE_USDC,
        to: ROUTER_TARGET_ASSET.contractAddress,
        stable: false,
        factory: ROUTER_VENUE_POOL,
      },
    };
  },
};

export function getTargetAsset(): RouterTargetAsset {
  return ROUTER_TARGET_ASSET;
}

export function getExecutionGate(): { enabled: boolean; reasons: string[] } {
  return { enabled: ACQUISITION_ENABLED, reasons: [...ACQUISITION_DISABLED_REASONS] };
}

export type AccessOrderView = {
  id: string;
  targetSlug: string;
  targetCode: string;
  targetContract: string;
  sourceAsset: string;
  sourceNetwork: string;
  sourceAmountSubunits: string;
  sourceAmountDisplay: string;
  destinationNetwork: string;
  executionWallet: string | null;
  venue: string;
  eligibilityAcknowledged: boolean;
  eligibilityCopy: string;
  accessTransferId: string | null;
  quote: {
    amountOutDisplay: string | null;
    minOutDisplay: string | null;
    quotedAt: string | null;
  };
  destinationUsdcAmount: string | null;
  targetAmount: string | null;
  approvalHash: string | null;
  swapHash: string | null;
  status: AccessOrderStatus;
  executionEnabled: boolean;
  disabledReasons: string[];
  failureReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function mapOrderView(row: typeof assetAccessOrders.$inferSelect, targetSlug: string): AccessOrderView {
  const gate = getExecutionGate();
  return {
    id: row.id,
    targetSlug,
    targetCode: ROUTER_TARGET_ASSET.code,
    targetContract: row.targetAssetAddress,
    sourceAsset: row.sourceAsset,
    sourceNetwork: row.sourceNetwork,
    sourceAmountSubunits: row.sourceAmountSubunits,
    sourceAmountDisplay: formatSubunits(row.sourceAmountSubunits, 6),
    destinationNetwork: row.destinationNetwork,
    executionWallet: row.executionWallet,
    venue: row.venue,
    eligibilityAcknowledged: row.eligibilityAcknowledged,
    eligibilityCopy: ROUTER_ELIGIBILITY_COPY,
    accessTransferId: row.accessTransferId,
    quote: {
      amountOutDisplay: row.quoteAmountOut ? formatSubunits(row.quoteAmountOut, ROUTER_TARGET_ASSET.decimals) : null,
      minOutDisplay: row.quoteMinOut ? formatSubunits(row.quoteMinOut, ROUTER_TARGET_ASSET.decimals) : null,
      quotedAt: row.quoteAt?.toISOString() ?? null,
    },
    destinationUsdcAmount: row.destinationUsdcAmount,
    targetAmount: row.targetAmount,
    approvalHash: row.approvalHash,
    swapHash: row.swapHash,
    status: row.status as AccessOrderStatus,
    executionEnabled: gate.enabled,
    disabledReasons: gate.reasons,
    failureReason: row.failureReason,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function requireOwnedOrder(orderId: string, userId: string) {
  if (!UUID_RE.test(orderId)) {
    throw new AccessOrderError("not-found", "That order could not be found.", 404);
  }
  const database = getDatabase();
  const [row] = await database
    .select({ order: assetAccessOrders, slug: circles.slug })
    .from(assetAccessOrders)
    .innerJoin(circles, eq(assetAccessOrders.targetCircleId, circles.id))
    .where(eq(assetAccessOrders.id, orderId))
    .limit(1);
  if (!row || row.order.userId !== userId) {
    throw new AccessOrderError("not-found", "That order could not be found.", 404);
  }
  return row;
}

async function requireTargetCircle(slug: unknown) {
  if (slug !== ROUTER_TARGET_ASSET.slug) {
    throw new AccessOrderError(
      "unsupported-asset",
      "Only the verified target asset can be accessed through this route.",
      400,
    );
  }
  const database = getDatabase();
  const [row] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, ROUTER_TARGET_ASSET.slug))
    .limit(1);
  if (!row) {
    throw new AccessOrderError("unsupported-asset", "The target asset is not available in Discover yet.", 400);
  }
  return row.id;
}

/**
 * Create an access order. Requires explicit eligibility acknowledgement and
 * a connected Base execution wallet. Never invents quotes or funds.
 */
export async function createAccessOrder(
  userId: string | null | undefined,
  input: {
    targetSlug?: unknown;
    sourceAmount?: unknown;
    executionWallet?: unknown;
    eligibilityAcknowledged?: unknown;
  },
): Promise<AccessOrderView> {
  try {
    const owner = requireUserId(userId);
    const targetCircleId = await requireTargetCircle(input.targetSlug);
    const subunits = stellarAmountToSubunits6(input.sourceAmount);
    if (!subunits) {
      throw new AccessOrderError("invalid-request", "Enter a Stellar USDC amount greater than zero.", 400);
    }
    const wallet =
      typeof input.executionWallet === "string" && EVM_ADDRESS_RE.test(input.executionWallet.trim())
        ? `0x${input.executionWallet.trim().slice(2).toLowerCase()}`
        : null;
    if (!wallet) {
      throw new AccessOrderError("invalid-request", "Connect the Base wallet that will receive and swap.", 400);
    }
    if (input.eligibilityAcknowledged !== true) {
      throw new AccessOrderError(
        "eligibility-required",
        "Confirm you are eligible under the issuer and venue terms before continuing.",
        400,
      );
    }
    const database = getDatabase();
    const [row] = await database
      .insert(assetAccessOrders)
      .values({
        userId: owner,
        targetCircleId,
        sourceAsset: ROUTER_SOURCE_ASSET,
        sourceNetwork: ROUTER_SOURCE_NETWORK,
        sourceAmountSubunits: subunits,
        destinationNetwork: ROUTER_DESTINATION_NETWORK,
        executionWallet: wallet,
        targetAssetAddress: ROUTER_TARGET_ASSET.contractAddress,
        venue: ROUTER_VENUE,
        eligibilityAcknowledged: true,
        status: "routing",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("create access order");
    return mapOrderView(row, ROUTER_TARGET_ASSET.slug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create access order");
  }
}

export async function getAccessOrder(
  orderId: string,
  userId: string | null | undefined,
): Promise<AccessOrderView> {
  try {
    const owner = requireUserId(userId);
    const { order, slug } = await requireOwnedOrder(orderId, owner);
    return mapOrderView(order, slug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read access order");
  }
}

export async function listMyAccessOrders(
  userId: string | null | undefined,
): Promise<AccessOrderView[]> {
  try {
    const owner = requireUserId(userId);
    const database = getDatabase();
    const rows = await database
      .select({ order: assetAccessOrders, slug: circles.slug })
      .from(assetAccessOrders)
      .innerJoin(circles, eq(assetAccessOrders.targetCircleId, circles.id))
      .where(eq(assetAccessOrders.userId, owner))
      .orderBy(desc(assetAccessOrders.createdAt))
      .limit(25);
    return rows.map((row) => mapOrderView(row.order, row.slug));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list access orders");
  }
}

/**
 * Refresh a live venue quote into the order. A revert/empty answer is stored
 * as quote-unavailable — Vicus never falls back to an invented price.
 */
export async function refreshOrderQuote(
  orderId: string,
  userId: string | null | undefined,
  transport?: BaseRpcTransport,
): Promise<AccessOrderView> {
  try {
    const owner = requireUserId(userId);
    const { order, slug } = await requireOwnedOrder(orderId, owner);
    if (order.status === "completed") return mapOrderView(order, slug);
    // Destination USDC leg is denominated 1:1 in subunits pre-fee display.
    const quote = await aerodromeAdapter.getQuote(order.sourceAmountSubunits, transport);
    const database = getDatabase();
    if (!quote) {
      const [next] = await database
        .update(assetAccessOrders)
        .set({
          status: "quoting",
          quoteAmountOut: null,
          quoteMinOut: null,
          quoteAt: null,
          failureReason: "quote-unavailable",
          lastError: "No executable venue price right now. The order keeps waiting — nothing was invented.",
          updatedAt: new Date(),
        })
        .where(and(eq(assetAccessOrders.id, order.id), eq(assetAccessOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("refresh order quote");
      return mapOrderView(next, slug);
    }
    const [next] = await database
      .update(assetAccessOrders)
      .set({
        status: "quoting",
        quoteAmountOut: quote.amountOutSubunits,
        quoteMinOut: quote.minOutSubunits,
        quoteAt: quote.quotedAt,
        failureReason: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(assetAccessOrders.id, order.id), eq(assetAccessOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("refresh order quote");
    return mapOrderView(next, slug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("refresh order quote");
  }
}

/**
 * Link an existing Access (CCTP) transfer to the order. Reuses the persisted
 * transfer — refreshing never creates another burn.
 */
export async function linkAccessTransfer(
  orderId: string,
  userId: string | null | undefined,
  accessTransferId: unknown,
): Promise<AccessOrderView> {
  try {
    const owner = requireUserId(userId);
    const { order, slug } = await requireOwnedOrder(orderId, owner);
    if (typeof accessTransferId !== "string" || !UUID_RE.test(accessTransferId)) {
      throw new AccessOrderError("invalid-request", "Provide the linked Access transfer.", 400);
    }
    if (order.accessTransferId && order.accessTransferId !== accessTransferId) {
      throw new AccessOrderError(
        "invalid-transition",
        "This order already links an Access transfer. Refresh it instead of starting another.",
        409,
      );
    }
    const database = getDatabase();
    const [next] = await database
      .update(assetAccessOrders)
      .set({ accessTransferId, status: "bridging", failureReason: null, lastError: null, updatedAt: new Date() })
      .where(and(eq(assetAccessOrders.id, order.id), eq(assetAccessOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("link access transfer");
    return mapOrderView(next, slug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("link access transfer");
  }
}

/**
 * Record Base-side progress (approval/swap hashes, funding). Execution entry
 * points stay gated: hashes are only recorded evidence, never invented, and
 * acquisition completion requires the disabled-gate to lift in a later slice.
 */
export async function recordBaseProgress(
  orderId: string,
  userId: string | null | undefined,
  input: { approvalHash?: unknown; swapHash?: unknown; destinationUsdcAmount?: unknown },
): Promise<AccessOrderView> {
  try {
    const owner = requireUserId(userId);
    const { order, slug } = await requireOwnedOrder(orderId, owner);
    if (order.status === "completed") return mapOrderView(order, slug);
    const patch: Partial<typeof order> = { updatedAt: new Date() };
    if (typeof input.approvalHash === "string" && TX_HASH_RE.test(input.approvalHash.trim())) {
      patch.approvalHash = input.approvalHash.trim().toLowerCase();
    }
    if (typeof input.swapHash === "string" && TX_HASH_RE.test(input.swapHash.trim())) {
      patch.swapHash = input.swapHash.trim().toLowerCase();
    }
    const destUsdc = normalizeSubunits(input.destinationUsdcAmount);
    if (destUsdc) {
      patch.destinationUsdcAmount = destUsdc;
      if (order.status === "bridging" || order.status === "routing" || order.status === "quoting") {
        patch.status = "destination_funded";
      }
    }
    const database = getDatabase();
    const [next] = await database
      .update(assetAccessOrders)
      .set(patch)
      .where(and(eq(assetAccessOrders.id, order.id), eq(assetAccessOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("record base progress");
    return mapOrderView(next, slug);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("record base progress");
  }
}

/** Read-only Base execution-wallet checks for the UI (balance/allowance). */
export async function readExecutionWallet(
  wallet: unknown,
  transport?: BaseRpcTransport,
): Promise<{ address: string; usdcBalanceSubunits: string } | null> {
  if (typeof wallet !== "string" || !EVM_ADDRESS_RE.test(wallet.trim())) return null;
  const address = `0x${wallet.trim().slice(2).toLowerCase()}`;
  const call = transport?.ethCall ?? defaultEthCall;
  const padAddr = address.replace("0x", "").padStart(64, "0");
  let raw: string | null;
  try {
    raw = await call(ROUTER_BASE_USDC, `0x${SEL_BALANCE_OF}${padAddr}`);
  } catch {
    return null;
  }
  if (!raw || !raw.startsWith("0x")) return null;
  try {
    return { address, usdcBalanceSubunits: BigInt(`0x${raw.slice(2, 66)}`).toString() };
  } catch {
    return null;
  }
}

export function readAllowanceCalldata(owner: string, spender: string): string {
  return `0x${SEL_ALLOWANCE}${padAddress(owner)}${padAddress(spender)}`;
}

export { ROUTER_BASE_EXPLORER_TX };
