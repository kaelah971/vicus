import "server-only";

/**
 * Return-to-Stellar V1 — route model only. GATED: no executable route.
 *
 * Researched against current Circle docs (October 2026):
 * - Solana IS a CCTP Standard source and Stellar IS a supported destination,
 *   but inbound Stellar transfers MUST set both mintRecipient and
 *   destinationCaller to the CctpForwarder contract (else funds are
 *   permanently stuck), use 7-decimal Stellar USDC precision, and be
 *   relayed manually — Circle's Forwarding Service does NOT serve Stellar
 *   as a destination (table: Stellar Forwarding ❌).
 * - Vicus has no Solana-program burn path (depositForBurn), no forwarder
 *   hook builder, and no Stellar receiveMessage relay. Building those with
 *   user funds at stake is a dedicated audited slice, not a V1 adapter.
 * - The same inbound-Stellar requirements gate Base/Ethereum USDC legs.
 *
 * The model below pins the canonical destination (session-wallet Stellar
 * USDC) and the exact requirements so a future slice enforces them, while
 * every route reports executable:false with its reason today.
 */

export type ReturnAdapterId = "cctp-reverse";

export type ReturnRoute = {
  id: string;
  sourceNetwork: string;
  sourceAsset: string;
  /** Canonical source mint/contract, or null where not applicable. */
  sourceMint: string | null;
  destinationNetwork: "stellar";
  destinationAsset: "USDC";
  /** Canonical Stellar USDC issuer (Circle) — the only valid destination asset. */
  destinationIssuer: string;
  adapter: ReturnAdapterId;
  executable: boolean;
  reasonUnavailable: string | null;
  /** Enforced when a route becomes executable. */
  requirements: readonly string[];
  href: string | null;
};

const STELLAR_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const SOLANA_REASON =
  "Return is not available yet: inbound Stellar transfers must route through Circle's CctpForwarder with a manual receive relay, and Vicus has not built the Solana-program burn path. Your exited USDC stays safely in your Solana wallet.";

const EVM_REASON =
  "Return is not available yet: inbound Stellar transfers must route through Circle's CctpForwarder with a manual receive relay, which Vicus has not built for this leg.";

export const RETURN_ROUTES: readonly ReturnRoute[] = [
  {
    id: "solana-usdc-to-stellar",
    sourceNetwork: "solana",
    sourceAsset: "USDC",
    sourceMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    destinationNetwork: "stellar",
    destinationAsset: "USDC",
    destinationIssuer: STELLAR_USDC_ISSUER,
    adapter: "cctp-reverse",
    executable: false,
    reasonUnavailable: SOLANA_REASON,
    requirements: ["session-wallet-destination", "stellar-usdc-trustline", "solana-wallet-ownership", "cctp-forwarder-relay"],
    href: null,
  },
  {
    id: "base-usdc-to-stellar",
    sourceNetwork: "base",
    sourceAsset: "USDC",
    sourceMint: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    destinationNetwork: "stellar",
    destinationAsset: "USDC",
    destinationIssuer: STELLAR_USDC_ISSUER,
    adapter: "cctp-reverse",
    executable: false,
    reasonUnavailable: EVM_REASON,
    requirements: ["session-wallet-destination", "stellar-usdc-trustline", "cctp-forwarder-relay"],
    href: null,
  },
  {
    id: "ethereum-usdc-to-stellar",
    sourceNetwork: "ethereum",
    sourceAsset: "USDC",
    sourceMint: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    destinationNetwork: "stellar",
    destinationAsset: "USDC",
    destinationIssuer: STELLAR_USDC_ISSUER,
    adapter: "cctp-reverse",
    executable: false,
    reasonUnavailable: EVM_REASON,
    requirements: ["session-wallet-destination", "stellar-usdc-trustline", "cctp-forwarder-relay"],
    href: null,
  },
];

export function getReturnRoutes(): ReturnRoute[] {
  return [...RETURN_ROUTES];
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** Exact lookup. Anything unlisted returns null — never a fuzzy match. */
export function resolveReturnRoute(input: {
  sourceNetwork?: unknown;
  sourceAsset?: unknown;
}): ReturnRoute | null {
  const network = normalizeToken(input.sourceNetwork);
  const asset = typeof input.sourceAsset === "string" ? input.sourceAsset.trim().toUpperCase() : null;
  if (!network || !asset) return null;
  return RETURN_ROUTES.find((route) => route.sourceNetwork === network && route.sourceAsset === asset) ?? null;
}

export class ReturnRouteError extends Error {
  constructor(
    public readonly code: "unsupported-route" | "execution-disabled",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

/**
 * No executable return exists today: known routes report their documented
 * reason, unknown ones are unsupported. Never resolves to execution.
 */
export function requireExecutableReturnRoute(input: {
  sourceNetwork?: unknown;
  sourceAsset?: unknown;
}): never {
  const route = resolveReturnRoute(input);
  if (!route) {
    throw new ReturnRouteError("unsupported-route", "That return route is not supported.", 400);
  }
  throw new ReturnRouteError(
    "execution-disabled",
    route.reasonUnavailable ?? "Return to Stellar is not available right now.",
    409,
  );
}
