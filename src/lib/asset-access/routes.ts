import "server-only";
import { AccessOrderError } from "@/lib/asset-access/service";
import {
  ACQUISITION_DISABLED_REASONS,
  ROUTER_SOURCE_ASSET,
  ROUTER_SOURCE_NETWORK,
  ROUTER_TARGET_ASSET,
  ROUTER_VENUE,
} from "@/lib/asset-access/config";
import {
  SWAP_SOURCE_CODE,
  SWAP_SOURCE_DECIMALS,
  SWAP_SOURCE_MINT,
  SWAP_TARGET_ASSET,
  SWAP_TARGET_MINT,
  SWAP_VENUE,
} from "@/lib/external-utility/config";

/**
 * Generalized Asset Access V1 — routes are modeled as
 * sourceNetwork + sourceAsset + targetNetwork + targetAsset + adapter.
 * No "universal router": only the routes below exist, each with an honest
 * executable flag. Stellar USDC legs stay gated until Mainnet CCTP review.
 */

export type AccessAdapterId = "jupiter-swap" | "aerodrome-router";

export type AccessRoute = {
  id: string;
  sourceNetwork: string;
  sourceAsset: string;
  /** Canonical mint/contract, or null where no single mint applies. */
  sourceMint: string | null;
  sourceDecimals: number;
  targetNetwork: string;
  targetSlug: string;
  targetCode: string;
  targetMint: string;
  adapter: AccessAdapterId;
  executable: boolean;
  reasonUnavailable: string | null;
  href: string;
};

export const ACCESS_ROUTES: readonly AccessRoute[] = [
  {
    id: "solana-usdc-to-aaplx",
    sourceNetwork: "solana",
    sourceAsset: SWAP_SOURCE_CODE,
    sourceMint: SWAP_SOURCE_MINT,
    sourceDecimals: SWAP_SOURCE_DECIMALS,
    targetNetwork: "solana",
    targetSlug: SWAP_TARGET_ASSET.slug,
    targetCode: SWAP_TARGET_ASSET.code,
    targetMint: SWAP_TARGET_MINT,
    adapter: "jupiter-swap",
    executable: true,
    reasonUnavailable: null,
    href: `/swap/${SWAP_TARGET_ASSET.slug}`,
  },
  {
    id: "stellar-usdc-to-aaplx",
    sourceNetwork: "stellar",
    sourceAsset: "USDC",
    // No single Stellar issuer is verified in Vicus for this leg — never invent one.
    sourceMint: null,
    sourceDecimals: 6,
    targetNetwork: "solana",
    targetSlug: SWAP_TARGET_ASSET.slug,
    targetCode: SWAP_TARGET_ASSET.code,
    targetMint: SWAP_TARGET_MINT,
    adapter: "jupiter-swap",
    executable: false,
    reasonUnavailable:
      "Route not currently executable: Vicus Access CCTP is Testnet-only and supports no Solana route, so Stellar USDC cannot fund this acquisition today.",
    href: `/acquire/${SWAP_TARGET_ASSET.slug}`,
  },
  {
    id: "stellar-usdc-to-aaplc",
    sourceNetwork: ROUTER_SOURCE_NETWORK,
    sourceAsset: ROUTER_SOURCE_ASSET,
    sourceMint: null,
    sourceDecimals: 6,
    targetNetwork: "base",
    targetSlug: ROUTER_TARGET_ASSET.slug,
    targetCode: ROUTER_TARGET_ASSET.code,
    targetMint: ROUTER_TARGET_ASSET.contractAddress,
    adapter: "aerodrome-router",
    executable: false,
    reasonUnavailable: [...ACQUISITION_DISABLED_REASONS].join(" "),
    href: `/acquire/${ROUTER_TARGET_ASSET.slug}`,
  },
];

export function getAccessRoutesForSlug(targetSlug: string): AccessRoute[] {
  return ACCESS_ROUTES.filter((route) => route.targetSlug === targetSlug);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** Exact route lookup. Anything unlisted returns null — never a fuzzy match. */
export function resolveAccessRoute(input: {
  targetSlug?: unknown;
  sourceNetwork?: unknown;
  sourceAsset?: unknown;
}): AccessRoute | null {
  const target = normalizeToken(input.targetSlug);
  const network = normalizeToken(input.sourceNetwork);
  const asset = typeof input.sourceAsset === "string" ? input.sourceAsset.trim().toUpperCase() : null;
  if (!target || !network || !asset) return null;
  return (
    ACCESS_ROUTES.find(
      (route) =>
        route.targetSlug === target &&
        route.sourceNetwork === network &&
        route.sourceAsset.toUpperCase() === asset,
    ) ?? null
  );
}

/** Executable route or a truthful error — gated routes can never masquerade. */
export function requireExecutableRoute(input: {
  targetSlug?: unknown;
  sourceNetwork?: unknown;
  sourceAsset?: unknown;
}): AccessRoute {
  const route = resolveAccessRoute(input);
  if (!route) {
    throw new AccessOrderError("unsupported-asset", "That funding route is not supported.", 400);
  }
  if (!route.executable) {
    throw new AccessOrderError(
      "execution-disabled",
      route.reasonUnavailable ?? "That funding route is not executable right now.",
      409,
    );
  }
  // Defense in depth: an executable Jupiter route must pin canonical mints.
  if (route.adapter === "jupiter-swap" && (route.sourceMint !== SWAP_SOURCE_MINT || route.targetMint !== SWAP_TARGET_MINT)) {
    throw new AccessOrderError("execution-disabled", "That funding route is not executable right now.", 409);
  }
  if (route.adapter === "aerodrome-router" && route.targetMint !== ROUTER_TARGET_ASSET.contractAddress) {
    throw new AccessOrderError("execution-disabled", "That funding route is not executable right now.", 409);
  }
  void SWAP_VENUE;
  void ROUTER_VENUE;
  return route;
}
