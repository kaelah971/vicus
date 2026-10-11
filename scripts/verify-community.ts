import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import {
  circlePostHelpful,
  circlePosts,
  organizationMemberships,
  organizations,
  users,
} from "../src/db/schema";
import { MissionActionError } from "../src/lib/missions/errors";
import {
  createCommunityAnswer,
  createCommunityPost,
  getCommunityPostDetail,
  getEcosystemCommunityActivity,
  getUserCommunityContributions,
  listCirclePosts,
  removeCommunityAnswer,
  removeCommunityPost,
  setPostHelpful,
} from "../src/lib/community/service";
import { createOrganization } from "../src/lib/organizations/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const createdPostIds: string[] = [];
const createdOrgIds: string[] = [];

async function createUser(handle: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({
    id,
    handle,
    displayName: `${handle} Person`,
    avatarUrl: null,
    bio: null,
    role: "member",
  });
  return id;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof MissionActionError, "Expected a MissionActionError.");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`Expected error code ${code}.`);
}

async function cleanup() {
  if (createdPostIds.length > 0) {
    await database.delete(circlePostHelpful).where(inArray(circlePostHelpful.postId, createdPostIds));
    await database.delete(circlePosts).where(inArray(circlePosts.id, createdPostIds));
  }
  if (createdOrgIds.length > 0) {
    await database
      .delete(organizationMemberships)
      .where(inArray(organizationMemberships.organizationId, createdOrgIds));
    await database.delete(organizations).where(inArray(organizations.id, createdOrgIds));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

const QUESTION = {
  title: "What does this asset actually represent here?",
  body: "A substantive community question body with enough length to pass validation rules easily.",
};
const INSIGHT = {
  title: "Beginner read on representation vs ownership",
  body: "A substantive community insight body explaining representation without investment advice language.",
};

async function verify() {
  const tag = randomUUID().slice(0, 6);
  const authorId = await createUser(`comm-author-${tag}`);
  const authorHandle = `comm-author-${tag}`;
  const otherId = await createUser(`comm-other-${tag}`);

  // Signed-out creation is blocked everywhere.
  await expectCode(createCommunityPost(null, "usdc-on-base", { type: "question", ...QUESTION, sourceUrl: null }), "unauthenticated");
  await expectCode(createCommunityAnswer(null, randomUUID(), "An answer body with enough length."), "unauthenticated");
  await expectCode(setPostHelpful(null, randomUUID(), true), "unauthenticated");
  await expectCode(setPostHelpful(undefined, randomUUID(), false), "unauthenticated");
  await expectCode(removeCommunityPost(null, randomUUID()), "unauthenticated");

  // Question + insight creation; author comes from the session user.
  const question = await createCommunityPost(authorId, "usdc-on-base", {
    type: "question",
    ...QUESTION,
    sourceUrl: null,
  });
  createdPostIds.push(question.id);
  assert.equal(question.author.id, authorId, "Author must derive from the session user.");
  assert.equal(question.type, "question");
  assert.equal(question.helpfulCount, 0);
  assert.equal(question.answerCount, 0);

  const insight = await createCommunityPost(authorId, "usdc-on-base", {
    type: "insight",
    ...INSIGHT,
    sourceUrl: null,
  });
  createdPostIds.push(insight.id);

  // Sources require a valid URL.
  await expectCode(
    createCommunityPost(authorId, "usdc-on-base", {
      type: "source",
      title: "A source post with enough title length here",
      body: "Explanation of why this source matters with enough length to validate.",
      sourceUrl: "not-a-url",
    }),
    "invalid-request",
  );
  const source = await createCommunityPost(authorId, "usdc-on-base", {
    type: "source",
    title: "Official docs on this asset representation",
    body: "Explanation of why this source matters with enough length to validate.",
    sourceUrl: "https://www.circle.com/usdc",
  });
  createdPostIds.push(source.id);
  assert.equal(source.sourceDomain, "circle.com");

  // Answers target active questions only; no nested replies exist.
  const answer = await createCommunityAnswer(
    otherId,
    question.id,
    "An answer body with enough length to pass validation rules.",
  );
  assert.equal(answer.postId, question.id);
  await expectCode(createCommunityAnswer(otherId, insight.id, "An answer body with enough length."), "invalid-request");
  await expectCode(createCommunityAnswer(otherId, randomUUID(), "An answer body with enough length."), "invalid-request");
  await expectCode(createCommunityAnswer(otherId, answer.id, "An answer body with enough length."), "invalid-request");

  const detail = await getCommunityPostDetail("usdc-on-base", question.id, authorId);
  assert(detail, "Question detail must resolve.");
  assert.equal(detail.answers.length, 1);
  assert.equal(detail.answers[0]?.author.id, otherId);

  // Helpful is idempotent; unhelpful works and repeats safely.
  assert.deepEqual(await setPostHelpful(otherId, question.id, true), { helpful: true, helpfulCount: 1 });
  assert.deepEqual(await setPostHelpful(otherId, question.id, true), { helpful: true, helpfulCount: 1 });
  assert.deepEqual(await setPostHelpful(authorId, question.id, true), { helpful: true, helpfulCount: 2 });
  assert.deepEqual(await setPostHelpful(otherId, question.id, false), { helpful: false, helpfulCount: 1 });
  assert.deepEqual(await setPostHelpful(otherId, question.id, false), { helpful: false, helpfulCount: 1 });

  // Circle listing shows active content with counts.
  const listed = await listCirclePosts("usdc-on-base", null, authorId);
  assert(listed.some((post) => post.id === question.id && post.answerCount === 1));
  const onlyQuestions = await listCirclePosts("usdc-on-base", "question", authorId);
  assert(onlyQuestions.every((post) => post.type === "question"));
  assert(onlyQuestions.some((post) => post.id === question.id));

  // Moderation: unrelated users cannot remove; authors can remove their own.
  await expectCode(removeCommunityPost(otherId, question.id), "forbidden");
  await expectCode(removeCommunityAnswer(authorId, answer.id), "forbidden");
  assert.deepEqual(await removeCommunityAnswer(otherId, answer.id), { removed: true });

  // Org moderation: seed-org owner can moderate the hosted Base circle;
  // another org's owner cannot.
  const [seedOrg] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "circle"))
    .limit(1);
  assert(seedOrg, "The seed Circle org is required.");
  const seedOwnerId = await createUser(`comm-seedowner-${tag}`);
  await database.insert(organizationMemberships).values({
    organizationId: seedOrg.id,
    userId: seedOwnerId,
    role: "owner",
  });
  const foreignOrg = await createOrganization({
    name: `Foreign Org ${tag}`,
    slug: `foreign-org-${tag}`,
    description: "A foreign verification organization with enough description length.",
    websiteUrl: null,
    ecosystemFocus: null,
  });
  createdOrgIds.push(foreignOrg.id);
  const foreignOwnerId = await createUser(`comm-foreignowner-${tag}`);
  await database.insert(organizationMemberships).values({
    organizationId: foreignOrg.id,
    userId: foreignOwnerId,
    role: "owner",
  });
  await expectCode(removeCommunityPost(foreignOwnerId, insight.id), "forbidden");

  // Author removes their own question; removed content vanishes publicly.
  assert.deepEqual(await removeCommunityPost(authorId, question.id), { removed: true });
  const afterRemoval = await listCirclePosts("usdc-on-base", null, authorId);
  assert(!afterRemoval.some((post) => post.id === question.id), "Removed posts must be absent publicly.");
  assert.equal(await getCommunityPostDetail("usdc-on-base", question.id, authorId), null);

  // Seed-org owner moderates the insight.
  assert.deepEqual(await removeCommunityPost(seedOwnerId, insight.id), { removed: true });

  // Profile + ecosystem surfaces carry active content without wallet leakage.
  const profileItems = await getUserCommunityContributions(authorHandle);
  assert(profileItems.some((item) => item.id === source.id), "Active source must appear on the profile.");
  assert(!profileItems.some((item) => item.id === question.id), "Removed posts must stay off profiles.");
  assert(!profileItems.some((item) => item.id === insight.id), "Moderated posts must stay off profiles.");
  const profileLeak = JSON.stringify(profileItems);
  assert(!/publicKey|secret|session|wallet|privateKey/i.test(profileLeak), "Community profile items must not leak.");

  const baseActivity = await getEcosystemCommunityActivity("base", 4);
  assert(baseActivity.some((item) => item.postId === source.id), "Base activity must include the source.");
  const stellarActivity = await getEcosystemCommunityActivity("stellar", 4);
  assert(!stellarActivity.some((item) => item.postId === source.id), "Ecosystem activity must scope correctly.");

  console.log("Community verification passed", {
    signedOutBlocked: true,
    questionInsightSource: true,
    sourceUrlRequired: true,
    authorFromSession: true,
    answersScoped: true,
    helpfulIdempotent: true,
    ownModeration: true,
    unrelatedBlocked: true,
    orgModerationScoped: true,
    removedAbsent: true,
    profileScoped: true,
    ecosystemScoped: true,
    noLeakage: true,
  });
}

verify()
  .catch((error) => {
    console.error("Community verification failed.");
    if (error instanceof Error) {
      console.error(error.message);
      console.error((error.stack ?? "").split("\n").slice(0, 6).join("\n"));
    }
    process.exitCode = 1;
  })
  .finally(cleanup);
