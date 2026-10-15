import "server-only";

/**
 * Vicus Baskets V1 (P5.1) — discovery-only themed asset sets.
 *
 * Config-only read model following the subjects precedent: membership always
 * resolves live against the asset registry, so nothing here can drift from
 * source truth. No migration, no new tables, no holdings, no execution.
 *
 * Weights are integers in basis points summing to exactly 10_000. They are
 * illustrative composition only — equal splits by editorial choice, never an
 * allocation instruction, holding, or performance claim.
 */

export const BASKET_WEIGHT_TOTAL_BPS = 10_000 as const;

export const DISCOVERY_ONLY_DISCLOSURE =
  "Discovery only — not investable. Vicus baskets are editorial themes for exploring real assets, not holdings, allocations, or investment advice. Inclusion never implies you can acquire, transfer, redeem, or hold a constituent." as const;

export type BasketConstituentDef = {
  /** Exact circle slug; resolved against the live registry (missing = skipped). */
  slug: string;
  /** Illustrative weight in basis points. */
  weightBps: number;
};

export type BasketDef = {
  /** Stable identifier, URL-safe. */
  slug: string;
  name: string;
  /** Investment-theme explanation — editorial, never advice. */
  theme: string;
  /** Why these assets belong together. */
  rationale: string;
  constituents: BasketConstituentDef[];
  sourceUrl: string;
  version: number;
};

export const BASKETS: readonly BasketDef[] = [
  {
    slug: "stellar-money-funds",
    name: "Stellar money funds",
    theme: "U.S.-registered government money funds recorded on Stellar.",
    rationale:
      "BENJI and WTGXX are both money-market funds whose shares are recorded on Stellar. Grouped for comparing two regulated cash-like onchain options side by side.",
    constituents: [
      { slug: "benji-on-stellar", weightBps: 5000 },
      { slug: "wtgxx-on-stellar", weightBps: 5000 },
    ],
    sourceUrl: "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX",
    version: 1,
  },
  {
    slug: "stellar-short-duration",
    name: "Stellar short duration",
    theme: "Short-term U.S. Treasury exposure on Stellar, nominal and inflation-protected.",
    rationale:
      "WTSYX and TIPSX are both short-duration Treasury funds on Stellar — one nominal, one inflation-protected. Grouped for comparing the two approaches.",
    constituents: [
      { slug: "wtsyx-on-stellar", weightBps: 5000 },
      { slug: "tipsx-on-stellar", weightBps: 5000 },
    ],
    sourceUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
    version: 1,
  },
  {
    slug: "apple-representations",
    name: "Apple, both ways",
    theme: "Two non-interchangeable onchain representations of Apple exposure.",
    rationale:
      "AAPLx (Solana, Backed) and AAPLc (Base, Coinbase) track Apple through different issuers, networks, contracts, and restrictions. Grouped to make the differences — not interchangeability — visible.",
    constituents: [
      { slug: "aaplx-on-solana", weightBps: 5000 },
      { slug: "aaplc-on-base", weightBps: 5000 },
    ],
    sourceUrl: "https://www.base.org/stocks",
    version: 1,
  },
  {
    slug: "stellar-dollar-liquidity",
    name: "Stellar dollar liquidity",
    theme: "Dollar-denominated tokens on Stellar from distinct issuers.",
    rationale:
      "USDC (Circle) and PYUSD (PayPal) are both dollar tokens on Stellar from different issuers with different redemption rails. Grouped for comparing dollar options.",
    constituents: [
      { slug: "usdc-on-stellar", weightBps: 5000 },
      { slug: "pyusd-on-stellar", weightBps: 5000 },
    ],
    sourceUrl: "https://developers.stellar.org/docs/learn/fundamentals/stellar-usdc",
    version: 1,
  },
];

export type BasketDefIssue =
  | "duplicate-slug"
  | "duplicate-constituent"
  | "unknown-shape"
  | "bad-weight"
  | "bad-total";

/**
 * Pure structural validation. Registry existence is NOT checked here — the
 * resolver reports unresolved members at read time instead.
 */
export function validateBasketDef(def: BasketDef): { ok: true } | { ok: false; issues: BasketDefIssue[] } {
  const issues: BasketDefIssue[] = [];
  if (!def || typeof def.slug !== "string" || !def.name || !Array.isArray(def.constituents) || def.constituents.length === 0) {
    return { ok: false, issues: ["unknown-shape"] };
  }
  const seen = new Set<string>();
  let total = 0;
  for (const constituent of def.constituents) {
    if (!constituent || typeof constituent.slug !== "string" || constituent.slug.length === 0) {
      issues.push("unknown-shape");
      continue;
    }
    if (seen.has(constituent.slug)) issues.push("duplicate-constituent");
    seen.add(constituent.slug);
    if (!Number.isInteger(constituent.weightBps) || constituent.weightBps <= 0) {
      issues.push("bad-weight");
      continue;
    }
    total += constituent.weightBps;
  }
  if (total !== BASKET_WEIGHT_TOTAL_BPS) issues.push("bad-total");
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/** Seeded defs must themselves be structurally valid (checked in tests). */
export function validateSeededBaskets(): { slug: string; issues: BasketDefIssue[] }[] {
  const problems: { slug: string; issues: BasketDefIssue[] }[] = [];
  const seenSlugs = new Set<string>();
  for (const def of BASKETS) {
    if (seenSlugs.has(def.slug)) {
      problems.push({ slug: def.slug, issues: ["duplicate-slug"] });
      continue;
    }
    seenSlugs.add(def.slug);
    const result = validateBasketDef(def);
    if (!result.ok) problems.push({ slug: def.slug, issues: result.issues });
  }
  return problems;
}

export function getBasketDef(slug: string): BasketDef | null {
  const normalized = typeof slug === "string" ? slug.trim() : "";
  if (!normalized) return null;
  return BASKETS.find((def) => def.slug === normalized) ?? null;
}

/** Display weight as a plain percent string from basis points. */
export function weightPercent(weightBps: number): string {
  return `${(weightBps / 100).toFixed(weightBps % 100 === 0 ? 0 : 2)}%`;
}
