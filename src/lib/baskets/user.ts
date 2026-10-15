import "server-only";
import { and, desc, eq, or } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError } from "@/db";
import { userBaskets } from "@/db/schema";
import { listCircles } from "@/lib/data/circles";
import {
  BASKET_WEIGHT_TOTAL_BPS,
  validateBasketDef,
  type BasketConstituentDef,
} from "@/lib/baskets/config";
import { BasketsError, resolveBasketDef, type ResolvedBasket } from "@/lib/baskets/service";

/**
 * User-owned baskets (P5.2) — discovery-only personal themes.
 * Ownership always derives from the authenticated session: every read and
 * write is owner-scoped, and nothing here acquires assets, spends funds,
 * or creates holdings.
 */

export type CreateBasketInput = {
  name: unknown;
  theme: unknown;
  rationale: unknown;
  constituents: unknown;
};

export type UserBasketView = {
  id: string;
  slug: string;
  name: string;
  theme: string;
  rationale: string;
  constituents: BasketConstituentDef[];
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
};

function iso(value: Date | null): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function cleanText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "basket";
}

function mapRow(row: typeof userBaskets.$inferSelect): UserBasketView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    theme: row.theme,
    rationale: row.rationale,
    constituents: Array.isArray(row.constituents) ? row.constituents : [],
    source: row.source,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function requireUserId(userId: string | null | undefined): string {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new BasketsError("unauthorized", "Sign in to manage baskets.", 401);
  }
  return userId;
}

/**
 * Create a personal basket. Constituents must ALL resolve against the live
 * registry — unknown assets are rejected at creation (reads later degrade
 * honestly via `unresolved` instead).
 */
export async function createUserBasket(
  userId: string | null | undefined,
  input: CreateBasketInput,
): Promise<UserBasketView> {
  const owner = requireUserId(userId);
  const name = cleanText(input.name, 3, 80);
  const theme = cleanText(input.theme, 10, 500);
  const rationale = cleanText(input.rationale, 10, 1000);
  if (!name || !theme || !rationale) {
    throw new BasketsError("invalid-input", "Name, theme, and rationale are required (3–80 / 10–500 / 10–1000 chars).", 400);
  }
  if (!Array.isArray(input.constituents) || input.constituents.length === 0 || input.constituents.length > 12) {
    throw new BasketsError("invalid-input", "Choose between 1 and 12 constituent assets.", 400);
  }
  const constituents: BasketConstituentDef[] = [];
  for (const entry of input.constituents) {
    if (!entry || typeof entry !== "object") {
      throw new BasketsError("invalid-input", "Each constituent needs an asset and a weight.", 400);
    }
    const { slug, weightBps } = entry as { slug?: unknown; weightBps?: unknown };
    if (typeof slug !== "string" || slug.trim().length === 0) {
      throw new BasketsError("invalid-input", "Each constituent needs a real catalogue asset.", 400);
    }
    constituents.push({ slug: slug.trim(), weightBps: weightBps as number });
  }
  const validated = validateBasketDef({
    slug: "draft",
    name,
    theme,
    rationale,
    constituents,
    sourceUrl: "",
    version: 1,
  });
  if (!validated.ok) {
    const reasons: Record<string, string> = {
      "duplicate-constituent": "Remove duplicate assets.",
      "bad-weight": "Weights must be positive whole basis points.",
      "bad-total": `Weights must total exactly ${BASKET_WEIGHT_TOTAL_BPS} basis points (100%).`,
      "unknown-shape": "The basket submission was malformed.",
    };
    throw new BasketsError("invalid-input", reasons[validated.issues[0]!] ?? "That basket is invalid.", 400);
  }
  const database = getDatabase();
  const circles = await listCircles(null).catch(() => []);
  const known = new Set(circles.map((circle) => circle.slug));
  const unknown = constituents.filter((c) => !known.has(c.slug));
  if (unknown.length > 0) {
    throw new BasketsError("invalid-input", `Unknown catalogue assets: ${unknown.map((c) => c.slug).join(", ")}.`, 400);
  }
  const base = slugify(name);
  const existing = await database
    .select({ slug: userBaskets.slug })
    .from(userBaskets)
    .where(eq(userBaskets.ownerUserId, owner));
  const taken = new Set(existing.map((row) => row.slug));
  let slug = base;
  for (let attempt = 2; taken.has(slug) && attempt < 100; attempt += 1) {
    slug = `${base}-${attempt}`;
  }
  if (taken.has(slug)) {
    throw new BasketsError("invalid-input", "That basket name is already used. Pick another.", 400);
  }
  try {
    const [row] = await database
      .insert(userBaskets)
      .values({ ownerUserId: owner, slug, name, theme, rationale, constituents })
      .returning();
    if (!row) throw new BasketsError("invalid-input", "That basket could not be saved.", 400);
    return mapRow(row);
  } catch (error) {
    if (error instanceof BasketsError) throw error;
    if (isDatabaseUnavailableError(error)) throw error;
    throw new BasketsError("invalid-input", "That basket could not be saved.", 400);
  }
}

export async function listMyBaskets(userId: string | null | undefined): Promise<UserBasketView[]> {
  const owner = requireUserId(userId);
  const database = getDatabase();
  const rows = await database
    .select()
    .from(userBaskets)
    .where(eq(userBaskets.ownerUserId, owner))
    .orderBy(desc(userBaskets.createdAt));
  return rows.map(mapRow);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function getMyBasket(
  userId: string | null | undefined,
  ref: string,
): Promise<UserBasketView | null> {
  const owner = requireUserId(userId);
  const normalized = typeof ref === "string" ? ref.trim() : "";
  if (!normalized) return null;
  const database = getDatabase();
  const conditions = [eq(userBaskets.ownerUserId, owner)];
  const matchers = [eq(userBaskets.slug, normalized)];
  if (UUID_RE.test(normalized)) matchers.push(eq(userBaskets.id, normalized));
  const [row] = await database
    .select()
    .from(userBaskets)
    .where(and(...conditions, or(...matchers)))
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Resolve an owned basket through the same registry truth as curated themes. */
export async function resolveMyBasket(
  userId: string | null | undefined,
  ref: string,
): Promise<ResolvedBasket> {
  const owner = requireUserId(userId);
  const basket = await getMyBasket(owner, ref);
  if (!basket) {
    throw new BasketsError("not-found", "That basket could not be found.", 404);
  }
  return resolveBasketDef({
    slug: basket.slug,
    name: basket.name,
    theme: basket.theme,
    rationale: basket.rationale,
    constituents: basket.constituents,
    sourceUrl: "",
    version: 1,
  });
}
