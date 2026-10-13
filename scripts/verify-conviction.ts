import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { circlePosts, theses, users } from "../src/db/schema";
import { watchCircle } from "../src/lib/data/watch";
import { followUser } from "../src/lib/social/service";
import { createCommunityPost } from "../src/lib/community/service";
import {
  ConvictionError,
  createThesis,
  getProfileThesisSummary,
  getThesis,
  listCircleTheses,
  listSubjectTheses,
  resolveThesis,
  withdrawThesis,
} from "../src/lib/conviction/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryPostIds: string[] = [];
const temporaryThesisIds: string[] = [];
const ROOT = join(__dirname, "..");

const SLUG = "benji-on-stellar";
const OTHER_SLUG = "wtgxx-on-stellar";
const FAKE_WALLET = `G${"Q".repeat(55)}`;

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
  for (const id of temporaryPostIds) {
    await database.delete(circlePosts).where(eq(circlePosts.id, id)).catch(() => {});
  }
  for (const id of temporaryUserIds) {
    await database.delete(users).where(eq(users.id, id)).catch(() => {});
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ConvictionError, "expected ConvictionError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected conviction error ${code}`);
}

const BASE = {
  circleSlug: SLUG,
  title: "BENJI utility will keep expanding past passive holding",
  claim: "Over the next 90 days, BENJI will gain at least one new documented Vicus use beyond holding, based on current issuer and lifecycle evidence.",
  timeframe: "90d",
  confidence: 72,
};

async function main() {
  const alice = await createUser("cv-alice");
  const bob = await createUser("cv-bob");
  const post = await createCommunityPost(alice.id, SLUG, {
    type: "insight",
    title: "How BENJI distributions settle on Stellar rails",
    body: "A body with enough length to pass validation rules for insights here.",
    sourceUrl: null,
  });
  temporaryPostIds.push(post.id);
  const otherPost = await createCommunityPost(alice.id, OTHER_SLUG, {
    type: "insight",
    title: "WTGXX access runs through official Prime rails",
    body: "A body with enough length to pass validation rules for insights here.",
    sourceUrl: null,
  });
  temporaryPostIds.push(otherPost.id);

  // 1. Binding: exactly one real Circle or subject.
  await expectCode(createThesis(alice.id, null, { ...BASE, circleSlug: undefined }), "invalid-request");
  await expectCode(createThesis(alice.id, null, { ...BASE, subjectSlug: "apple" }), "invalid-request");
  await expectCode(createThesis(alice.id, null, { ...BASE, circleSlug: "no-such-circle" }), "not-found");
  await expectCode(createThesis(alice.id, null, { circleSlug: undefined, subjectSlug: "no-such-subject", title: "t", claim: "c" }), "not-found");
  await expectCode(createThesis(null, null, BASE), "unauthenticated");

  // 2. Confidence bounded 0–100 integers.
  for (const bad of [-1, 101, 72.5, "high", null]) {
    await expectCode(createThesis(alice.id, null, { ...BASE, confidence: bad }), "invalid-request");
  }
  const zero = await createThesis(alice.id, null, { ...BASE, confidence: 0, title: "Zero confidence probe thesis here" });
  temporaryThesisIds.push(zero.id);
  assert.equal(zero.confidence, 0);
  assert.equal(zero.status, "open");
  assert.ok(zero.closesAt, "timeframe derives a close date");

  // 3. Paper implies no ownership; payload leaks nothing.
  const paper = await createThesis(alice.id, null, { ...BASE, evidence: [{ kind: "post", label: post.title, postId: post.id }] });
  temporaryThesisIds.push(paper.id);
  assert.equal(paper.thesisType, "paper");
  assert.equal(paper.positionLinked, false);
  assert.equal(paper.evidence.length, 1);
  const payload = JSON.stringify(paper);
  assert.ok(!/wallet|balance|amount|secret|privateKey/i.test(payload), "no private material");

  // 4. Evidence must already exist in Vicus.
  await expectCode(
    createThesis(alice.id, null, { ...BASE, title: "Arbitrary URL probe thesis here", evidence: [{ kind: "source", label: "random blog", url: "https://example.com/claims" }] }),
    "invalid-request",
  );
  await expectCode(
    createThesis(alice.id, null, { ...BASE, title: "Foreign post probe thesis here", evidence: [{ kind: "post", label: otherPost.title, postId: otherPost.id }] }),
    "invalid-request",
  );
  await expectCode(
    createThesis(alice.id, null, { ...BASE, title: "Ghost post probe thesis here", evidence: [{ kind: "post", label: "ghost", postId: randomUUID() }] }),
    "invalid-request",
  );

  // 5. Position link proves live holdings only — watch/follow never qualify.
  await watchCircle(alice.id, SLUG);
  await followUser(alice.id, bob.handle);
  await expectCode(
    createThesis(alice.id, FAKE_WALLET, { ...BASE, title: "Linked probe thesis without holding", linkPosition: true, linkedAssetSlug: SLUG }),
    "invalid-request",
  );

  // 6. Agent labels rejected on the user path — no fake agents.
  await expectCode(createThesis(alice.id, null, { ...BASE, title: "Agent probe thesis XYZ here", agentName: "vicus-agent" }), "invalid-request");

  // 7. Expiry is deterministic from closesAt.
  await database.update(theses).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(theses.id, zero.id));
  assert.equal((await getThesis(zero.id)).status, "expired", "past close reads expired");
  await expectCode(resolveThesis(zero.id, alice.id, { outcomeNote: "too late" }), "invalid-transition");

  // 8. Author-only resolution with a required note; then immutable.
  await expectCode(resolveThesis(paper.id, bob.id, { outcomeNote: "hijack" }), "forbidden");
  await expectCode(resolveThesis(paper.id, alice.id, {}), "invalid-request");
  const resolved = await resolveThesis(paper.id, alice.id, { outcomeNote: "A new documented use shipped in the window." });
  assert.equal(resolved.status, "resolved");
  assert.ok((resolved.outcomeNote ?? "").length > 0);
  await expectCode(resolveThesis(paper.id, alice.id, { outcomeNote: "again" }), "invalid-transition");
  await expectCode(withdrawThesis(paper.id, alice.id), "invalid-transition");
  const withdrawn = await withdrawThesis(zero.id, alice.id).catch(() => null);
  assert.ok(withdrawn === null, "expired thesis cannot withdraw");

  // 9. Circle/subject reads never duplicate.
  const circleList = await listCircleTheses(SLUG);
  assert.ok(circleList.some((t) => t.id === paper.id), "circle read finds it");
  const subjectList = await listSubjectTheses("apple");
  assert.ok(!subjectList.some((t) => t.id === paper.id), "subject read does not duplicate circle theses");
  const subjectThesis = await createThesis(bob.id, null, {
    subjectSlug: "apple",
    title: "AAPLx stays more usable than AAPLc for 30 days",
    claim: "Jupiter routing for AAPLx remains live while AAPLc acquisition stays gated, over the next 30 days.",
    timeframe: "30d",
    confidence: 65,
  });
  temporaryThesisIds.push(subjectThesis.id);
  assert.equal(subjectThesis.circleSlug, null, "subject thesis has no circle");
  assert.ok((await listSubjectTheses("apple")).some((t) => t.id === subjectThesis.id), "subject read finds it");

  // 10. Profile summary counts only — no accuracy scoring.
  const summary = await getProfileThesisSummary(alice.id);
  assert.ok(summary.total >= 2 && summary.open >= 0, "open/total present");
  assert.deepEqual(Object.keys(summary).sort(), ["open", "total"], "no scoring fields");

  // 11. No execution or feed machinery in Conviction.
  const serviceText = readFileSync(join(ROOT, "src/lib/conviction/service.ts"), "utf8");
  assert.ok(!/signTransaction|prepareSwap|submitTransaction|buildSwap/i.test(serviceText), "no execution path");
  assert.ok(!/circlePosts\.status.*pending|insert\(circlePosts\)/i.test(serviceText), "no parallel post system");
  assert.ok(!/privateKey|seed/i.test(serviceText), "no secrets");

  await cleanup();
  console.log("conviction:verified");
}

main().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
