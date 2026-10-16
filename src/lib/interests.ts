/**
 * First-visit interest onboarding — pure, client-safe definitions.
 *
 * Interests map ONLY onto real registry categories (see
 * `assetClassLabels` in lib/data/circles). Every interest must resolve to
 * at least one catalogue asset or it must not ship. Interests never imply
 * suitability, eligibility, or ownership — they only order discovery.
 */

export const ONBOARDED_KEY = "vicus.onboarded.v1";
export const INTERESTS_KEY = "vicus.interests.v1";

export type InterestVisual =
  | { type: "brand"; src: string; alt: string }
  | { type: "glyph"; name: "compass" | "coins" | "building" | "shield" };

export type InterestDef = {
  key: string;
  label: string;
  blurb: string;
  /** Registry categories that count as a match. */
  categories: string[];
  visual: InterestVisual;
};

export const INTERESTS: readonly InterestDef[] = [
  {
    key: "stocks",
    label: "Stocks & companies",
    blurb: "Apple, Tesla, Nvidia and equity funds — each labeled by issuer and network.",
    categories: ["equity_fund"],
    visual: { type: "brand", src: "/assets/brands/apple-owner.jpeg", alt: "" },
  },
  {
    key: "stables",
    label: "Stablecoins",
    blurb: "Dollar tokens from Circle, PayPal and beyond — starting on Stellar.",
    categories: ["stablecoin"],
    visual: { type: "brand", src: "/assets/brands/circle-usdc.svg", alt: "" },
  },
  {
    key: "funds",
    label: "Tokenized funds",
    blurb: "Regulated money-market funds recorded onchain.",
    categories: ["treasury_fund"],
    visual: { type: "brand", src: "/assets/brands/wisdomtree.png", alt: "" },
  },
  {
    key: "bonds",
    label: "Treasury & bonds",
    blurb: "Short-term Treasury and inflation-protected exposure.",
    categories: ["fixed_income"],
    visual: { type: "glyph", name: "shield" },
  },
];

/** Known keys only — unknown stored values are dropped, never honored. */
export function sanitizeInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(INTERESTS.map((entry) => entry.key));
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && known.has(entry)))];
}

/** Category set covered by the given interest keys. */
export function categoriesFor(keys: string[]): Set<string> {
  const out = new Set<string>();
  for (const key of sanitizeInterests(keys)) {
    const def = INTERESTS.find((entry) => entry.key === key);
    def?.categories.forEach((category) => out.add(category));
  }
  return out;
}

/**
 * Stable interest-first ordering that preserves Stellar-first grouping:
 * the caller partitions by ecosystem first; within each partition, matches
 * sort before non-matches with original order as tie-break. Unselected
 * assets are never removed — only deprioritized.
 */
export function rankByInterests<T>(
  items: readonly T[],
  matches: (item: T, index: number) => boolean,
): T[] {
  return items
    .map((item, index) => ({ item, index, hit: matches(item, index) }))
    .sort((a, b) => Number(b.hit) - Number(a.hit) || a.index - b.index)
    .map((entry) => entry.item);
}
