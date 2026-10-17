import { INTERESTS } from "@/lib/interests";

/**
 * P7.3 — Explainable social-discovery ordering (pure, no I/O).
 *
 * Precedence is fixed and documented: explicit search > explicit interest
 * filter > watched-by-you > live activity > quiet (alphabetical). Nothing
 * is ever hidden by preference — interests and watches only order.
 * Signed-out viewers get activity order. No scores, no engagement
 * farming: raw counts never rank, only presence of real records.
 * Wallet status is never an input (P7.2).
 */

export type DiscoverableCircle = {
  slug: string;
  code: string;
  name: string;
  issuer: string;
  category: string;
  watched: boolean;
  /** True when the circle has any live signal (questions, theses, contributors, campaigns). */
  active: boolean;
};

export type RankedCircle<T extends DiscoverableCircle> = {
  circle: T;
  /** Human-readable, auditable reasons in precedence order. */
  reasons: string[];
};

const INTEREST_LABELS: Record<string, string> = Object.fromEntries(
  INTERESTS.map((interest) => [interest.key, interest.label]),
);

export function interestLabel(key: string): string | null {
  return INTEREST_LABELS[key] ?? null;
}

export function interestCategories(key: string): string[] {
  return INTERESTS.find((interest) => interest.key === key)?.categories ?? [];
}

/** Search matches code, name, or issuer (case-insensitive). Filters, never ranks. */
export function matchesDiscoveryQuery(circle: DiscoverableCircle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    circle.code.toLowerCase().includes(q) ||
    circle.name.toLowerCase().includes(q) ||
    circle.issuer.toLowerCase().includes(q)
  );
}

export function rankCircles<T extends DiscoverableCircle>(
  items: readonly T[],
  opts: { interest?: string | null; query?: string | null } = {},
): RankedCircle<T>[] {
  const query = (opts.query ?? "").trim();
  const interestKey = (opts.interest ?? "").trim();
  const categories = new Set(interestCategories(interestKey));
  const interestKnown = interestKey !== "" && categories.size > 0;

  return items
    .filter((circle) => matchesDiscoveryQuery(circle, query))
    .map((circle) => {
      const reasons: string[] = [];
      let tier = 3;
      if (circle.watched) {
        tier = 0;
        reasons.push("Watched by you");
      } else if (interestKnown && categories.has(circle.category)) {
        tier = 1;
        const label = interestLabel(interestKey);
        reasons.push(label ? `Matches your ${label} interest` : "Matches your interest");
      } else if (circle.active) {
        tier = 2;
        reasons.push("Active discussion");
      }
      return { circle, reasons, tier };
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.circle.slug < b.circle.slug ? -1 : a.circle.slug > b.circle.slug ? 1 : 0),
    )
    .map(({ circle, reasons }) => ({ circle, reasons }));
}
