import "server-only";
import { getSwapTarget } from "@/lib/external-utility/config";
import {
  unavailableEvidence,
  validateEvidence,
  type PriceEvidence,
  type PriceUnavailableReason,
} from "@/lib/prices/types";

/**
 * P1.3 — Verified price sources (server-only; no API keys in the browser).
 *
 * Wired feeds (everything else is honestly unavailable):
 * 1. Jupiter indicative swap quotes for the two verified Solana swap
 *    targets (AAPLx, TSLAx): a fixed 25-USDC input quoted live. This is
 *    type `indicative_quote` denominated in USDC — never a market price,
 *    never USD, never an execution guarantee.
 * 2. Issuer-reported stable NAV for the two money funds whose official
 *    documents state a $1 objective (BENJI via Franklin Templeton,
 *    WTGXX via WisdomTree). Type `issuer_nav`, freshness `reference`,
 *    timestamped to the in-repo document review (2026-10-12) — never
 *    presented as a market observation.
 *
 * Deliberately NOT shown as prices:
 * - Stellar orderbook top-of-book: books are XLM-denominated and Vicus
 *   has no verified XLM→USD feed, so no USD market price is derivable.
 *   (Spot-checked 2026-10-16: USDC/XLM book live at ~5.43 XLM per USDC
 *   on horizon.stellar.org — depth signal only, not a price.)
 * - Underlying equity prices (AAPL/TSLA/NVDA): no suitable provider is
 *   wired; the token price is never backfilled from the stock price.
 * - Stablecoin $1 assumptions: no verified observation, no price shown.
 * - AAPLc / NVDAc venues: Aerodrome quotes revert per prior research —
 *   venue_gated, no executable quote exists.
 * - Historical series: no wired source publishes one — charts stay in
 *   their honest absence state until a real series exists.
 */

const JUPITER_LITE_BASE = "https://lite-api.jup.ag";
const QUOTE_INPUT_USDC = 25;
const QUOTE_INPUT_SUBUNITS = String(QUOTE_INPUT_USDC * 1_000_000);
const QUOTE_SLIPPAGE_BPS = 50;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

const JUPITER_SOURCE = { name: "Jupiter", url: "https://jup.ag/" };

type NavEntry = {
  slug: string;
  code: string;
  network: string;
  value: number;
  currency: string;
  sourceName: string;
  sourceUrl: string;
  /** In-repo official-document review date — the observation timestamp. */
  reviewedAt: string;
  detail: string;
};

const NAV_REGISTRY: Record<string, NavEntry> = {
  "benji-on-stellar": {
    slug: "benji-on-stellar",
    code: "BENJI",
    network: "Stellar",
    value: 1,
    currency: "USD",
    sourceName: "Franklin Templeton",
    sourceUrl:
      "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX",
    reviewedAt: "2026-10-12T00:00:00.000Z",
    detail: "Issuer-reported stable NAV objective (one share targets 1 USD)",
  },
  "wtgxx-on-stellar": {
    slug: "wtgxx-on-stellar",
    code: "WTGXX",
    network: "Stellar",
    value: 1,
    currency: "USD",
    sourceName: "WisdomTree",
    sourceUrl: "https://www.wisdomtree.com/investments/digital-funds/money-market/wtgxx",
    reviewedAt: "2026-10-12T00:00:00.000Z",
    detail: "Issuer-reported stable NAV objective (one share targets 1 USD)",
  },
};

/** Slugs whose venue is verified-gated: no executable quote exists. */
const GATED_SLUGS: Record<string, { code: string; network: string; detail: string }> = {
  "aaplc-on-base": {
    code: "AAPLc",
    network: "Base",
    detail: "No verified price feed — venue gated (Aerodrome quotes revert)",
  },
  "nvdac-on-base": {
    code: "NVDAc",
    network: "Base",
    detail: "No verified price feed — venue gated (Aerodrome quotes revert)",
  },
};

export type JupiterQuoteTransport = (
  inputMint: string,
  outputMint: string,
  amountInSubunits: string,
) => Promise<{ outAmount: string; observedAt: string } | null>;

async function defaultJupiterTransport(
  inputMint: string,
  outputMint: string,
  amountInSubunits: string,
): Promise<{ outAmount: string; observedAt: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url =
      `${JUPITER_LITE_BASE}/swap/v1/quote?inputMint=${inputMint}` +
      `&outputMint=${outputMint}&amount=${amountInSubunits}&slippageBps=${QUOTE_SLIPPAGE_BPS}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { outAmount?: unknown } | null;
    if (typeof payload?.outAmount !== "string" || !/^\d+$/.test(payload.outAmount)) return null;
    return { outAmount: payload.outAmount, observedAt: new Date().toISOString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const cache = new Map<string, { evidence: PriceEvidence; expiresAt: number }>();

function cached(slug: string): PriceEvidence | null {
  const entry = cache.get(slug);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(slug);
    return null;
  }
  // Serve the cached observation with its ORIGINAL observedAt; a cache hit
  // is never re-stamped as fresh data.
  return entry.evidence;
}

function store(slug: string, evidence: PriceEvidence): void {
  cache.set(slug, { evidence, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearPriceCache(): void {
  cache.clear();
}

function slugIdentity(slug: string): { code: string; network: string } {
  if (slug.endsWith("-on-solana")) return { code: slug.replace("-on-solana", "").toUpperCase(), network: "Solana" };
  if (slug.endsWith("-on-base")) return { code: slug.replace("-on-base", "").toUpperCase(), network: "Base" };
  if (slug.endsWith("-on-stellar")) return { code: slug.replace("-on-stellar", "").toUpperCase(), network: "Stellar" };
  if (slug.endsWith("-on-ethereum")) return { code: slug.replace("-on-ethereum", "").toUpperCase(), network: "Ethereum" };
  return { code: slug.toUpperCase(), network: "Unknown" };
}

/**
 * Resolve price evidence for a catalogue slug. Pure routing except for the
 * Jupiter live-quote path (injectable transport for tests). Provider
 * failures yield `provider_error` unavailability — stale data is never
 * re-stamped as fresh.
 */
export async function getPriceEvidence(
  slug: string,
  opts?: { transport?: JupiterQuoteTransport },
): Promise<PriceEvidence> {
  const now = new Date().toISOString();
  const hit = cached(slug);
  if (hit) return hit;

  const nav = NAV_REGISTRY[slug];
  if (nav) {
    const evidence: PriceEvidence = {
      slug: nav.slug,
      code: nav.code,
      network: nav.network,
      status: "available",
      priceType: "issuer_nav",
      value: nav.value,
      currency: nav.currency,
      source: { name: nav.sourceName, url: nav.sourceUrl },
      observedAt: nav.reviewedAt,
      retrievedAt: now,
      freshness: "reference",
      detail: nav.detail,
      reason: null,
      series: [],
    };
    if (validateEvidence(evidence).length > 0) {
      return unavailableEvidence({
        slug,
        code: nav.code,
        network: nav.network,
        reason: "provider_error",
        detail: "Price temporarily unavailable",
      });
    }
    return evidence;
  }

  const gated = GATED_SLUGS[slug];
  if (gated) {
    return unavailableEvidence({
      slug,
      code: gated.code,
      network: gated.network,
      reason: "venue_gated",
      detail: gated.detail,
    });
  }

  const target = getSwapTarget(slug);
  if (target) {
    const transport = opts?.transport ?? defaultJupiterTransport;
    let quote: { outAmount: string; observedAt: string } | null = null;
    try {
      quote = await transport(USDC_SOLANA_MINT, target.mint, QUOTE_INPUT_SUBUNITS);
    } catch {
      quote = null;
    }
    if (!quote) {
      return unavailableEvidence({
        slug,
        code: target.code,
        network: "Solana",
        reason: "provider_error",
        detail: "Price temporarily unavailable",
      });
    }
    const outTokens = Number(quote.outAmount) / 10 ** target.decimals;
    if (!Number.isFinite(outTokens) || outTokens <= 0) {
      return unavailableEvidence({
        slug,
        code: target.code,
        network: "Solana",
        reason: "provider_error",
        detail: "Price temporarily unavailable",
      });
    }
    const evidence: PriceEvidence = {
      slug: target.slug,
      code: target.code,
      network: "Solana",
      status: "available",
      priceType: "indicative_quote",
      value: QUOTE_INPUT_USDC / outTokens,
      currency: "USDC",
      source: JUPITER_SOURCE,
      observedAt: quote.observedAt,
      retrievedAt: now,
      freshness: "live",
      detail: `Indicative ${QUOTE_INPUT_USDC}-USDC swap quote — not the token market price, not executable pricing`,
      reason: null,
      series: [],
    };
    if (validateEvidence(evidence).length > 0) {
      return unavailableEvidence({
        slug,
        code: target.code,
        network: "Solana",
        reason: "provider_error",
        detail: "Price temporarily unavailable",
      });
    }
    store(slug, evidence);
    return evidence;
  }

  const identity = slugIdentity(slug);
  const knownSuffix = ["-on-stellar", "-on-solana", "-on-base", "-on-ethereum"].some((s) => slug.endsWith(s));
  const reason: PriceUnavailableReason = knownSuffix ? "no_verified_feed" : "unsupported_asset";
  return unavailableEvidence({
    slug,
    code: identity.code,
    network: identity.network,
    reason,
    detail:
      reason === "no_verified_feed"
        ? "No verified price feed for this asset and network"
        : "No verified price feed — unknown asset",
  });
}
