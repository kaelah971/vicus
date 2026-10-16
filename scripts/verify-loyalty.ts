import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, gt, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { missionSubmissions, missions, users } from "../src/db/schema";
import {
  computeLoyalty,
  LOYALTY_LEVELS,
  orderLoyaltyEvents,
  type LoyaltyEvent,
} from "../src/lib/loyalty/rules";
import { getLoyaltySummary } from "../src/lib/loyalty/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const D = (iso: string) => new Date(iso);
const ev = (id: string, points: number, at: string): LoyaltyEvent => ({ id, points, at: D(at) });

async function cleanup() {
  await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds)).catch(() => undefined);
  await database.delete(users).where(inArray(users.id, temporaryUserIds)).catch(() => undefined);
}

async function main() {
  const NOW = D("2026-10-16T12:00:00.000Z");

  // 1. Zero activity: honest zeroes, base level, no next-step fiction.
  let p = computeLoyalty([], NOW);
  assert.equal(p.xp, 0, "zero xp");
  assert.equal(p.level.name, "Explorer", "starts at Explorer");
  assert.equal(p.nextLevel?.name, "Contributor", "next level named");
  assert.equal(p.currentStreak, 0, "no streak");
  assert.equal(p.longestStreak, 0, "no best");
  assert.equal(p.eventCount, 0, "no events");

  // 2. One verified event.
  p = computeLoyalty([ev("a", 50, "2026-10-16T08:00:00Z")], NOW);
  assert.equal(p.xp, 50, "single event xp");
  assert.equal(p.currentStreak, 1, "today active");
  assert.equal(p.longestStreak, 1, "best of one");

  // 3. Same-day duplicates collapse to one active day, xp still sums once per id.
  p = computeLoyalty(
    [ev("a", 50, "2026-10-16T08:00:00Z"), ev("b", 25, "2026-10-16T20:00:00Z"), ev("a", 50, "2026-10-16T09:00:00Z")],
    NOW,
  );
  assert.equal(p.xp, 75, "duplicate id counted once");
  assert.equal(p.activeDays, 1, "one active day");
  assert.equal(p.currentStreak, 1, "streak of one");

  // 4. Consecutive vs broken streaks.
  p = computeLoyalty(
    [ev("a", 10, "2026-10-14T10:00:00Z"), ev("b", 10, "2026-10-15T10:00:00Z"), ev("c", 10, "2026-10-16T10:00:00Z")],
    NOW,
  );
  assert.equal(p.currentStreak, 3, "three consecutive days");
  assert.equal(p.longestStreak, 3, "longest matches");
  p = computeLoyalty(
    [ev("a", 10, "2026-10-10T10:00:00Z"), ev("b", 10, "2026-10-11T10:00:00Z"), ev("c", 10, "2026-10-16T10:00:00Z")],
    NOW,
  );
  assert.equal(p.currentStreak, 1, "gap breaks the streak");
  assert.equal(p.longestStreak, 2, "history best preserved");
  p = computeLoyalty([ev("a", 10, "2026-10-14T10:00:00Z")], NOW);
  assert.equal(p.currentStreak, 0, "lapsed streak reads zero, not stale");

  // 5. Yesterday-only activity keeps the streak alive (can extend today).
  p = computeLoyalty([ev("a", 10, "2026-10-15T23:59:59Z")], NOW);
  assert.equal(p.currentStreak, 1, "yesterday keeps streak alive");

  // 6. UTC boundaries: 23:59 and 00:01 UTC are different days.
  p = computeLoyalty(
    [ev("a", 10, "2026-10-15T23:59:00Z"), ev("b", 10, "2026-10-16T00:01:00Z")],
    NOW,
  );
  assert.equal(p.activeDays, 2, "UTC midnight boundary honored");
  assert.equal(p.currentStreak, 2, "boundary days streak");

  // 7. Level boundaries are exact and documented.
  assert.equal(computeLoyalty([ev("a", 99, "2026-10-16T08:00:00Z")], NOW).level.name, "Explorer", "99 stays Explorer");
  assert.equal(computeLoyalty([ev("a", 100, "2026-10-16T08:00:00Z")], NOW).level.name, "Contributor", "100 unlocks Contributor");
  const maxed = computeLoyalty([ev("a", 500, "2026-10-16T08:00:00Z")], NOW);
  assert.equal(maxed.level.name, "Steward", "500 reaches Steward");
  assert.equal(maxed.nextLevel, null, "no level above Steward");
  assert.equal(maxed.xpForNext, 0, "nothing owed at the top");

  // 8. Garbage events never mint progress.
  p = computeLoyalty(
    [
      { id: "x", points: Number.NaN, at: D("2026-10-16T08:00:00Z") },
      { id: "y", points: -5, at: D("2026-10-16T08:00:00Z") },
      { id: "z", points: 10, at: new Date("invalid") },
    ],
    NOW,
  );
  assert.equal(p.xp, 0, "invalid events earn nothing");
  assert.equal(p.eventCount, 0, "invalid events uncounted");

  // 9. Deterministic ordering: recency first, id tiebreak.
  const ordered = orderLoyaltyEvents([
    ev("b", 10, "2026-10-15T10:00:00Z"),
    ev("a", 10, "2026-10-16T10:00:00Z"),
    ev("c", 10, "2026-10-16T10:00:00Z"),
  ]);
  assert.deepEqual(ordered.map((e) => e.id), ["a", "c", "b"], "recency then id");

  // 10. Level table is monotonic and starts at zero.
  assert.equal(LOYALTY_LEVELS[0]!.minXp, 0, "base level at zero");
  for (let i = 1; i < LOYALTY_LEVELS.length; i++) {
    assert.ok(LOYALTY_LEVELS[i]!.minXp > LOYALTY_LEVELS[i - 1]!.minXp, "thresholds strictly increase");
  }

  // 11. Service: only approved submissions count; cross-user isolation.
  // NOTE: one row per (mission, user) is schema-enforced, so fixtures
  // spread across missions.
  const seededMissions = await database
    .select({ id: missions.id })
    .from(missions)
    .where(gt(missions.points, 0))
    .limit(4);
  assert.ok(seededMissions.length >= 4, "seeded missions exist");
  const u1 = randomUUID();
  const u2 = randomUUID();
  for (const [id, handle] of [[u1, "loyalty-u1"], [u2, "loyalty-u2"]] as const) {
    await database.insert(users).values({ id, handle: `${handle}-${randomUUID().slice(0, 6)}`, displayName: handle, avatarUrl: null, role: "member" });
    temporaryUserIds.push(id);
  }
  const insert = (userId: string, missionId: string, status: string, daysAgo: number) =>
    database.insert(missionSubmissions).values({
      id: randomUUID(), missionId, userId, content: "Loyalty fixture.",
      evidenceUrl: null, score: status === "approved" ? 5 : null, status,
      reviewedBy: status === "approved" ? userId : null,
      reviewedAt: status === "approved" ? new Date(Date.now() - daysAgo * 86_400_000) : null,
      revisionReason: null,
      submittedAt: new Date(Date.now() - daysAgo * 86_400_000),
    });
  await insert(u1, seededMissions[0]!.id, "approved", 0);
  await insert(u1, seededMissions[1]!.id, "approved", 1);
  await insert(u1, seededMissions[2]!.id, "pending", 0);
  await insert(u1, seededMissions[3]!.id, "rejected", 0);
  const s1 = await getLoyaltySummary(u1, NOW);
  assert.equal(s1.counts.approved, 2, "two approvals counted");
  assert.equal(s1.counts.pending, 1, "pending tracked, never earning");
  assert.equal(s1.counts.needsWork, 1, "rejection tracked, never earning");
  assert.equal(s1.progress.eventCount, 2, "only approved events feed progress");
  assert.ok(s1.progress.xp > 0, "xp from live mission points");
  assert.equal(s1.recent.length, 2, "recent lists approvals only");
  const s2 = await getLoyaltySummary(u2, NOW);
  assert.equal(s2.progress.xp, 0, "second user starts at zero (isolation)");
  assert.equal(s2.progress.eventCount, 0, "no cross-user leakage");

  // 12. Revocation removes progress: flipping an approval off drops its xp.
  const approved = await database
    .select({ id: missionSubmissions.id })
    .from(missionSubmissions)
    .where(eq(missionSubmissions.userId, u1));
  assert.ok(approved.length >= 2, "fixtures present");
  await database
    .update(missionSubmissions)
    .set({ status: "rejected", revisionReason: "Abuse re-review." })
    .where(eq(missionSubmissions.id, approved[0]!.id));
  const after = await getLoyaltySummary(u1, NOW);
  assert.equal(after.progress.eventCount, 1, "revoked approval stops counting immediately");

  // 13. Database failure surfaces instead of fabricating zero-or-worse.
  await getLoyaltySummary(randomUUID(), NOW).then(
    (empty) => assert.equal(empty.progress.xp, 0, "unknown user reads zero honestly"),
    () => assert.fail("unknown user must not throw"),
  );

  console.log("loyalty:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(cleanup);
