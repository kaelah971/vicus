import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  campaignCompletions,
  campaigns,
  circleAnswers,
  circlePostHelpful,
  circlePosts,
  circles,
  missionSubmissions,
  missions,
  users,
} from "../src/db/schema";
import { watchCircle } from "../src/lib/data/watch";
import { followUser } from "../src/lib/social/service";
import {
  createCommunityAnswer,
  createCommunityPost,
  setPostHelpful,
} from "../src/lib/community/service";
import {
  CircleSocialError,
  getCircleSocialSummary,
} from "../src/lib/circles-social/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryPostIds: string[] = [];
const temporaryMissionIds: string[] = [];
const temporaryCampaignIds: string[] = [];

const SLUG = "benji-on-stellar";

async function createUser(handle: string) {
  const id = randomUUID();
  const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
  await database
    .insert(users)
    .values({ id, handle: uniqueHandle, displayName: `${uniqueHandle} tester`, avatarUrl: null, role: "member" });
  temporaryUserIds.push(id);
  return { id, handle: uniqueHandle };
}

async function cleanup() {
  for (const id of temporaryPostIds) {
    await database.delete(circlePostHelpful).where(eq(circlePostHelpful.postId, id)).catch(() => {});
    await database.delete(circleAnswers).where(eq(circleAnswers.postId, id)).catch(() => {});
    await database.delete(circlePosts).where(eq(circlePosts.id, id)).catch(() => {});
  }
  for (const id of temporaryMissionIds) {
    await database.delete(missionSubmissions).where(eq(missionSubmissions.missionId, id)).catch(() => {});
    await database.delete(missions).where(eq(missions.id, id)).catch(() => {});
  }
  for (const id of temporaryCampaignIds) {
    await database.delete(campaignCompletions).where(eq(campaignCompletions.campaignId, id)).catch(() => {});
    await database.delete(campaigns).where(eq(campaigns.id, id)).catch(() => {});
  }
  for (const id of temporaryUserIds) {
    await database.delete(users).where(eq(users.id, id)).catch(() => {});
  }
}

async function main() {
  const alice = await createUser("ac-alice");
  const bob = await createUser("ac-bob");
  const carol = await createUser("ac-carol");
  const [circle] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, SLUG)).limit(1);
  assert.ok(circle, "BENJI circle seeded");

  // Fixtures: watches, a follow, community rows, an approved mission,
  // a paid campaign completion.
  assert.equal(await watchCircle(alice.id, SLUG), true);
  assert.equal(await watchCircle(bob.id, SLUG), true);
  await followUser(alice.id, bob.handle);
  const question = await createCommunityPost(bob.id, SLUG, {
    type: "question",
    title: "How does daily distribution reach holders here",
    body: "A body with enough length to pass validation rules for questions.",
    sourceUrl: null,
  });
  temporaryPostIds.push(question.id);
  await createCommunityAnswer(
    carol.id,
    question.id,
    "An answer body with enough length to pass validation rules here.",
  );
  await setPostHelpful(alice.id, question.id, true);
  const [mission] = await database
    .insert(missions)
    .values({
      circleId: circle!.id,
      type: "text",
      title: "BENJI learner mission",
      description: "Prove understanding with a reviewed response.",
      points: 10,
      reviewMode: "manual",
      status: "open",
    })
    .returning({ id: missions.id });
  temporaryMissionIds.push(mission!.id);
  await database.insert(missionSubmissions).values({
    missionId: mission!.id,
    userId: carol.id,
    status: "approved",
  });
  const [campaign] = await database
    .insert(campaigns)
    .values({
      circleId: circle!.id,
      objective: "Send BENJI for rewards",
      budgetStatus: "funded",
      status: "active",
      targetAction: "send",
      rewardAsset: "USDC",
      rewardNetwork: "stellar_testnet",
      rewardPerCompletion: "1",
      fundedAmount: "10",
    })
    .returning({ id: campaigns.id });
  temporaryCampaignIds.push(campaign!.id);
  await database.insert(campaignCompletions).values({
    campaignId: campaign!.id,
    userId: bob.id,
    proofKind: "send",
    proofId: randomUUID(),
    rewardAmount: "1",
    destinationPublicKey: `G${"A".repeat(55)}`,
    status: "paid",
    paidAt: new Date(),
  });

  // 1. Groupings: following, contributors, verified, watching.
  const summary = await getCircleSocialSummary(SLUG, alice.id);
  assert.equal(summary.slug, SLUG, "content belongs to the exact asset");
  assert.ok(summary.groups.following.some((p) => p.handle === bob.handle), "people you follow");
  assert.ok(!summary.groups.following.some((p) => p.handle === carol.handle), "strangers not in following");
  assert.ok(summary.groups.watching.some((p) => p.handle === alice.handle), "watchers listed");
  assert.ok(summary.groups.contributors.some((p) => p.handle === carol.handle), "approved mission author contributes");

  // 2. Contribution signals from real rows.
  const bobSignal = summary.contributorSignals.find((s) => s.handle === bob.handle)!;
  assert.ok(bobSignal, "bob has a signal row");
  assert.equal(bobSignal.questions, 1, "question counted");
  assert.equal(bobSignal.helpfulReceived, 1, "helpful vote counted");
  const carolSignal = summary.contributorSignals.find((s) => s.handle === carol.handle)!;
  assert.equal(carolSignal.answers, 1, "answer counted");
  assert.equal(carolSignal.questions, 0, "no fabricated questions");

  // 3. Verified participation only from real proof — never watch/follow.
  const verified = new Map(summary.verifiedParticipants.map((p) => [p.handle, p.basis]));
  assert.equal(verified.get(carol.handle), "mission", "approved mission verifies");
  assert.equal(verified.get(bob.handle), "campaign", "paid completion verifies");
  assert.ok(!verified.has(alice.handle), "watch + follow alone never verifies");
  const payload = JSON.stringify(summary);
  assert.ok(!/balance|wallet|amount|payout|secret/i.test(payload), "no private leakage");
  assert.ok(!payload.includes(`G${"A".repeat(55)}`), "no address leakage");

  // 4. Unknown circles reject; empty circles stay empty without fabrication.
  try {
    await getCircleSocialSummary("no-such-circle", alice.id);
    assert.fail("expected not-found");
  } catch (error) {
    assert.ok(error instanceof CircleSocialError && error.code === "not-found");
  }
  const stranger = await getCircleSocialSummary(SLUG, null);
  assert.equal(stranger.groups.following.length, 0, "signed-out sees no following");

  // 5. Stellar + external assets share the one Circle model.
  const external = await getCircleSocialSummary("aaplx-on-solana", null);
  assert.equal(external.slug, "aaplx-on-solana");
  assert.ok(Array.isArray(external.groups.watching), "same shape for external assets");

  await cleanup();
  console.log("asset-circles:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
