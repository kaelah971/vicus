/**
 * P1.3 — Trustworthy price evidence model.
 *
 * Four price types are modeled separately and NEVER conflated:
 * - token_market: observed market price for a specific token + network.
 * - underlying_reference: price of the company share / instrument a token
 *   references (e.g. AAPL equity) — never the token's own price.
 * - indicative_quote: a live venue's estimate for a specific swap size,
 *   direction, and quote time — never an executable guarantee.
 * - issuer_nav: an issuer-published value (e.g. stable $1 fund NAV) —
 *   never an exchange-traded price.
 *
 * UNKNOWN stays UNKNOWN: anything without a verified feed resolves to
 * status "unavailable" with an explicit reason. No fabricated values,
 * histories, volumes, or valuations exist anywhere in this module.
 */

export const PRICE_TYPES = [
  "token_market",
  "underlying_reference",
  "indicative_quote",
  "issuer_nav",
] as const;

export type PriceType = (typeof PRICE_TYPES)[number];

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  token_market: "Token market price",
  underlying_reference: "Underlying reference price",
  indicative_quote: "Indicative swap quote",
  issuer_nav: "Issuer-reported value",
};

export type PriceFreshness = "live" | "stale" | "reference" | "unavailable";

export const PRICE_UNAVAILABLE_REASONS = [
  "no_verified_feed",
  "unsupported_asset",
  "venue_gated",
  "provider_error",
] as const;

export type PriceUnavailableReason = (typeof PRICE_UNAVAILABLE_REASONS)[number];

export const PRICE_REASON_COPY: Record<PriceUnavailableReason, string> = {
  no_verified_feed: "No verified price feed",
  unsupported_asset: "No verified price feed",
  venue_gated: "No verified price feed — venue gated",
  provider_error: "Price temporarily unavailable",
};

export type PriceSource = {
  /** Short provider name, e.g. "Jupiter", "Franklin Templeton". */
  name: string;
  /** Official provider / document URL. */
  url: string;
};

export type PriceObservation = {
  /** ISO-8601 observation timestamp. */
  t: string;
  value: number;
};

export type PriceEvidence = {
  slug: string;
  code: string;
  network: string;
  status: "available" | "unavailable";
  priceType: PriceType | null;
  /** Numeric value in `currency` units. Null when unavailable. */
  value: number | null;
  /** Denomination code, e.g. "USDC" or "USD". Null when unavailable. */
  currency: string | null;
  source: PriceSource | null;
  /** When the provider observed the value. Null when unavailable. */
  observedAt: string | null;
  /** When Vicus retrieved / composed this evidence. */
  retrievedAt: string;
  freshness: PriceFreshness;
  /** One honest human sentence, e.g. "Indicative 25-USDC swap quote". */
  detail: string;
  reason: PriceUnavailableReason | null;
  /** Verified historical observations. Empty = no verified chart. */
  series: PriceObservation[];
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/**
 * Validate an evidence object. Returns human-readable problems (empty =
 * valid). Guards the UNKNOWN-must-remain-unknown rule at the boundary:
 * available evidence needs a finite positive value, a currency, a source,
 * both timestamps, and a known type; unavailable evidence must carry NO
 * value and a reason.
 */
export function validateEvidence(evidence: PriceEvidence): string[] {
  const problems: string[] = [];
  if (!evidence.slug || !evidence.code || !evidence.network) {
    problems.push("asset identity incomplete");
  }
  if (!isIsoDate(evidence.retrievedAt)) problems.push("retrievedAt missing");
  if (!Array.isArray(evidence.series)) {
    problems.push("series must be an array");
  } else {
    for (const point of evidence.series) {
      if (!isIsoDate(point.t) || !Number.isFinite(point.value) || point.value <= 0) {
        problems.push("series holds an invalid observation");
        break;
      }
    }
  }
  if (evidence.status === "available") {
    if (!evidence.priceType || !(PRICE_TYPES as readonly string[]).includes(evidence.priceType)) {
      problems.push("available evidence needs a known price type");
    }
    if (!Number.isFinite(evidence.value) || (evidence.value as number) <= 0) {
      problems.push("available evidence needs a finite positive value");
    }
    if (!evidence.currency) problems.push("available evidence needs a currency");
    if (!evidence.source?.name || !evidence.source?.url) problems.push("available evidence needs a named source");
    if (!isIsoDate(evidence.observedAt)) problems.push("available evidence needs an observed timestamp");
    if (evidence.reason !== null) problems.push("available evidence must not carry an unavailable reason");
    if (evidence.freshness === "unavailable") problems.push("available evidence must not be marked unavailable");
  } else {
    if (evidence.value !== null) problems.push("unavailable evidence must not carry a value");
    if (evidence.priceType !== null) problems.push("unavailable evidence must not claim a price type");
    if (!evidence.reason || !(PRICE_UNAVAILABLE_REASONS as readonly string[]).includes(evidence.reason)) {
      problems.push("unavailable evidence needs a known reason");
    }
    if (evidence.freshness !== "unavailable") problems.push("unavailable evidence must be marked unavailable");
  }
  return problems;
}

/** Build a well-formed unavailable evidence object (single constructor). */
export function unavailableEvidence(args: {
  slug: string;
  code: string;
  network: string;
  reason: PriceUnavailableReason;
  detail: string;
  retrievedAt?: string;
}): PriceEvidence {
  return {
    slug: args.slug,
    code: args.code,
    network: args.network,
    status: "unavailable",
    priceType: null,
    value: null,
    currency: null,
    source: null,
    observedAt: null,
    retrievedAt: args.retrievedAt ?? new Date().toISOString(),
    freshness: "unavailable",
    detail: args.detail,
    reason: args.reason,
    series: [],
  };
}
