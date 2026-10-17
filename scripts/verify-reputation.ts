import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, gt, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  campaignCompletions,
  campaigns,
  circleAnswers,
  circlePosts,
  circles,
  missionSubmissions,
  missions,
  theses,
  users,
} from "../src/db/schema";
import {
  dedupeVerifiedEvents,
  orderAuthoredItems,
  thesisDisplayStatus,
  type VerifiedEvent,
} from "../src/lib/reputation/rules";
import { getReputationSummary } from "../src/lib/reputation/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryCampaignIds: string[] = [];
const D = (iso: string) => new Date(iso);

async function cleanup() {
  if (temporaryCampaignIds.length > 0) {
    await database.delete(campaignCompletions).where(inArray(campaignCompletions.campaignId, temporaryCampaignIds)).catch(() => undefined);
    await database.delete(campaigns).where(inArray(campaigns.id, temporaryCampaignIds)).catch(() => undefined);
  }
  await database.delete(circleAnswers).where(inArray(circleAnswers.authorUserId, temporaryUserIds)).catch(() => undefined);
  await database.delete(circlePosts).where(inArray(circlePosts.authorUserId, temporaryUserIds)).catch(() => undefined);
  await database.delete(theses).where(inArray(theses.authorUserId, temporaryUserIds)).catch(() => undefined);
  await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds)).catch(() => undefined);
  await database.delete(users).where(inArray(users.id, temporaryUserIds)).catch(() => undefined);
}

async function main() {
  // 1. Pure dedupe: exact duplicates and same-proof completions collapse.
  const base: VerifiedEvent = { key: "completion:1", kind: "campaign-paid", at: D("2026-10-16T10:00:00Z"), proofKey: "send:abc", circleSlug: null, title: "Pool A" };
  const dup = { ...base };
  const sameProofLater: VerifiedEvent = { ...base, key: "completion:2", at: D("2026-10-16T12:00:00Z"), title: "Pool B" };
  const other: VerifiedEvent = { key: "submission:9", kind: "mission-approved", at: D("2026-10-15T10:00:00Z"), proofKey: null, circleSlug: "x", title: "Quiz" };
  const deduped = dedupeVerifiedEvents([sameProofLater, dup, base, other]);
  assert.equal(deduped.length, 2, "one row per proof identity");
  assert.equal(deduped.find((e) => e.proofKey === "send:abc")?.key, "completion:1", "earliest paid wins");
  assert.deepEqual(deduped.map((e) => e.key), ["completion:1", "submission:9"], "deterministic recent-first order");

  // 2. Invalid events never mint reputation.
  assert.equal(
    dedupeVerifiedEvents([
      { key: "", kind: "mission-approved", at: D("2026-10-16T10:00:00Z"), proofKey: null, circleSlug: null, title: "x" },
      { key: "k", kind: "mission-approved", at: new Date("invalid"), proofKey: null, circleSlug: null, title: "x" },
    ]).length,
    0,
    "garbage excluded",
  );

  // 3. Thesis statuses labeled honestly.
  assert.equal(thesisDisplayStatus("open", null), "open", "open stays open");
  assert.equal(thesisDisplayStatus("open", D("2026-10-20T00:00:00Z"), Date.parse("2026-10-16T00:00:00Z")), "open", "future close stays open");
  assert.equal(thesisDisplayStatus("open", D("2026-10-10T00:00:00Z"), Date.parse("2026-10-16T00:00:00Z")), "expired", "past close reads expired");
  assert.equal(thesisDisplayStatus("resolved", null), "resolved", "resolved kept");
  assert.equal(thesisDisplayStatus("withdrawn", null), "withdrawn", "withdrawn kept");

  // 4. Authored ordering deterministic.
  assert.deepEqual(
    orderAuthoredItems([
      { key: "b", kind: "post", at: D("2026-10-15T00:00:00Z"), status: "active", circleSlug: null, title: "b" },
      { key: "a", kind: "post", at: D("2026-10-16T00:00:00Z"), status: "active", circleSlug: null, title: "a" },
    ]).map((i) => i.key),
    ["a", "b"],
    "recent first",
  );

  // 5. Service fixtures across two users.
  const seeded = await database.select({ id: missions.id }).from(missions).where(gt(missions.points, 0)).limit(4);
  assert.ok(seeded.length >= 4, "seeded point-bearing missions");
  const [circleRow] = await database.select({ id: circles.id, slug: circles.slug }).from(circles).limit(1);
  assert.ok(circleRow, "seeded circle");
  const mkUser = async (tag: string) => {
    const id = randomUUID();
    await database.insert(users).values({ id, handle: `${tag}-${randomUUID().slice(0, 6)}`, displayName: tag, avatarUrl: null, role: "member" });
    temporaryUserIds.push(id);
    return id;
  };
  const u1 = await mkUser("rep-u1");
  const u2 = await mkUser("rep-u2");
  const sub = (userId: string, missionId: string, status: string) =>
    database.insert(missionSubmissions).values({
      id: randomUUID(), missionId, userId, content: "Reputation fixture.", evidenceUrl: null,
      score: status === "approved" ? 5 : null, status,
      reviewedBy: status === "approved" ? u1 : null,
      reviewedAt: status === "approved" ? new Date() : null,
      revisionReason: null, submittedAt: new Date(),
    });
  await sub(u1, seeded[0]!.id, "approved");
  await sub(u1, seeded[1]!.id, "approved");
  await sub(u1, seeded[2]!.id, "pending");
  await sub(u1, seeded[3]!.id, "rejected");

  // Paid + failed completions on a fixture campaign (direct rows, paid only counts).
  const campId = randomUUID();
  temporaryCampaignIds.push(campId);
  await database.insert(campaigns).values({
    id: campId, circleId: circleRow!.id, objective: "Reputation fixture pool",
    budgetStatus: "funded", status: "completed", targetAction: "send",
  });
  const proofId = randomUUID();
  const paidId = randomUUID();
  await database.insert(campaignCompletions).values({
    id: paidId, campaignId: campId, userId: u1, proofKind: "send", proofId,
    rewardAmount: "1.0000000", destinationPublicKey: "G" + "A".repeat(55),
    status: "paid", paidAt: new Date(),
  });
  await database.insert(campaignCompletions).values({
    id: randomUUID(), campaignId: campId, userId: u1, proofKind: "send", proofId: randomUUID(),
    rewardAmount: "1.0000000", destinationPublicKey: "G" + "A".repeat(55), status: "failed",
  });
  // Legacy same-proof double across campaigns (pre-P6.2 shape — the DB
  // unique index already blocks same-campaign doubles): collapses to one.
  const campId2 = randomUUID();
  temporaryCampaignIds.push(campId2);
  await database.insert(campaigns).values({
    id: campId2, circleId: circleRow!.id, objective: "Reputation fixture pool 2",
    budgetStatus: "funded", status: "completed", targetAction: "send",
  });
  await database.insert(campaignCompletions).values({
    id: randomUUID(), campaignId: campId2, userId: u1, proofKind: "send", proofId,
    rewardAmount: "1.0000000", destinationPublicKey: "G" + "A".repeat(55),
    status: "paid", paidAt: new Date(Date.now() + 1000),
  });

  // Theses: open, resolved, withdrawn, expired-open.
  const thesis = (status: string, closesAt: Date | null) =>
    database.insert(theses).values({
      id: randomUUID(), authorUserId: u1, circleId: circleRow!.id,
      title: `Reputation thesis ${status}`, claim: "Fixture claim.", timeframe: "30d",
      confidence: 60, status, evidenceRefs: [], closesAt,
    });
  await thesis("open", new Date(Date.now() + 30 * 86_400_000));
  await thesis("resolved", new Date());
  await thesis("withdrawn", new Date());
  await thesis("open", new Date(Date.now() - 86_400_000));

  // Community: one active post + answer, one moderated (excluded).
  const postId = randomUUID();
  await database.insert(circlePosts).values({
    id: postId, circleId: circleRow!.id, authorUserId: u1,
    type: "question", title: "Reputation fixture post", body: "Body.", status: "active",
  });
  await database.insert(circleAnswers).values({
    id: randomUUID(), postId, authorUserId: u1, body: "Fixture answer.", status: "active",
  });
  await database.insert(circlePosts).values({
    id: randomUUID(), circleId: circleRow!.id, authorUserId: u1,
    type: "question", title: "Moderated fixture", body: "Body.", status: "removed",
  });

  // 6. Private summary: verified + authored, pending noted, nothing private leaked.
  const priv = await getReputationSummary(u1, "private");
  assert.equal(priv.counts.verifiedMissions, 2, "two approved missions");
  assert.equal(priv.counts.verifiedCampaigns, 1, "same-proof double collapses to one");
  assert.equal(priv.counts.theses, 4, "all thesis states listed (labeled, not hidden)");
  assert.equal(priv.counts.posts, 1, "active post only — moderated excluded");
  assert.equal(priv.counts.answers, 1, "active answer counted");
  assert.equal(priv.pending, 1, "pending noted privately");
  assert.ok(priv.circles.length >= 1, "circles derived");
  const statuses = priv.authored.filter((a) => a.kind === "thesis").map((a) => a.status).sort();
  assert.deepEqual(statuses, ["expired", "open", "resolved", "withdrawn"], "thesis states distinct");
  const serialized = JSON.stringify(priv);
  assert.ok(!/wallet|balance|secret|privateKey|contact/i.test(serialized), "no private material in payload");

  // 7. Public summary: same verified/authored, pending hidden.
  const pub = await getReputationSummary(u1, "public");
  assert.equal(pub.counts.verifiedMissions, 2, "public keeps verified");
  assert.equal(pub.counts.theses, 4, "public keeps authored theses");
  assert.equal(pub.pending, 0, "public never exposes pending");
  const pubSerialized = JSON.stringify(pub);
  assert.ok(!/revisionReason|reviewedBy|wallet|reward/i.test(pubSerialized), "public boundary holds");

  // 8. Isolation + emptiness.
  const empty = await getReputationSummary(u2, "private");
  assert.equal(empty.verified.length, 0, "second user unaffected");
  assert.equal(empty.authored.length, 0, "no leakage across users");
  assert.equal(empty.circles.length, 0, "no circles invented");

  // 9. Revocation removes verified credit live.
  const approvedRows = await database
    .select({ id: missionSubmissions.id })
    .from(missionSubmissions)
    .where(eq(missionSubmissions.userId, u1));
  await database
    .update(missionSubmissions)
    .set({ status: "rejected", revisionReason: "Re-review." })
    .where(eq(missionSubmissions.id, approvedRows[0]!.id));
  const after = await getReputationSummary(u1, "private");
  assert.equal(after.counts.verifiedMissions, 1, "revoked approval stops counting");

  console.log("reputation:verified");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(cleanup);
