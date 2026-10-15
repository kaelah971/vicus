import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { basketWatches } from "@/db/schema";
import { getBasketDef } from "@/lib/baskets/config";
import { getMyBasket } from "@/lib/baskets/user";
import { BasketsError } from "@/lib/baskets/service";

/**
 * Basket watches (P5.2) — track a theme for discovery, nothing more.
 * Mirrors the circle-watch pattern: owner-scoped rows, soft unwatch via
 * leftAt, unknown refs rejected. Watching never implies ownership,
 * allocation, alerts, or execution.
 */

export const BASKET_KINDS = ["curated", "user"] as const;

export type BasketKind = (typeof BASKET_KINDS)[number];

export type WatchedBasketRef = {
  kind: BasketKind;
  ref: string;
};

function requireUserId(userId: string | null | undefined): string {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new BasketsError("unauthorized", "Sign in to watch baskets.", 401);
  }
  return userId;
}

function normalizeKind(kind: unknown): BasketKind | null {
  return kind === "curated" || kind === "user" ? kind : null;
}

function normalizeRef(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const trimmed = ref.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return null;
  return trimmed;
}

/**
 * The referenced basket must exist AND be visible to this user: curated
 * themes are public; user baskets resolve owner-scoped (another user's
 * basket is invisible here, exactly like anywhere else).
 */
async function resolveVisibleBasket(userId: string, kind: BasketKind, ref: string): Promise<boolean> {
  if (kind === "curated") return getBasketDef(ref) !== null;
  return (await getMyBasket(userId, ref)) !== null;
}

export async function watchBasket(
  userId: string | null | undefined,
  kind: unknown,
  ref: unknown,
): Promise<boolean | null> {
  const owner = requireUserId(userId);
  const cleanKind = normalizeKind(kind);
  const cleanRef = normalizeRef(ref);
  if (!cleanKind || !cleanRef) return null;
  if (!(await resolveVisibleBasket(owner, cleanKind, cleanRef))) return null;
  const database = getDatabase();
  const [existing] = await database
    .select({ id: basketWatches.id })
    .from(basketWatches)
    .where(
      and(
        eq(basketWatches.userId, owner),
        eq(basketWatches.basketKind, cleanKind),
        eq(basketWatches.basketRef, cleanRef),
      ),
    )
    .limit(1);
  if (existing) {
    await database
      .update(basketWatches)
      .set({ leftAt: null })
      .where(eq(basketWatches.id, existing.id));
  } else {
    await database.insert(basketWatches).values({ userId: owner, basketKind: cleanKind, basketRef: cleanRef });
  }
  return true;
}

export async function unwatchBasket(
  userId: string | null | undefined,
  kind: unknown,
  ref: unknown,
): Promise<boolean | null> {
  const owner = requireUserId(userId);
  const cleanKind = normalizeKind(kind);
  const cleanRef = normalizeRef(ref);
  if (!cleanKind || !cleanRef) return null;
  const database = getDatabase();
  await database
    .update(basketWatches)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(basketWatches.userId, owner),
        eq(basketWatches.basketKind, cleanKind),
        eq(basketWatches.basketRef, cleanRef),
        isNull(basketWatches.leftAt),
      ),
    );
  return false;
}

export async function listWatchedBaskets(userId: string | null | undefined): Promise<WatchedBasketRef[]> {
  const owner = requireUserId(userId);
  const database = getDatabase();
  const rows = await database
    .select({ kind: basketWatches.basketKind, ref: basketWatches.basketRef })
    .from(basketWatches)
    .where(and(eq(basketWatches.userId, owner), isNull(basketWatches.leftAt)));
  return rows.flatMap((row) => {
    const kind = normalizeKind(row.kind);
    const ref = normalizeRef(row.ref);
    return kind && ref ? [{ kind, ref }] : [];
  });
}

export async function isBasketWatched(
  userId: string | null | undefined,
  kind: unknown,
  ref: unknown,
): Promise<boolean> {
  const owner = requireUserId(userId);
  const cleanKind = normalizeKind(kind);
  const cleanRef = normalizeRef(ref);
  if (!cleanKind || !cleanRef) return false;
  const database = getDatabase();
  const [row] = await database
    .select({ id: basketWatches.id })
    .from(basketWatches)
    .where(
      and(
        eq(basketWatches.userId, owner),
        eq(basketWatches.basketKind, cleanKind),
        eq(basketWatches.basketRef, cleanRef),
        isNull(basketWatches.leftAt),
      ),
    )
    .limit(1);
  return !!row;
}
