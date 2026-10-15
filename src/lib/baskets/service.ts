import "server-only";
import { isDatabaseUnavailableError } from "@/db";
import { listCircles } from "@/lib/data/circles";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import {
  BASKETS,
  DISCOVERY_ONLY_DISCLOSURE,
  getBasketDef,
  validateBasketDef,
  weightPercent,
  type BasketDef,
} from "@/lib/baskets/config";

/**
 * Basket resolution — members resolved live against the asset registry.
 * Unknown slugs are reported as unresolved, never invented. Registry truth
 * (code, issuer, network, category, eligibility, state) flows through
 * untouched: a basket never overrides individual asset eligibility, and no
 * basket-level AVAILABLE state is derived from membership.
 */

export type BasketMember = {
  slug: string;
  code: string;
  name: string;
  issuer: string;
  network: string;
  ecosystem: string;
  ecosystemLabel: string;
  category: string;
  assetClassLabel: string;
  eligibilityNote: string;
  state: string;
  stateLabel: string;
  /** Verified execution routes (engine-available vicus/connected actions). Empty means discovery only. */
  routes: string[];
  sourceUrl: string | null;
  weightBps: number;
  weightLabel: string;
  openHref: string;
};

export type BasketUnresolved = {
  slug: string;
  reason: string;
};

export type ResolvedBasket = {
  def: BasketDef;
  members: BasketMember[];
  unresolved: BasketUnresolved[];
  /** True only when every constituent resolved. */
  complete: boolean;
  disclosure: typeof DISCOVERY_ONLY_DISCLOSURE;
};

export type BasketSummary = {
  slug: string;
  name: string;
  theme: string;
  memberCount: number;
  memberCodes: string[];
  version: number;
};

/** Short labels for engine-verified execution. Official/guide flows are
 * information or issuer flows, not Vicus execution — excluded by design. */
const ROUTE_LABELS: Record<string, string> = {
  send: "Stellar Send",
  move: "CCTP Move",
  access: "Access route",
  swap: "Swap",
  exit: "Exit",
  borrow: "Borrow",
};

/** Verified execution routes for one member, or [] (discovery only). */
async function memberRoutes(slug: string, network: string): Promise<string[]> {
  const actions = await resolveAssetActions(slug, network).catch(() => []);
  const routes: string[] = [];
  for (const action of actions) {
    if (action.state !== "available") continue;
    if (action.executionMode !== "vicus" && action.executionMode !== "connected") continue;
    const label = ROUTE_LABELS[action.kind];
    if (label && !routes.includes(label)) routes.push(label);
  }
  return routes;
}

export class BasketsError extends Error {
  constructor(
    public readonly code: "not-found" | "invalid-definition" | "invalid-input" | "unauthorized",
    message: string,
    public readonly httpStatus = code === "not-found" ? 404 : code === "invalid-input" || code === "unauthorized" ? 400 : 500,
  ) {
    super(message);
  }
}

export function toBasketSummary(def: BasketDef, codes: string[]): BasketSummary {
  return {
    slug: def.slug,
    name: def.name,
    theme: def.theme,
    memberCount: def.constituents.length,
    memberCodes: [...codes].sort(),
    version: def.version,
  };
}

export async function listBaskets(): Promise<BasketSummary[]> {
  const circles = await listCircles(null).catch(() => []);
  const bySlug = new Map(circles.map((circle) => [circle.slug, circle]));
  return [...BASKETS]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((def) =>
      toBasketSummary(
        def,
        def.constituents.flatMap((constituent) => {
          const circle = bySlug.get(constituent.slug);
          return circle ? [circle.code] : [];
        }),
      ),
    );
}

export async function resolveBasket(slug: string): Promise<ResolvedBasket> {
  const def = getBasketDef(slug);
  if (!def) {
    throw new BasketsError("not-found", "That basket could not be found.", 404);
  }
  return resolveBasketDef(def);
}

/** Resolve any validated def (curated or user-owned) against the registry. */
export async function resolveBasketDef(def: BasketDef): Promise<ResolvedBasket> {
  const validated = validateBasketDef(def);
  if (!validated.ok) {
    throw new BasketsError("invalid-definition", "That basket definition is invalid.", 500);
  }
  let circles: Awaited<ReturnType<typeof listCircles>>;
  try {
    circles = await listCircles(null);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    throw error;
  }
  const bySlug = new Map(circles.map((circle) => [circle.slug, circle]));
  const members: BasketMember[] = [];
  const unresolved: BasketUnresolved[] = [];
  for (const constituent of def.constituents) {
    const circle = bySlug.get(constituent.slug);
    if (!circle) {
      unresolved.push({ slug: constituent.slug, reason: "Not in the asset registry." });
      continue;
    }
    members.push({
      slug: circle.slug,
      code: circle.code,
      name: circle.name,
      issuer: circle.issuerSource,
      network: circle.network,
      ecosystem: circle.ecosystem,
      ecosystemLabel: circle.ecosystemLabel,
      category: circle.category,
      assetClassLabel: circle.assetClassLabel ?? circle.category,
      eligibilityNote: circle.eligibilityNote,
      state: circle.state,
      stateLabel: circle.stateLabel,
      routes: await memberRoutes(circle.slug, circle.network),
      sourceUrl: circle.sourceUrl || null,
      weightBps: constituent.weightBps,
      weightLabel: weightPercent(constituent.weightBps),
      openHref: `/circles/${circle.slug}`,
    });
  }
  // Deterministic member order: weight descending, then code.
  members.sort((a, b) => b.weightBps - a.weightBps || a.code.localeCompare(b.code));
  return {
    def,
    members,
    unresolved,
    complete: unresolved.length === 0 && members.length > 0,
    disclosure: DISCOVERY_ONLY_DISCLOSURE,
  };
}
