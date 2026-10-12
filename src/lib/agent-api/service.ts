import "server-only";
import { getCircleBySlug, isAssetCircle, listCircles, matchesCircleFilters } from "@/lib/data/circles";
import { getCircleLifecycle } from "@/lib/lifecycle/service";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import { requireExecutableRoute } from "@/lib/asset-access/routes";
import { AccessOrderError } from "@/lib/asset-access/service";
import {
  EXIT_ACTION_KIND,
  SWAP_NETWORK,
  SWAP_TARGET_SLUG,
  SWAP_VENUE,
  EXIT_SOURCE_DECIMALS,
  EXIT_TARGET_DECIMALS,
  SWAP_SOURCE_DECIMALS,
  SWAP_TARGET_DECIMALS,
} from "@/lib/external-utility/config";
import {
  aaplxAmountToSubunits,
  exitAdapter,
  formatSubunits,
  readOwnedUtilityOrder,
  swapAdapter,
  usdcAmountToSubunits,
  UtilityOrderError,
} from "@/lib/external-utility/service";

/**
 * Agent API V1 — thin wrapper over existing Vicus truth. No new engines,
 * no new policy, no custody. Agents discover, inspect, quote, and check
 * status. Anything that moves value still needs a human wallet signature
 * through the existing flows (prepare → sign → verify → execute).
 */

export type AgentApiErrorCode =
  | "invalid-request"
  | "unsupported-route"
  | "execution-disabled"
  | "quote-unavailable"
  | "quote-expired"
  | "not-authenticated"
  | "not-owner"
  | "not-found";

export class AgentApiError extends Error {
  constructor(
    public readonly code: AgentApiErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export function translateOrderError(error: unknown): AgentApiError {
  if (error instanceof AgentApiError) return error;
  if (error instanceof AccessOrderError) {
    if (error.code === "unsupported-asset") {
      return new AgentApiError("unsupported-route", error.message, 400);
    }
    if (error.code === "execution-disabled") {
      return new AgentApiError("execution-disabled", error.message, 409);
    }
    return new AgentApiError("invalid-request", error.message, error.httpStatus);
  }
  if (error instanceof UtilityOrderError) {
    if (error.code === "quote-unavailable") {
      return new AgentApiError("quote-unavailable", error.message, 409);
    }
    if (error.code === "quote-expired") {
      return new AgentApiError("quote-expired", error.message, 409);
    }
    return new AgentApiError("invalid-request", error.message, error.httpStatus);
  }
  return new AgentApiError("invalid-request", "That request could not be accepted.", 400);
}

export type PublicAssetSummary = {
  slug: string;
  code: string;
  name: string;
  ecosystem: string;
  network: string;
  assetClass: string;
  assetClassLabel: string;
  issuer: string;
  summary: string;
  stateLabel: string;
};

/** Public directory: production asset circles only, never education-only. */
export async function listPublicAssets(input: {
  ecosystem?: unknown;
  assetClass?: unknown;
  query?: unknown;
}): Promise<{ assets: PublicAssetSummary[] }> {
  const database = await listCircles(null);
  const filters = {
    assetClass: typeof input.assetClass === "string" && input.assetClass.trim() ? input.assetClass.trim() : "all",
    ecosystem: typeof input.ecosystem === "string" && input.ecosystem.trim() ? input.ecosystem.trim() : "all",
    query: typeof input.query === "string" ? input.query : "",
    state: "All statuses",
  };
  return {
    assets: database
      .filter((circle) => circle.state !== "education" && isAssetCircle({ state: circle.state }))
      .filter((circle) => matchesCircleFilters(circle, filters))
      .map((circle) => ({
        slug: circle.slug,
        code: circle.code,
        name: circle.name,
        ecosystem: circle.ecosystem,
        network: circle.network,
        assetClass: circle.category,
        assetClassLabel: circle.assetClassLabel ?? circle.category,
        issuer: circle.issuerSource,
        summary: circle.summary,
        stateLabel: circle.stateLabel,
      })),
  };
}

export type PublicAssetDetail = PublicAssetSummary & {
  description: string;
  intendedUse: string;
  eligibilityNote: string;
  riskNote: string;
  sourceUrl: string;
  sourceStatus: string;
  lastVerified: string;
  lifecycle: {
    stage: string;
    title: string;
    shortDescription: string;
    supportMode: string;
    accessMode: string | null;
    ctaLabel: string | null;
    destinationUrl: string | null;
    eligibilityNote: string | null;
  }[];
};

export async function getPublicAsset(slug: string): Promise<PublicAssetDetail> {
  const normalized = typeof slug === "string" ? slug.trim() : "";
  if (!normalized || normalized.length > 140) {
    throw new AgentApiError("not-found", "That asset could not be found.", 404);
  }
  const record = await getCircleBySlug(normalized, null);
  if (!record || !isAssetCircle({ state: record.state })) {
    throw new AgentApiError("not-found", "That asset could not be found.", 404);
  }
  const lifecycle = await getCircleLifecycle(normalized);
  return {
    slug: record.slug,
    code: record.code,
    name: record.name,
    ecosystem: record.ecosystem,
    network: record.network,
    assetClass: record.category,
    assetClassLabel: record.assetClassLabel ?? record.category,
    issuer: record.issuerSource,
    summary: record.summary,
    stateLabel: record.stateLabel,
    description: record.description,
    intendedUse: record.intendedUse,
    eligibilityNote: record.eligibilityNote,
    riskNote: record.riskNote,
    sourceUrl: record.sourceUrl ?? "",
    sourceStatus: record.sourceStatus,
    lastVerified: record.lastVerified ?? "",
    lifecycle: lifecycle.map((step) => ({
      stage: step.stage,
      title: step.title,
      shortDescription: step.shortDescription,
      supportMode: step.supportMode,
      accessMode: step.accessMode,
      ctaLabel: step.ctaLabel,
      destinationUrl: step.destinationUrl,
      eligibilityNote: step.eligibilityNote,
    })),
  };
}

export type PublicAssetAction = {
  kind: string;
  title: string;
  description: string;
  state: string;
  stateLabel: string;
  executionMode: string;
  href: string;
  external: boolean;
  network: string;
  eligibilityNote: string | null;
  sourceUrl: string;
};

/** The exact same action truth the UI resolves — no parallel rules. */
export async function getPublicAssetActions(slug: string): Promise<{ asset: string; actions: PublicAssetAction[] }> {
  const normalized = typeof slug === "string" ? slug.trim() : "";
  if (!normalized || normalized.length > 140) {
    throw new AgentApiError("not-found", "That asset could not be found.", 404);
  }
  const record = await getCircleBySlug(normalized, null);
  if (!record || !isAssetCircle({ state: record.state })) {
    throw new AgentApiError("not-found", "That asset could not be found.", 404);
  }
  const resolved = await resolveAssetActions(normalized, record.network);
  return {
    asset: normalized,
    actions: resolved.map((action) => ({
      kind: action.kind,
      title: action.title,
      description: action.description,
      state: action.state,
      stateLabel: action.stateLabel,
      executionMode: action.executionMode,
      href: action.href,
      external: action.external,
      network: action.network,
      eligibilityNote: action.eligibilityNote,
      sourceUrl: action.sourceUrl,
    })),
  };
}

export type AgentQuote = {
  action: "access" | "exit";
  assetSlug: string;
  sourceNetwork: string;
  sourceAsset: string;
  amountInSubunits: string;
  amountInDisplay: string;
  amountOutSubunits: string;
  amountOutDisplay: string;
  minOutSubunits: string;
  minOutDisplay: string;
  venue: string;
  network: string;
  quotedAt: string;
  note: string;
};

/**
 * Stateless indicative quote over server-owned routes only. The request
 * carries intent (action + asset + source + amount); every executable detail
 * — mints, venue, slippage — is resolved server-side. Extra body fields
 * (mint, venue, slippage, calldata, router) are ignored by construction.
 */
export async function requestAgentQuote(
  input: {
    action?: unknown;
    assetSlug?: unknown;
    sourceNetwork?: unknown;
    sourceAsset?: unknown;
    amount?: unknown;
    [extra: string]: unknown;
  },
  transports?: Parameters<typeof swapAdapter.getQuote>[1] extends never
    ? never
    : { fetchQuote(amountInSubunits: string): Promise<{ outAmount: string } | null> },
): Promise<AgentQuote> {
  try {
    const action = input.action === "access" || input.action === "exit" ? input.action : null;
    if (!action) {
      throw new AgentApiError("invalid-request", "Specify action as access or exit.", 400);
    }
    const assetSlug = typeof input.assetSlug === "string" ? input.assetSlug.trim() : "";
    if (!assetSlug) {
      throw new AgentApiError("invalid-request", "Specify the asset.", 400);
    }
    if (action === "access") {
      const route = requireExecutableRoute({
        targetSlug: assetSlug,
        sourceNetwork: input.sourceNetwork,
        sourceAsset: input.sourceAsset,
      });
      const amountIn = usdcAmountToSubunits(input.amount);
      if (!amountIn) {
        throw new AgentApiError("invalid-request", "Enter a USDC amount greater than zero.", 400);
      }
      const quote = await swapAdapter.getQuote(amountIn, transports);
      if (!quote) {
        throw new AgentApiError("quote-unavailable", "No executable price for that route right now.", 409);
      }
      return {
        action,
        assetSlug: route.targetSlug,
        sourceNetwork: route.sourceNetwork,
        sourceAsset: route.sourceAsset,
        amountInSubunits: quote.amountInSubunits,
        amountInDisplay: formatSubunits(quote.amountInSubunits, SWAP_SOURCE_DECIMALS),
        amountOutSubunits: quote.amountOutSubunits,
        amountOutDisplay: formatSubunits(quote.amountOutSubunits, SWAP_TARGET_DECIMALS),
        minOutSubunits: quote.minOutSubunits,
        minOutDisplay: formatSubunits(quote.minOutSubunits, SWAP_TARGET_DECIMALS),
        venue: SWAP_VENUE,
        network: SWAP_NETWORK,
        quotedAt: quote.quotedAt.toISOString(),
        note: "Indicative live price only. Execution still requires an order, eligibility acknowledgement, a wallet signature, and Vicus verification.",
      };
    }
    // Exit: server-pinned reverse direction. No route-table entry exists for
    // exits, so the check is explicit and closed — anything else is rejected.
    const network = typeof input.sourceNetwork === "string" ? input.sourceNetwork.trim().toLowerCase() : "";
    const asset = typeof input.sourceAsset === "string" ? input.sourceAsset.trim().toUpperCase() : "";
    if (assetSlug !== SWAP_TARGET_SLUG || network !== "solana" || asset !== "AAPLX") {
      throw new AgentApiError("unsupported-route", "That exit route is not supported.", 400);
    }
    const amountIn = aaplxAmountToSubunits(input.amount);
    if (!amountIn) {
      throw new AgentApiError("invalid-request", "Enter an AAPLx amount greater than zero.", 400);
    }
    const quote = await exitAdapter.getQuote(amountIn, transports);
    if (!quote) {
      throw new AgentApiError("quote-unavailable", "No executable exit price right now.", 409);
    }
    return {
      action,
      assetSlug: SWAP_TARGET_SLUG,
      sourceNetwork: "solana",
      sourceAsset: "AAPLx",
      amountInSubunits: quote.amountInSubunits,
      amountInDisplay: formatSubunits(quote.amountInSubunits, EXIT_SOURCE_DECIMALS),
      amountOutSubunits: quote.amountOutSubunits,
      amountOutDisplay: formatSubunits(quote.amountOutSubunits, EXIT_TARGET_DECIMALS),
      minOutSubunits: quote.minOutSubunits,
      minOutDisplay: formatSubunits(quote.minOutSubunits, EXIT_TARGET_DECIMALS),
      venue: SWAP_VENUE,
      network: SWAP_NETWORK,
      quotedAt: quote.quotedAt.toISOString(),
      note: "Indicative live exit price only. Execution still requires an order, eligibility acknowledgement, a wallet signature, and Vicus verification.",
    };
  } catch (error) {
    throw translateOrderError(error);
  }
}

export type AgentOrderStatus = {
  id: string;
  type: "swap" | "exit";
  status: string;
  assetSlug: string;
  assetCode: string;
  network: string;
  sourceAmountDisplay: string;
  quoteOutDisplay: string | null;
  explorerUrl: string | null;
  actionRequired: string | null;
  retryable: boolean;
  failureReason: string | null;
  completedAt: string | null;
  updatedAt: string;
};

function actionRequiredFor(status: string, failureReason: string | null): { action: string | null; retryable: boolean } {
  switch (status) {
    case "draft":
      return { action: "request-quote", retryable: true };
    case "quoting":
      return { action: "refresh-quote", retryable: true };
    case "ready":
      return { action: "sign-with-wallet", retryable: true };
    case "submitted":
      return failureReason === "verification-failed"
        ? { action: "review-and-retry", retryable: true }
        : { action: "wait-confirmation", retryable: true };
    case "confirmed":
      return { action: null, retryable: false };
    default:
      return { action: "review-and-retry", retryable: false };
  }
}

/** Owner-scoped normalized status over swap + exit orders. No new table. */
export async function getAgentOrderStatus(
  orderId: string,
  userId: string | null | undefined,
): Promise<AgentOrderStatus> {
  if (!userId) {
    throw new AgentApiError("not-authenticated", "Sign in to inspect orders.", 401);
  }
  let row;
  try {
    row = await readOwnedUtilityOrder(orderId, userId);
  } catch (error) {
    if (error instanceof UtilityOrderError && error.code === "unauthenticated") {
      throw new AgentApiError("not-authenticated", "Sign in to inspect orders.", 401);
    }
    if (error instanceof UtilityOrderError && error.code === "not-found") {
      throw new AgentApiError("not-found", "That order could not be found.", 404);
    }
    throw translateOrderError(error);
  }
  const type = row.actionKind === EXIT_ACTION_KIND ? ("exit" as const) : ("swap" as const);
  const { action, retryable } = actionRequiredFor(row.status, row.failureReason);
  return {
    id: row.id,
    type,
    status: row.status,
    assetSlug: row.assetSlug,
    assetCode: type === "swap" ? "AAPLx" : "USDC",
    network: SWAP_NETWORK,
    sourceAmountDisplay:
      type === "swap"
        ? formatSubunits(row.sourceAmountSubunits, SWAP_SOURCE_DECIMALS)
        : formatSubunits(row.sourceAmountSubunits, EXIT_SOURCE_DECIMALS),
    quoteOutDisplay:
      row.quoteOutAmount !== null
        ? formatSubunits(row.quoteOutAmount, type === "swap" ? SWAP_TARGET_DECIMALS : EXIT_TARGET_DECIMALS)
        : null,
    explorerUrl: row.swapSignature ? `https://explorer.solana.com/tx/${row.swapSignature}` : null,
    actionRequired: action,
    retryable,
    failureReason: row.failureReason,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}
