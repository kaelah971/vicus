import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { circles, externalUtilityOrders } from "@/db/schema";
import {
  EXIT_ACTION_KIND,
  EXIT_SOURCE_DECIMALS,
  EXIT_SOURCE_MINT,
  EXIT_TARGET_DECIMALS,
  EXIT_TARGET_MINT,
  JUPITER_LITE_BASE,
  SOLANA_EXPLORER_TX,
  SOLANA_RPC_URL,
  SWAP_ACTION_KIND,
  SWAP_ELIGIBILITY_COPY,
  SWAP_NETWORK,
  SWAP_QUOTE_TTL_MS,
  SWAP_SLIPPAGE_BPS,
  SWAP_SOURCE_CODE,
  SWAP_SOURCE_DECIMALS,
  SWAP_SOURCE_MINT,
  SWAP_TARGET_ASSET,
  SWAP_TARGET_CODE,
  SWAP_TARGET_DECIMALS,
  SWAP_TARGET_MINT,
  SWAP_TARGET_SLUG,
  SWAP_VENUE,
} from "@/lib/external-utility/config";

export type UtilityOrderErrorCode =
  | "unauthenticated"
  | "invalid-request"
  | "unsupported-asset"
  | "eligibility-required"
  | "not-found"
  | "invalid-transition"
  | "quote-unavailable"
  | "quote-expired"
  | "verification-failed";

export class UtilityOrderError extends Error {
  constructor(
    public readonly code: UtilityOrderErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type UtilityOrderStatus =
  | "draft"
  | "quoting"
  | "ready"
  | "submitted"
  | "confirmed"
  | "failed";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

function preserveExpectedError(error: unknown): boolean {
  return error instanceof UtilityOrderError || isDatabaseUnavailableError(error);
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new UtilityOrderError("unauthenticated", "Sign in to swap.", 401);
  }
  return userId;
}

/** USDC amounts: max 6 fractional decimals, exact BigInt subunits. */
export function usdcAmountToSubunits(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  const subunits = BigInt(match[1]!) * BigInt(1000000) + BigInt((match[2] ?? "").padEnd(6, "0"));
  return subunits > BigInt(0) ? subunits.toString() : null;
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

export function formatSubunits(value: string, decimals: number): string {
  const raw = BigInt(value);
  const base = BigInt(10) ** BigInt(decimals);
  return `${(raw / base).toString()}.${(raw % base).toString().padStart(decimals, "0")}`;
}

export type JupiterTransport = {
  /** Live quote for the server-owned route. Null = no executable price. */
  fetchQuote(amountInSubunits: string): Promise<{ outAmount: string } | null>;
  /** Unsigned base64 swap transaction for the quoted route + wallet. */
  buildSwapTransaction(quote: unknown, userPublicKey: string): Promise<{ swapTransaction: string } | null>;
};

export type SolanaTransport = {
  getSignatureStatus(signature: string): Promise<"confirmed" | "finalized" | null>;
  /**
   * Net per-mint balance deltas (post minus pre, in base units) for the
   * wallet's token accounts inside the transaction. Null = unreadable.
   */
  getTransactionDeltas(signature: string, owner: string): Promise<{ usdc: string; aaplx: string } | null>;
  sendRawTransaction?(base64Tx: string): Promise<string | null>;
};

async function defaultJupiterQuote(amountInSubunits: string): Promise<{ outAmount: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url =
      `${JUPITER_LITE_BASE}/swap/v1/quote?inputMint=${SWAP_SOURCE_MINT}` +
      `&outputMint=${SWAP_TARGET_MINT}&amount=${amountInSubunits}&slippageBps=${SWAP_SLIPPAGE_BPS}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { outAmount?: unknown } | null;
    return typeof payload?.outAmount === "string" && normalizeSubunits(payload.outAmount)
      ? { outAmount: payload.outAmount }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultJupiterSwap(quote: unknown, userPublicKey: string): Promise<{ swapTransaction: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${JUPITER_LITE_BASE}/swap/v1/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: false,
        dynamicComputeUnitLimit: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { swapTransaction?: unknown } | null;
    return typeof payload?.swapTransaction === "string" && payload.swapTransaction.length > 0
      ? { swapTransaction: payload.swapTransaction }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => null)) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultTransactionDeltas(
  signature: string,
  owner: string,
): Promise<{ usdc: string; aaplx: string } | null> {
  const payload = (await solanaRpc("getTransaction", [
    signature,
    { encoding: "json", maxSupportedTransactionVersion: 0 },
  ])) as {
    result?: {
      meta?: {
        err?: unknown;
        preTokenBalances?: { accountIndex?: number; mint?: string; owner?: string; uiTokenAmount?: { amount?: string } }[];
        postTokenBalances?: { accountIndex?: number; mint?: string; owner?: string; uiTokenAmount?: { amount?: string } }[];
      } | null;
    } | null;
  } | null;
  try {
    const meta = payload?.result?.meta;
    if (!meta || meta.err) return null;
    const delta = (mint: string): string | null => {
      const pre = new Map<number, bigint>();
      for (const entry of meta.preTokenBalances ?? []) {
        if (entry.mint === mint && entry.owner === owner && typeof entry.accountIndex === "number") {
          pre.set(entry.accountIndex, BigInt(entry.uiTokenAmount?.amount ?? "0"));
        }
      }
      let total = BigInt(0);
      let seen = false;
      for (const entry of meta.postTokenBalances ?? []) {
        if (entry.mint === mint && entry.owner === owner && typeof entry.accountIndex === "number") {
          total += BigInt(entry.uiTokenAmount?.amount ?? "0") - (pre.get(entry.accountIndex) ?? BigInt(0));
          seen = true;
        }
      }
      return seen ? total.toString() : null;
    };
    const usdc = delta(SWAP_SOURCE_MINT);
    const aaplx = delta(SWAP_TARGET_MINT);
    return usdc !== null && aaplx !== null ? { usdc, aaplx } : null;
  } catch {
    return null;
  }
}

async function defaultSignatureStatus(signature: string): Promise<"confirmed" | "finalized" | null> {
  const payload = (await solanaRpc("getSignatureStatuses", [[signature], { searchTransactionHistory: true }])) as {
    result?: { value?: ({ confirmationStatus?: string; err?: unknown } | null)[] };
  } | null;
  const entry = payload?.result?.value?.[0];
  if (!entry || entry.err) return null;
  return entry.confirmationStatus === "finalized" || entry.confirmationStatus === "confirmed"
    ? entry.confirmationStatus
    : null;
}

export type SwapQuote = {
  amountInSubunits: string;
  amountOutSubunits: string;
  minOutSubunits: string;
  quotedAt: Date;
};

/**
 * SwapAdapter — the first executable non-stablecoin utility outside Stellar.
 * Server owns mints, venue, slippage, and recipient; the client supplies only
 * amount + execution wallet. Quotes are live Jupiter prices or nothing.
 */
export const swapAdapter = {
  venue: SWAP_VENUE,
  target: SWAP_TARGET_ASSET,
  async getQuote(
    amountInSubunits: string,
    transport?: Pick<JupiterTransport, "fetchQuote">,
  ): Promise<SwapQuote | null> {
    let answer: { outAmount: string } | null;
    try {
      answer = transport ? await transport.fetchQuote(amountInSubunits) : await defaultJupiterQuote(amountInSubunits);
    } catch {
      return null;
    }
    const out = answer ? normalizeSubunits(answer.outAmount) : null;
    if (!out) return null;
    return {
      amountInSubunits,
      amountOutSubunits: out,
      minOutSubunits: ((BigInt(out) * BigInt(10000 - SWAP_SLIPPAGE_BPS)) / BigInt(10000)).toString(),
      quotedAt: new Date(),
    };
  },
};

function minOutFor(outAmount: string): string {
  return ((BigInt(outAmount) * BigInt(10000 - SWAP_SLIPPAGE_BPS)) / BigInt(10000)).toString();
}

export type UtilityOrderView = {
  id: string;
  actionKind: typeof SWAP_ACTION_KIND;
  targetSlug: string;
  targetCode: string;
  targetMint: string;
  sourceCode: string;
  sourceMint: string;
  sourceAmountSubunits: string;
  sourceAmountDisplay: string;
  destinationNetwork: string;
  executionWallet: string | null;
  venue: string;
  eligibilityAcknowledged: boolean;
  eligibilityCopy: string;
  fundingNote: string;
  quote: { amountOutDisplay: string | null; minOutDisplay: string | null; quotedAt: string | null };
  swapSignature: string | null;
  swapExplorerUrl: string | null;
  targetAmount: string | null;
  status: UtilityOrderStatus;
  failureReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function mapOrderView(row: typeof externalUtilityOrders.$inferSelect): UtilityOrderView {
  return {
    id: row.id,
    actionKind: SWAP_ACTION_KIND,
    targetSlug: SWAP_TARGET_SLUG,
    targetCode: SWAP_TARGET_CODE,
    targetMint: row.targetMint,
    sourceCode: SWAP_SOURCE_CODE,
    sourceMint: row.sourceMint,
    sourceAmountSubunits: row.sourceAmountSubunits,
    sourceAmountDisplay: formatSubunits(row.sourceAmountSubunits, SWAP_SOURCE_DECIMALS),
    destinationNetwork: row.destinationNetwork,
    executionWallet: row.executionWallet,
    venue: row.venue,
    eligibilityAcknowledged: row.eligibilityAcknowledged,
    eligibilityCopy: SWAP_ELIGIBILITY_COPY,
    fundingNote: "Funded with Solana USDC from your connected wallet. Vicus makes no Stellar bridge claim for this route.",
    quote: {
      amountOutDisplay: row.quoteOutAmount ? formatSubunits(row.quoteOutAmount, SWAP_TARGET_DECIMALS) : null,
      minOutDisplay: row.quoteMinOut ? formatSubunits(row.quoteMinOut, SWAP_TARGET_DECIMALS) : null,
      quotedAt: row.quoteAt?.toISOString() ?? null,
    },
    swapSignature: row.swapSignature,
    swapExplorerUrl: row.swapSignature ? `${SOLANA_EXPLORER_TX}${row.swapSignature}` : null,
    targetAmount: row.targetAmount,
    status: row.status as UtilityOrderStatus,
    failureReason: row.failureReason,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function requireOwnedOrder(orderId: string, userId: string) {
  if (!UUID_RE.test(orderId)) {
    throw new UtilityOrderError("not-found", "That order could not be found.", 404);
  }
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(externalUtilityOrders)
    .where(eq(externalUtilityOrders.id, orderId))
    .limit(1);
  if (!row || row.userId !== userId) {
    throw new UtilityOrderError("not-found", "That order could not be found.", 404);
  }
  return row;
}

async function requireTargetCircle() {
  const database = getDatabase();
  const [row] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, SWAP_TARGET_SLUG))
    .limit(1);
  if (!row) {
    throw new UtilityOrderError("unsupported-asset", "The target asset is not available in Discover yet.", 400);
  }
  return row.id;
}

export async function createUtilityOrder(
  userId: string | null | undefined,
  input: { targetSlug?: unknown; sourceAmount?: unknown; executionWallet?: unknown; eligibilityAcknowledged?: unknown },
): Promise<UtilityOrderView> {
  try {
    const owner = requireUserId(userId);
    if (input.targetSlug !== SWAP_TARGET_SLUG) {
      throw new UtilityOrderError("unsupported-asset", "Only the verified target asset can be swapped here.", 400);
    }
    const targetCircleId = await requireTargetCircle();
    const subunits = usdcAmountToSubunits(input.sourceAmount);
    if (!subunits) {
      throw new UtilityOrderError("invalid-request", "Enter a Solana USDC amount greater than zero.", 400);
    }
    const wallet =
      typeof input.executionWallet === "string" && BASE58_RE.test(input.executionWallet.trim())
        ? input.executionWallet.trim()
        : null;
    if (!wallet) {
      throw new UtilityOrderError("invalid-request", "Connect the Solana wallet that will pay and receive.", 400);
    }
    if (input.eligibilityAcknowledged !== true) {
      throw new UtilityOrderError(
        "eligibility-required",
        "Confirm you are eligible under the issuer and venue terms before continuing.",
        400,
      );
    }
    const database = getDatabase();
    const [row] = await database
      .insert(externalUtilityOrders)
      .values({
        userId: owner,
        targetCircleId,
        actionKind: SWAP_ACTION_KIND,
        sourceMint: SWAP_SOURCE_MINT,
        sourceAmountSubunits: subunits,
        targetMint: SWAP_TARGET_MINT,
        destinationNetwork: SWAP_NETWORK,
        executionWallet: wallet,
        venue: SWAP_VENUE,
        eligibilityAcknowledged: true,
        status: "draft",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("create utility order");
    return mapOrderView(row);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create utility order");
  }
}

export async function getUtilityOrder(orderId: string, userId: string | null | undefined): Promise<UtilityOrderView> {
  try {
    const owner = requireUserId(userId);
    return mapOrderView(await requireOwnedOrder(orderId, owner));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read utility order");
  }
}

export async function listMyUtilityOrders(userId: string | null | undefined): Promise<UtilityOrderView[]> {
  try {
    const owner = requireUserId(userId);
    const database = getDatabase();
    const rows = await database
      .select()
      .from(externalUtilityOrders)
      .where(eq(externalUtilityOrders.userId, owner))
      .orderBy(desc(externalUtilityOrders.createdAt))
      .limit(25);
    return rows.map(mapOrderView);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list utility orders");
  }
}

/** Refresh a live Jupiter quote. Reverts clear stored prices — never faked. */
export async function refreshUtilityQuote(
  orderId: string,
  userId: string | null | undefined,
  jupiter?: Pick<JupiterTransport, "fetchQuote">,
): Promise<UtilityOrderView> {
  try {
    const owner = requireUserId(userId);
    const order = await requireOwnedOrder(orderId, owner);
    if (order.status === "confirmed") return mapOrderView(order);
    const quote = await swapAdapter.getQuote(order.sourceAmountSubunits, jupiter);
    const database = getDatabase();
    if (!quote) {
      const [next] = await database
        .update(externalUtilityOrders)
        .set({
          status: "quoting",
          quoteOutAmount: null,
          quoteMinOut: null,
          quoteAt: null,
          failureReason: "quote-unavailable",
          lastError: "No executable Jupiter price right now. The order keeps waiting — nothing was invented.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("refresh utility quote");
      return mapOrderView(next);
    }
    const [next] = await database
      .update(externalUtilityOrders)
      .set({
        status: "quoting",
        quoteOutAmount: quote.amountOutSubunits,
        quoteMinOut: quote.minOutSubunits,
        quoteAt: quote.quotedAt,
        failureReason: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("refresh utility quote");
    return mapOrderView(next);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("refresh utility quote");
  }
}

/**
 * Prepare the unsigned swap transaction. Requires a fresh (≤60s) stored
 * quote; re-fetches the live route and pins the server-owned mints, amount,
 * and recipient. Returns opaque base64 for the execution wallet to sign —
 * Vicus never sees a private key.
 */
export async function prepareUtilitySwap(
  orderId: string,
  userId: string | null | undefined,
  jupiter?: JupiterTransport,
): Promise<{ order: UtilityOrderView; swapTransaction: string; minOutSubunits: string }> {
  try {
    const owner = requireUserId(userId);
    const order = await requireOwnedOrder(orderId, owner);
    if (order.status === "confirmed") {
      throw new UtilityOrderError("invalid-transition", "This swap already completed.", 409);
    }
    if (!order.executionWallet) {
      throw new UtilityOrderError("invalid-request", "Connect the Solana execution wallet first.", 400);
    }
    const quoteAge = order.quoteAt ? Date.now() - order.quoteAt.getTime() : Number.POSITIVE_INFINITY;
    if (!order.quoteOutAmount || quoteAge > SWAP_QUOTE_TTL_MS) {
      throw new UtilityOrderError("quote-expired", "Refresh the live quote before preparing the swap.", 409);
    }
    const fetchQuote = jupiter?.fetchQuote ?? defaultJupiterQuote;
    const buildSwap = jupiter?.buildSwapTransaction ?? defaultJupiterSwap;
    let live: { outAmount: string } | null;
    try {
      live = await fetchQuote(order.sourceAmountSubunits);
    } catch {
      live = null;
    }
    const liveOut = live ? normalizeSubunits(live.outAmount) : null;
    if (!liveOut) {
      throw new UtilityOrderError("quote-unavailable", "No executable Jupiter price right now.", 409);
    }
    // The prepared route must still honor the accepted minimum — otherwise
    // the user re-quotes instead of signing a worse fill.
    const acceptedMin = order.quoteMinOut ?? minOutFor(order.quoteOutAmount!);
    if (BigInt(liveOut) < BigInt(acceptedMin)) {
      throw new UtilityOrderError(
        "quote-expired",
        "The live price moved below your accepted minimum. Refresh the quote.",
        409,
      );
    }
    let built: { swapTransaction: string } | null;
    try {
      // Re-pass a minimal quote envelope; the transport owns wire format.
      built = await buildSwap({ outAmount: liveOut, amountIn: order.sourceAmountSubunits }, order.executionWallet);
    } catch {
      built = null;
    }
    if (!built) {
      throw new UtilityOrderError("quote-unavailable", "The swap could not be prepared right now.", 409);
    }
    const database = getDatabase();
    const [next] = await database
      .update(externalUtilityOrders)
      .set({
        status: "ready",
        quoteOutAmount: liveOut,
        quoteMinOut: minOutFor(liveOut),
        quoteAt: new Date(),
        failureReason: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("prepare utility swap");
    return { order: mapOrderView(next), swapTransaction: built.swapTransaction, minOutSubunits: minOutFor(liveOut) };
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("prepare utility swap");
  }
}

/**
 * Confirm a wallet-submitted swap. Verifies onchain: signature confirmed AND
 * token balance deltas prove the exact route (USDC out ≈ amount in, AAPLx in
 * ≥ accepted minimum, both on the order's execution wallet). Anything less
 * stays unconfirmed — a signature alone is not a receipt.
 */
export async function confirmUtilitySwap(
  orderId: string,
  userId: string | null | undefined,
  input: { signature?: unknown },
  solana?: SolanaTransport,
): Promise<UtilityOrderView> {
  try {
    const owner = requireUserId(userId);
    const order = await requireOwnedOrder(orderId, owner);
    if (order.status === "confirmed") return mapOrderView(order);
    const signature = typeof input.signature === "string" && SIGNATURE_RE.test(input.signature.trim()) ? input.signature.trim() : null;
    if (!signature) {
      throw new UtilityOrderError("invalid-request", "Provide the submitted swap signature.", 400);
    }
    if (order.swapSignature && order.swapSignature !== signature) {
      throw new UtilityOrderError(
        "invalid-transition",
        "This order already tracks a different swap. Refresh instead of submitting another.",
        409,
      );
    }
    if (!order.executionWallet || !order.quoteMinOut) {
      throw new UtilityOrderError("invalid-transition", "Prepare the swap before confirming it.", 409);
    }
    const statusOf = solana?.getSignatureStatus ?? defaultSignatureStatus;
    const deltasOf = solana?.getTransactionDeltas ?? defaultTransactionDeltas;
    let status: "confirmed" | "finalized" | null;
    try {
      status = await statusOf(signature);
    } catch {
      status = null;
    }
    if (!status) {
      const database = getDatabase();
      const [next] = await database
        .update(externalUtilityOrders)
        .set({
          status: "submitted",
          swapSignature: signature,
          failureReason: "unconfirmed",
          lastError: "Signature not confirmed yet. It stays retryable — nothing is marked complete.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("confirm utility swap");
      return mapOrderView(next);
    }
    // True route proof from inside the transaction: the user's USDC accounts
    // must fund exactly the order amount and the AAPLx accounts must gain at
    // least the accepted minimum. Pre-existing balances cannot fake this.
    let deltas: { usdc: string; aaplx: string } | null;
    try {
      deltas = await deltasOf(signature, order.executionWallet);
    } catch {
      deltas = null;
    }
    const database = getDatabase();
    const routeProven =
      deltas !== null &&
      BigInt(deltas.usdc) === BigInt(order.sourceAmountSubunits) * BigInt(-1) &&
      BigInt(deltas.aaplx) >= BigInt(order.quoteMinOut);
    const proven = routeProven && deltas ? deltas : null;
    if (!proven) {
      const [next] = await database
        .update(externalUtilityOrders)
        .set({
          status: "submitted",
          swapSignature: signature,
          targetAmount: deltas ? deltas.aaplx : null,
          failureReason: "verification-failed",
          lastError: "Signature confirmed but token deltas do not prove the quoted route yet. Retryable — funds stay visible onchain.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("confirm utility swap");
      return mapOrderView(next);
    }
    const [next] = await database
      .update(externalUtilityOrders)
      .set({
        status: "confirmed",
        swapSignature: signature,
        targetAmount: proven.aaplx,
        failureReason: null,
        lastError: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("confirm utility swap");
    return mapOrderView(next);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("confirm utility swap");
  }
}

export { SOLANA_EXPLORER_TX };

export type OwnedUtilityOrderSummary = {
  id: string;
  actionKind: string;
  sourceMint: string;
  sourceAmountSubunits: string;
  targetMint: string;
  status: string;
  failureReason: string | null;
  quoteOutAmount: string | null;
  quoteMinOut: string | null;
  swapSignature: string | null;
  completedAt: string | null;
  updatedAt: string;
  assetSlug: string;
};

/** Owner-scoped whitelisted read for wrappers (e.g. Agent API). No wallet, no raw transactions. */
export async function readOwnedUtilityOrder(
  orderId: string,
  userId: string | null | undefined,
): Promise<OwnedUtilityOrderSummary> {
  try {
    const owner = requireUserId(userId);
    const row = await requireOwnedOrder(orderId, owner);
    const database = getDatabase();
    const [circle] = await database
      .select({ slug: circles.slug })
      .from(circles)
      .where(eq(circles.id, row.targetCircleId))
      .limit(1);
    return {
      id: row.id,
      actionKind: row.actionKind,
      sourceMint: row.sourceMint,
      sourceAmountSubunits: row.sourceAmountSubunits,
      targetMint: row.targetMint,
      status: row.status,
      failureReason: row.failureReason,
      quoteOutAmount: row.quoteOutAmount,
      quoteMinOut: row.quoteMinOut,
      swapSignature: row.swapSignature,
      completedAt: row.completedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      assetSlug: circle?.slug ?? "unknown",
    };
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read owned utility order");
  }
}

/* ================================================================
 * ACCESS FUNDING V1 — real Solana token-balance reads.
 * The connected execution wallet is always server-resolved from the
 * owned order; clients never supply the wallet for this check.
 * Unreadable balances return null (retryable) — never a fake zero.
 * ================================================================ */

export type SolanaBalanceTransport = {
  getTokenBalanceSubunits(owner: string, mint: string): Promise<string | null>;
};

async function defaultTokenBalance(owner: string, mint: string): Promise<string | null> {
  const payload = (await solanaRpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" },
  ])) as {
    result?: { value?: { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }[] } | null;
  } | null;
  try {
    const accounts = payload?.result?.value;
    if (!Array.isArray(accounts)) return null;
    let total = BigInt(0);
    for (const entry of accounts) {
      const amount = entry?.account?.data?.parsed?.info?.tokenAmount?.amount;
      if (typeof amount === "string" && /^[0-9]+$/.test(amount)) total += BigInt(amount);
    }
    return total.toString();
  } catch {
    return null;
  }
}

/** Real wallet token balance in base units, or null when unreadable. */
export async function getSolanaTokenBalance(
  owner: string,
  mint: string,
  transport?: SolanaBalanceTransport,
): Promise<string | null> {
  if (!BASE58_RE.test(owner)) return null;
  try {
    return transport ? await transport.getTokenBalanceSubunits(owner, mint) : await defaultTokenBalance(owner, mint);
  } catch {
    return null;
  }
}

export type OrderFundingStatus = {
  orderId: string;
  actionKind: string;
  /** Base-unit spend the order requires, from the server-owned row. */
  requiredSubunits: string;
  /** Mint the funding must arrive in — always server-pinned. */
  fundingMint: string;
  /** Execution wallet from the owned order — never client input. */
  executionWallet: string | null;
  balanceSubunits: string | null;
  /** True/false when readable; null when the balance could not be read. */
  sufficient: boolean | null;
};

/**
 * Funding gate for swap + exit orders: compares the order's required spend
 * against the real onchain balance of the stored execution wallet.
 * Owner-scoped; insufficient balances are reported, never bypassed.
 */
export async function checkOrderFunding(
  orderId: string,
  userId: string | null | undefined,
  transport?: SolanaBalanceTransport,
): Promise<OrderFundingStatus> {
  const owner = requireUserId(userId);
  const order = await requireOwnedOrder(orderId, owner);
  const fundingMint =
    order.actionKind === EXIT_ACTION_KIND
      ? EXIT_SOURCE_MINT
      : order.actionKind === SWAP_ACTION_KIND
        ? SWAP_SOURCE_MINT
        : null;
  if (!fundingMint || order.sourceMint !== fundingMint) {
    throw new UtilityOrderError("verification-failed", "Order mints do not match the verified route.", 400);
  }
  if (!order.executionWallet) {
    throw new UtilityOrderError("invalid-transition", "Connect the Solana execution wallet first.", 409);
  }
  const balance = await getSolanaTokenBalance(order.executionWallet, fundingMint, transport);
  return {
    orderId: order.id,
    actionKind: order.actionKind,
    requiredSubunits: order.sourceAmountSubunits,
    fundingMint,
    executionWallet: order.executionWallet,
    balanceSubunits: balance,
    sufficient: balance === null ? null : BigInt(balance) >= BigInt(order.sourceAmountSubunits),
  };
}

/* ================================================================
 * EXIT ROUTER V1 — AAPLx → Jupiter → Solana USDC.
 * Reuses external_utility_orders with actionKind "exit"; no new table.
 * Same Jupiter adapter, same wallet-signs/server-verifies rule, same
 * TTL/slippage. Mint substitution rejected; duplicates safe.
 * ================================================================ */

/** AAPLx amounts: max 8 fractional decimals (Token-2022), exact BigInt. */
export function aaplxAmountToSubunits(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match) return null;
  const subunits =
    BigInt(match[1]!) * BigInt(100000000) + BigInt((match[2] ?? "").padEnd(8, "0"));
  return subunits > BigInt(0) ? subunits.toString() : null;
}

async function jupiterQuoteFor(
  inputMint: string,
  outputMint: string,
  amountInSubunits: string,
): Promise<{ outAmount: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url =
      `${JUPITER_LITE_BASE}/swap/v1/quote?inputMint=${inputMint}` +
      `&outputMint=${outputMint}&amount=${amountInSubunits}&slippageBps=${SWAP_SLIPPAGE_BPS}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { outAmount?: unknown } | null;
    return typeof payload?.outAmount === "string" && normalizeSubunits(payload.outAmount)
      ? { outAmount: payload.outAmount }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type ExitOrderView = {
  id: string;
  actionKind: typeof EXIT_ACTION_KIND;
  sourceCode: string;
  sourceMint: string;
  sourceAmountSubunits: string;
  sourceAmountDisplay: string;
  targetCode: string;
  targetMint: string;
  destinationNetwork: string;
  executionWallet: string | null;
  venue: string;
  eligibilityAcknowledged: boolean;
  eligibilityCopy: string;
  fundingNote: string;
  quote: { amountOutDisplay: string | null; minOutDisplay: string | null; quotedAt: string | null };
  swapSignature: string | null;
  swapExplorerUrl: string | null;
  targetAmount: string | null;
  status: UtilityOrderStatus;
  failureReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function mapExitView(row: typeof externalUtilityOrders.$inferSelect): ExitOrderView {
  return {
    id: row.id,
    actionKind: EXIT_ACTION_KIND,
    sourceCode: "AAPLx",
    sourceMint: row.sourceMint,
    sourceAmountSubunits: row.sourceAmountSubunits,
    sourceAmountDisplay: formatSubunits(row.sourceAmountSubunits, EXIT_SOURCE_DECIMALS),
    targetCode: "USDC",
    targetMint: row.targetMint,
    destinationNetwork: row.destinationNetwork,
    executionWallet: row.executionWallet,
    venue: row.venue,
    eligibilityAcknowledged: row.eligibilityAcknowledged,
    eligibilityCopy: SWAP_ELIGIBILITY_COPY,
    fundingNote: "Exited to Solana USDC in your connected Solana wallet.",
    quote: {
      amountOutDisplay: row.quoteOutAmount ? formatSubunits(row.quoteOutAmount, EXIT_TARGET_DECIMALS) : null,
      minOutDisplay: row.quoteMinOut ? formatSubunits(row.quoteMinOut, EXIT_TARGET_DECIMALS) : null,
      quotedAt: row.quoteAt?.toISOString() ?? null,
    },
    swapSignature: row.swapSignature,
    swapExplorerUrl: row.swapSignature ? `${SOLANA_EXPLORER_TX}${row.swapSignature}` : null,
    targetAmount: row.targetAmount,
    status: row.status as UtilityOrderStatus,
    failureReason: row.failureReason,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Live Jupiter price for the exit direction, or nothing. */
export const exitAdapter = {
  venue: SWAP_VENUE,
  async getQuote(
    amountInSubunits: string,
    transport?: Pick<JupiterTransport, "fetchQuote">,
  ): Promise<SwapQuote | null> {
    let answer: { outAmount: string } | null;
    try {
      answer = transport
        ? await transport.fetchQuote(amountInSubunits)
        : await jupiterQuoteFor(EXIT_SOURCE_MINT, EXIT_TARGET_MINT, amountInSubunits);
    } catch {
      return null;
    }
    const out = answer ? normalizeSubunits(answer.outAmount) : null;
    if (!out) return null;
    return {
      amountInSubunits,
      amountOutSubunits: out,
      minOutSubunits: ((BigInt(out) * BigInt(10000 - SWAP_SLIPPAGE_BPS)) / BigInt(10000)).toString(),
      quotedAt: new Date(),
    };
  },
};

function requireOwnedExitOrder(orderId: string, userId: string) {
  return requireOwnedOrder(orderId, userId).then((row) => {
    if (row.actionKind !== EXIT_ACTION_KIND) {
      throw new UtilityOrderError("not-found", "That exit order could not be found.", 404);
    }
    if (row.sourceMint !== EXIT_SOURCE_MINT || row.targetMint !== EXIT_TARGET_MINT) {
      throw new UtilityOrderError("verification-failed", "Order mints do not match the verified exit route.", 400);
    }
    return row;
  });
}

export async function createExitOrder(
  userId: string | null | undefined,
  input: { sourceAmount?: unknown; executionWallet?: unknown; eligibilityAcknowledged?: unknown },
): Promise<ExitOrderView> {
  try {
    const owner = requireUserId(userId);
    const targetCircleId = await requireTargetCircle();
    const subunits = aaplxAmountToSubunits(input.sourceAmount);
    if (!subunits) {
      throw new UtilityOrderError("invalid-request", "Enter an AAPLx amount greater than zero.", 400);
    }
    const wallet =
      typeof input.executionWallet === "string" && BASE58_RE.test(input.executionWallet.trim())
        ? input.executionWallet.trim()
        : null;
    if (!wallet) {
      throw new UtilityOrderError("invalid-request", "Connect the Solana wallet that holds the AAPLx.", 400);
    }
    if (input.eligibilityAcknowledged !== true) {
      throw new UtilityOrderError(
        "eligibility-required",
        "Confirm you are eligible under the issuer and venue terms before continuing.",
        400,
      );
    }
    const database = getDatabase();
    const [row] = await database
      .insert(externalUtilityOrders)
      .values({
        userId: owner,
        targetCircleId,
        actionKind: EXIT_ACTION_KIND,
        sourceMint: EXIT_SOURCE_MINT,
        sourceAmountSubunits: subunits,
        targetMint: EXIT_TARGET_MINT,
        destinationNetwork: SWAP_NETWORK,
        executionWallet: wallet,
        venue: SWAP_VENUE,
        eligibilityAcknowledged: true,
        status: "draft",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("create exit order");
    return mapExitView(row);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("create exit order");
  }
}

export async function getExitOrder(orderId: string, userId: string | null | undefined): Promise<ExitOrderView> {
  try {
    const owner = requireUserId(userId);
    return mapExitView(await requireOwnedExitOrder(orderId, owner));
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("read exit order");
  }
}

export async function listMyExitOrders(userId: string | null | undefined): Promise<ExitOrderView[]> {
  try {
    const owner = requireUserId(userId);
    const database = getDatabase();
    const rows = await database
      .select()
      .from(externalUtilityOrders)
      .where(and(eq(externalUtilityOrders.userId, owner), eq(externalUtilityOrders.actionKind, EXIT_ACTION_KIND)))
      .orderBy(desc(externalUtilityOrders.createdAt))
      .limit(25);
    return rows.map(mapExitView);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("list exit orders");
  }
}

export async function refreshExitQuote(
  orderId: string,
  userId: string | null | undefined,
  jupiter?: Pick<JupiterTransport, "fetchQuote">,
): Promise<ExitOrderView> {
  try {
    const owner = requireUserId(userId);
    const order = await requireOwnedExitOrder(orderId, owner);
    if (order.status === "confirmed") return mapExitView(order);
    const quote = await exitAdapter.getQuote(order.sourceAmountSubunits, jupiter);
    const database = getDatabase();
    if (!quote) {
      const [next] = await database
        .update(externalUtilityOrders)
        .set({
          status: "quoting",
          quoteOutAmount: null,
          quoteMinOut: null,
          quoteAt: null,
          failureReason: "quote-unavailable",
          lastError: "No executable Jupiter exit price right now. The order keeps waiting — nothing was invented.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("refresh exit quote");
      return mapExitView(next);
    }
    const [next] = await database
      .update(externalUtilityOrders)
      .set({
        status: "quoting",
        quoteOutAmount: quote.amountOutSubunits,
        quoteMinOut: quote.minOutSubunits,
        quoteAt: quote.quotedAt,
        failureReason: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("refresh exit quote");
    return mapExitView(next);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("refresh exit quote");
  }
}

export async function prepareExitSwap(
  orderId: string,
  userId: string | null | undefined,
  jupiter?: JupiterTransport,
): Promise<{ order: ExitOrderView; swapTransaction: string; minOutSubunits: string }> {
  try {
    const owner = requireUserId(userId);
    const order = await requireOwnedExitOrder(orderId, owner);
    if (order.status === "confirmed") {
      throw new UtilityOrderError("invalid-transition", "This exit already completed.", 409);
    }
    if (!order.executionWallet) {
      throw new UtilityOrderError("invalid-request", "Connect the Solana execution wallet first.", 400);
    }
    const quoteAge = order.quoteAt ? Date.now() - order.quoteAt.getTime() : Number.POSITIVE_INFINITY;
    if (!order.quoteOutAmount || quoteAge > SWAP_QUOTE_TTL_MS) {
      throw new UtilityOrderError("quote-expired", "Refresh the live exit quote before preparing.", 409);
    }
    const fetchQuote = jupiter?.fetchQuote ?? ((amount: string) => jupiterQuoteFor(EXIT_SOURCE_MINT, EXIT_TARGET_MINT, amount));
    const buildSwap = jupiter?.buildSwapTransaction ?? defaultJupiterSwap;
    let live: { outAmount: string } | null;
    try {
      live = await fetchQuote(order.sourceAmountSubunits);
    } catch {
      live = null;
    }
    const liveOut = live ? normalizeSubunits(live.outAmount) : null;
    if (!liveOut) {
      throw new UtilityOrderError("quote-unavailable", "No executable Jupiter exit price right now.", 409);
    }
    const acceptedMin = order.quoteMinOut ?? minOutFor(order.quoteOutAmount!);
    if (BigInt(liveOut) < BigInt(acceptedMin)) {
      throw new UtilityOrderError(
        "quote-expired",
        "The live exit price moved below your accepted minimum. Refresh the quote.",
        409,
      );
    }
    let built: { swapTransaction: string } | null;
    try {
      built = await buildSwap({ outAmount: liveOut, amountIn: order.sourceAmountSubunits }, order.executionWallet);
    } catch {
      built = null;
    }
    if (!built) {
      throw new UtilityOrderError("quote-unavailable", "The exit could not be prepared right now.", 409);
    }
    const database = getDatabase();
    const [next] = await database
      .update(externalUtilityOrders)
      .set({
        status: "ready",
        quoteOutAmount: liveOut,
        quoteMinOut: minOutFor(liveOut),
        quoteAt: new Date(),
        failureReason: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("prepare exit swap");
    return { order: mapExitView(next), swapTransaction: built.swapTransaction, minOutSubunits: minOutFor(liveOut) };
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("prepare exit swap");
  }
}

export async function confirmExitSwap(
  orderId: string,
  userId: string | null | undefined,
  input: { signature?: unknown },
  solana?: SolanaTransport,
): Promise<ExitOrderView> {
  try {
    const owner = requireUserId(userId);
    const order = await requireOwnedExitOrder(orderId, owner);
    if (order.status === "confirmed") return mapExitView(order);
    const signature =
      typeof input.signature === "string" && SIGNATURE_RE.test(input.signature.trim()) ? input.signature.trim() : null;
    if (!signature) {
      throw new UtilityOrderError("invalid-request", "Provide the submitted exit signature.", 400);
    }
    if (order.swapSignature && order.swapSignature !== signature) {
      throw new UtilityOrderError(
        "invalid-transition",
        "This exit already tracks a different swap. Refresh instead of submitting another.",
        409,
      );
    }
    if (!order.executionWallet || !order.quoteMinOut) {
      throw new UtilityOrderError("invalid-transition", "Prepare the exit before confirming it.", 409);
    }
    const statusOf = solana?.getSignatureStatus ?? defaultSignatureStatus;
    const deltasOf = solana?.getTransactionDeltas ?? defaultTransactionDeltas;
    let status: "confirmed" | "finalized" | null;
    try {
      status = await statusOf(signature);
    } catch {
      status = null;
    }
    const database = getDatabase();
    if (!status) {
      const [next] = await database
        .update(externalUtilityOrders)
        .set({
          status: "submitted",
          swapSignature: signature,
          failureReason: "unconfirmed",
          lastError: "Signature not confirmed yet. It stays retryable — nothing is marked complete.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("confirm exit swap");
      return mapExitView(next);
    }
    let deltas: { usdc: string; aaplx: string } | null;
    try {
      deltas = await deltasOf(signature, order.executionWallet);
    } catch {
      deltas = null;
    }
    // Exit route proof: wallet's AAPLx accounts must spend exactly the order
    // amount and its USDC accounts must gain at least the accepted minimum.
    const routeProven =
      deltas !== null &&
      BigInt(deltas.aaplx) === BigInt(order.sourceAmountSubunits) * BigInt(-1) &&
      BigInt(deltas.usdc) >= BigInt(order.quoteMinOut);
    const proven = routeProven && deltas ? deltas : null;
    if (!proven) {
      const [next] = await database
        .update(externalUtilityOrders)
        .set({
          status: "submitted",
          swapSignature: signature,
          targetAmount: deltas ? deltas.usdc : null,
          failureReason: "verification-failed",
          lastError:
            "Signature confirmed but token deltas do not prove the exit route yet. Retryable — funds stay visible onchain.",
          updatedAt: new Date(),
        })
        .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
        .returning();
      if (!next) throw toDatabaseUnavailableError("confirm exit swap");
      return mapExitView(next);
    }
    const [next] = await database
      .update(externalUtilityOrders)
      .set({
        status: "confirmed",
        swapSignature: signature,
        targetAmount: proven.usdc,
        failureReason: null,
        lastError: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(externalUtilityOrders.id, order.id), eq(externalUtilityOrders.userId, owner)))
      .returning();
    if (!next) throw toDatabaseUnavailableError("confirm exit swap");
    return mapExitView(next);
  } catch (error) {
    if (preserveExpectedError(error)) throw error;
    throw toDatabaseUnavailableError("confirm exit swap");
  }
}
