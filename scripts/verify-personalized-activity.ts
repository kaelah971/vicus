import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  assetTransfers,
  campaignCompletions,
  campaigns,
  circlePosts,
  circles,
  theses,
  users,
} from "../src/db/schema";
import { watchCircle } from "../src/lib/data/watch";
import { followUser } from "../src/lib/social/service";
import { createCommunityPost } from "../src/lib/community/service";
import { createThesis } from "../src/lib/conviction/service";
import { ActivityError, getPersonalActivity } from "../src/lib/activity/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryPostIds: string[] = [];
const temporaryThesisIds: string[] = [];
const temporaryCampaignIds: string[] = [];
const temporaryTransferIds: string[] = [];

const BENJI = "benji-on-stellar";
const AAPLX = "aaplx-on-solana";

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
  for (const id of temporaryThesisIds) {
    await database.delete(theses).where(eq(theses.id, id)).catch(() => {});
  }
  for (const id of temporaryTransferIds) {
    await database.delete(assetTransfers).where(eq(assetTransfers.id, id)).catch(() => {});
  }
  for (const id of temporaryPostIds) {
    await database.delete(circlePosts).where(eq(circlePosts.id, id)).catch(() => {});
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
  try {
    await getPersonalActivity(null);
    assert.fail("expected unauthenticated");
  } catch (error) {
    assert.ok(error instanceof ActivityError && error.code === "unauthenticated", "signed-out blocked");
  }

  const alice = await createUser("pa-alice");
  const bob = await createUser("pa-bob");
  const carol = await createUser("pa-carol");
  const [benji] = await database.select({ id: circles.id }).from(circles).where(eq(circles.slug, BENJI)).limit(1);
  assert.ok(benji, "BENJI seeded");

  await watchCircle(alice.id, BENJI);
  await followUser(alice.id, bob.handle);
  const post = await createCommunityPost(bob.id, BENJI, {
    type: "insight",
    title: "How BENJI redemption windows actually settle here",
    body: "A body with enough length to pass validation rules for insights here.",
    sourceUrl: null,
  });
  temporaryPostIds.push(post.id);
  // Unrelated activity: carol posts where alice has no relevance.
  const stray = await createCommunityPost(carol.id, AAPLX, {
    type: "insight",
    title: "AAPLx routing notes from outside alices world",
    body: "A body with enough length to pass validation rules for insights here.",
    sourceUrl: null,
  });
  temporaryPostIds.push(stray.id);
  const thesis = await createThesis(bob.id, null, {
    circleSlug: BENJI,
    title: "BENJI utility keeps expanding past holding",
    claim: "Over the next 30 days BENJI gains a documented use, per current lifecycle evidence.",
    timeframe: "30d",
    confidence: 60,
    evidence: [{ kind: "post", label: post.title, postId: post.id }],
  });
  temporaryThesisIds.push(thesis.id);
  const mine = await createThesis(alice.id, null, {
    circleSlug: BENJI,
    title: "Alices expiring probe thesis for attention",
    claim: "A short-lived claim used only to prove expiry attention works.",
    timeframe: "7d",
    confidence: 50,
  });
  temporaryThesisIds.push(mine.id);
  await database.update(theses).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(theses.id, mine.id));

  const [campaign] = await database
    .insert(campaigns)
    .values({
      circleId: benji!.id,
      objective: "Send BENJI for rewards",
      budgetStatus: "funded",
      status: "active",
      targetAction: "send",
      rewardAsset: "USDC",
      rewardNetwork: "stellar_testnet",
      rewardPerCompletion: "1",
      fundedAmount: "10",
      // Window hygiene: the app clock runs ~300ms behind DB now(), so a
      // just-created campaign would otherwise predate fresh proofs.
      createdAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 3 * 86400000),
    })
    .returning({ id: campaigns.id });
  temporaryCampaignIds.push(campaign!.id);
  const sendId = randomUUID();
  temporaryTransferIds.push(sendId);
  await database.insert(assetTransfers).values({
    id: sendId,
    senderUserId: alice.id,
    network: "stellar_mainnet",
    circleId: benji!.id,
    assetCode: "BENJI",
    assetIssuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    amount: "5.0000000",
    destinationAddress: `G${"B".repeat(55)}`,
    status: "confirmed",
    transactionHash: `hash-${sendId.slice(0, 8)}`,
    confirmedAt: new Date(),
  });

  const ownPost = await createCommunityPost(alice.id, BENJI, {
    type: "question",
    title: "What does the daily distribution cadence mean here",
    body: "A body with enough length to pass validation rules for questions here.",
    sourceUrl: null,
  });
  temporaryPostIds.push(ownPost.id);
  const activity = await getPersonalActivity(alice.id, null);

  // 1. Watched-asset activity appears with its reason (follow wins when both apply).
  const insight = activity.changed.find((item) => item.id === `post:${post.id}` || item.id === `post-follow:${post.id}`);
  assert.ok(insight, "watched asset post appears");
  assert.ok(insight!.reason.startsWith("Because you "), "reason label always present");
  const watchReasoned = activity.changed.find((item) => item.id === `post:${ownPost.id}`);
  assert.ok(watchReasoned && watchReasoned.reason.includes("BENJI"), "watch reason names the asset");

  // 2. Followed-person thesis appears via the follow reason.
  const followed = activity.changed.find((item) => item.id === `thesis:${thesis.id}`);
  assert.ok(followed, "followed thesis appears");
  assert.ok(followed!.reason.includes(bob.handle), "follow reason names the person");

  // 3. Unrelated activity excluded; no transaction state duplicated.
  assert.ok(!activity.changed.some((item) => item.id === `post:${stray.id}`), "unrelated excluded");
  assert.ok(!activity.changed.some((item) => item.group !== "thesis" && item.group !== "community" && item.group !== "campaign" && item.group !== "personal"), "known groups only");
  const blob = JSON.stringify(activity);
  assert.ok(!/swapSignature|quoteMinOut|sourceAmount|burn|attest/i.test(blob), "no Watch Center transaction state");

  // 4. Campaign + attention behavior.
  assert.ok(activity.changed.some((item) => item.id === `campaign:${campaign!.id}`), "relevant campaign appears");
  assert.ok(activity.attention.some((item) => item.id === `campaign-ending:${campaign!.id}`), "ending soon flagged");
  assert.ok(activity.attention.some((item) => item.id === `campaign-claim:${campaign!.id}`), "claimable reward flagged");
  assert.ok(activity.attention.some((item) => item.id === `thesis-expired:${mine.id}`), "own expired thesis flagged");

  // 5. Privacy: holdings silent, strangers isolated, no leaks.
  assert.ok(!blob.includes(`G${"B".repeat(55)}`), "no address leakage");
  assert.ok(!/balance|wallet|payout|secret/i.test(blob), "no private leakage");
  const carolView = await getPersonalActivity(carol.id, null);
  assert.ok(!carolView.changed.some((item) => item.id === `post:${post.id}`), "no cross-user leakage");

  // 6. Deterministic ranking + empty state honesty.
  const again = await getPersonalActivity(alice.id, null);
  assert.deepEqual(again, activity, "deterministic");
  const fresh = await createUser("pa-fresh");
  const empty = await getPersonalActivity(fresh.id, null);
  assert.deepEqual(empty.changed, [], "empty state fabricates nothing");
  assert.deepEqual(empty.attention, [], "no false attention");

  // 7. Stellar + external share one model.
  await watchCircle(fresh.id, AAPLX);
  const external = await getPersonalActivity(fresh.id, null);
  assert.ok(Array.isArray(external.changed), "external assets use the same model");

  await cleanup();
  console.log("personalized-activity:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
