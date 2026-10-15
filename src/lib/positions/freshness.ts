/**
 * P4.1 Connected-holdings truth — freshness model.
 *
 * Client-safe pure helpers (no I/O, no imports): every holdings view gets an
 * explicit, deterministic freshness state derived from the server-reported
 * read time. Nothing here invents balances — it only labels how old the
 * evidence is.
 */

export const POSITIONS_FRESHNESS_MS = 5 * 60 * 1000;

export type FreshnessState = "fresh" | "stale" | "unknown";

/**
 * Deterministic freshness: fresh only when a trustworthy read timestamp
 * exists, is within policy, and no failure has superseded it. Anything
 * else is stale (old evidence retained + labeled) or unknown (no evidence).
 * A failed refresh must NEVER silently present old data as fresh.
 */
export function getFreshness(
  nowMs: number,
  readAtIso: string | null | undefined,
  hadFailureSinceRead: boolean,
): FreshnessState {
  if (!readAtIso) return "unknown";
  const readMs = Date.parse(readAtIso);
  if (!Number.isFinite(readMs) || readMs > nowMs + 60_000) return "unknown";
  if (hadFailureSinceRead) return "stale";
  if (nowMs - readMs > POSITIONS_FRESHNESS_MS) return "stale";
  return "fresh";
}

/** Short local time for read receipts; "—" when the timestamp is unusable. */
export function formatReadTime(readAtIso: string | null | undefined): string {
  if (!readAtIso) return "—";
  const ms = Date.parse(readAtIso);
  if (!Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Abbreviated wallet for source identity chips. Never a balance. */
export function abbreviateWallet(address: string | null | undefined): string {
  if (!address || address.length < 10) return "—";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
