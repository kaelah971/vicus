/**
 * P6.3 — Deterministic loyalty rules (pure, no I/O).
 *
 * Only approved mission submissions count, each at most once (keyed by
 * submission id). Pending / needs_revision / rejected submissions earn
 * nothing. XP reuses existing approved mission points — no competing
 * balance, no persisted ledger, nothing tradable. A submission that
 * leaves the approved state simply stops contributing the next time the
 * read model runs, so revoked participation can never persist as earned.
 *
 * Time is UTC calendar days, documented and tested at the boundaries.
 * Levels are recognition only: they imply no monetary value, token
 * ownership, or financial eligibility.
 */

export type LoyaltyEvent = {
  /** Stable source id (mission submission id) — one event counts once. */
  id: string;
  points: number;
  /** Participation instant (approval time, else submission time). */
  at: Date;
};

export type LoyaltyLevel = {
  name: string;
  minXp: number;
};

export const LOYALTY_LEVELS: readonly LoyaltyLevel[] = [
  { name: "Explorer", minXp: 0 },
  { name: "Contributor", minXp: 100 },
  { name: "Advocate", minXp: 250 },
  { name: "Steward", minXp: 500 },
];

/** UTC calendar day key: 2026-10-16. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(aDay: string, bDay: string): number {
  const ms = Date.parse(`${bDay}T00:00:00.000Z`) - Date.parse(`${aDay}T00:00:00.000Z`);
  return Math.round(ms / 86_400_000);
}

export type LoyaltyProgress = {
  xp: number;
  level: LoyaltyLevel;
  levelIndex: number;
  nextLevel: LoyaltyLevel | null;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP needed to reach the next level (0 when maxed). */
  xpForNext: number;
  /** Consecutive active UTC days ending today or yesterday (0 when lapsed). */
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  lastActiveDay: string | null;
  eventCount: number;
};

function levelFor(xp: number): { level: LoyaltyLevel; index: number; next: LoyaltyLevel | null } {
  let index = 0;
  for (let i = 0; i < LOYALTY_LEVELS.length; i++) {
    if (xp >= LOYALTY_LEVELS[i]!.minXp) index = i;
  }
  return { level: LOYALTY_LEVELS[index]!, index, next: LOYALTY_LEVELS[index + 1] ?? null };
}

export function computeLoyalty(events: LoyaltyEvent[], now: Date = new Date()): LoyaltyProgress {
  const seen = new Set<string>();
  const valid = events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return (
      typeof event.points === "number" &&
      Number.isFinite(event.points) &&
      event.points > 0 &&
      event.at instanceof Date &&
      !Number.isNaN(event.at.getTime())
    );
  });
  const xp = valid.reduce((total, event) => total + event.points, 0);
  const { level, index, next } = levelFor(xp);

  const days = [...new Set(valid.map((event) => utcDayKey(event.at)))].sort();
  const today = utcDayKey(now);
  let currentStreak = 0;
  if (days.length > 0) {
    const last = days[days.length - 1]!;
    const gap = daysBetween(last, today);
    if (gap <= 1) {
      currentStreak = 1;
      for (let i = days.length - 1; i > 0; i--) {
        if (daysBetween(days[i - 1]!, days[i]!) === 1) currentStreak += 1;
        else break;
      }
    }
  }
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev !== null && daysBetween(prev, day) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = day;
  }

  return {
    xp,
    level,
    levelIndex: index,
    nextLevel: next,
    xpIntoLevel: xp - level.minXp,
    xpForNext: next ? next.minXp - xp : 0,
    currentStreak,
    longestStreak,
    activeDays: days.length,
    lastActiveDay: days.length > 0 ? days[days.length - 1]! : null,
    eventCount: valid.length,
  };
}

/** Deterministic recent-first ordering for activity lists. */
export function orderLoyaltyEvents(events: LoyaltyEvent[]): LoyaltyEvent[] {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
