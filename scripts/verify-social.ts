import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { Keypair } from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import {
  circleMemberships,
  circles,
  missionSubmissions,
  stellarRoleVerifications,
  stellarWallets,
  userFollows,
  users,
} from "../src/db/schema";
import { watchCircle } from "../src/lib/data/watch";
import { MissionActionError } from "../src/lib/missions/errors";
import {
  followUser,
  getCirclePeople,
  getEcosystemPeople,
  getFollowCounts,
  getPublicProfileByHandle,
  listContributors,
  unfollowUser,
} from "../src/lib/social/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const temporaryWalletIds: string[] = [];

async function createUser(handle: string) {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({
    id,
    handle,
    displayName: `${handle} Person`,
    avatarUrl: null,
    bio: `${handle} bio for social verification.`,
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
  if (temporaryUserIds.length > 0) {
    await database.delete(userFollows).where(inArray(userFollows.followerUserId, temporaryUserIds));
    await database.delete(userFollows).where(inArray(userFollows.followedUserId, temporaryUserIds));
    await database.delete(missionSubmissions).where(inArray(missionSubmissions.userId, temporaryUserIds));
    await database.delete(circleMemberships).where(inArray(circleMemberships.userId, temporaryUserIds));
    await database.delete(stellarRoleVerifications).where(inArray(stellarRoleVerifications.userId, temporaryUserIds));
  }
  if (temporaryWalletIds.length > 0) {
    await database.delete(stellarWallets).where(inArray(stellarWallets.id, temporaryWalletIds));
  }
  if (temporaryUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

async function countFollows(followerId: string, followedId: string) {
  const rows = await database
    .select({ id: userFollows.id })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerUserId, followerId),
        eq(userFollows.followedUserId, followedId),
      ),
    );
  return rows.length;
}

async function verify() {
  const tag = randomUUID().slice(0, 6);
  const aliceHandle = `social-alice-${tag}`;
  const bobHandle = `social-bob-${tag}`;
  const carolHandle = `social-carol-${tag}`;
  const aliceId = await createUser(aliceHandle);
  const bobId = await createUser(bobHandle);
  const carolId = await createUser(carolHandle);

  const [stellarCircle] = await database
    .select({ id: circles.id, assetId: circles.assetId })
    .from(circles)
    .where(eq(circles.slug, "usdc-on-stellar"))
    .limit(1);
  assert(stellarCircle, "The Stellar circle is required for social verification.");

  // Alice: watcher + approved contributor + verified holder on Stellar.
  assert.strictEqual(await watchCircle(aliceId, "usdc-on-stellar"), true);
  const submissionId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: submissionId,
    missionId: "00000000-0000-0000-0000-000000000401",
    userId: aliceId,
    content: "Social verification fixture.",
    evidenceUrl: null,
    score: 4,
    status: "approved",
    reviewedBy: null,
    reviewedAt: new Date(),
    revisionReason: null,
  });
  const pendingId = randomUUID();
  await database.insert(missionSubmissions).values({
    id: pendingId,
    missionId: "00000000-0000-0000-0000-000000000402",
    userId: aliceId,
    content: "Pending fixture that must stay private.",
    evidenceUrl: null,
    score: null,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    revisionReason: null,
  });
  const walletId = randomUUID();
  temporaryWalletIds.push(walletId);
  const keypair = Keypair.random();
  await database.insert(stellarWallets).values({
    id: walletId,
    userId: aliceId,
    network: "mainnet",
    publicKey: keypair.publicKey(),
  });
  await database.insert(stellarRoleVerifications).values({
    userId: aliceId,
    walletId,
    circleId: stellarCircle.id,
    assetId: stellarCircle.assetId,
    role: "verified-holder",
    ecosystem: "stellar",
    network: "mainnet",
    lastState: "verified",
  });

  // Public profile exposes only allowed fields.
  const alice = await getPublicProfileByHandle(aliceHandle, bobId);
  assert(alice, "Alice's public profile must resolve.");
  assert.equal(alice.user.handle, aliceHandle);
  assert(!("role" in alice.user), "Global role must not leak into public identity.");
  assert(alice.contributions.length === 1, "Only approved contributions may be public.");
  assert(
    alice.contributions.every((entry) => !("revisionReason" in entry)),
    "Review feedback must not leak into public contributions.",
  );
  assert.deepEqual(
    Object.keys(alice.user).sort(),
    ["assetInterests", "avatarUrl", "bio", "displayName", "handle", "id", "preferredEcosystems"],
    "Public identity must expose exactly the allowed fields.",
  );
  assert.deepEqual(
    Object.keys(alice).sort(),
    ["activity", "affiliations", "approvedContributionCount", "approvedPoints", "contributions", "followers", "following", "user", "verifiedRoles", "viewerFollowing", "watchedCircleCount", "watchedCircles"],
    "Public profile must expose exactly the allowed sections.",
  );
  assert(alice.verifiedRoles.length === 1, "The verified holder role must be public.");
  assert(alice.watchedCircles.some((entry) => entry.circle.slug === "usdc-on-stellar"));
  assert(alice.activity.length > 0, "Public activity must derive from safe records.");
  const leaked = JSON.stringify(alice);
  for (const forbidden of ["publicKey", "secret", "session", "accessToken", "refreshToken", "evidenceUrl", "privateKey"]) {
    assert(!new RegExp(forbidden, "i").test(leaked), `Public profile must not leak ${forbidden}.`);
  }
  assert.equal(await getPublicProfileByHandle(`no-such-person-${tag}`), null);

  // Follow graph: follow, idempotent duplicate, counts, self-block, unfollow.
  assert.deepEqual(await followUser(bobId, aliceHandle), { following: true });
  assert.deepEqual(await followUser(bobId, aliceHandle), { following: true });
  assert.equal(await countFollows(bobId, aliceId), 1, "Duplicate follows must remain one row.");
  const aliceCounts = await getFollowCounts(aliceId);
  assert.equal(aliceCounts.followers, 1);
  assert.equal(aliceCounts.following, 0);
  const bobCounts = await getFollowCounts(bobId);
  assert.equal(bobCounts.followers, 0);
  assert.equal(bobCounts.following, 1);
  await expectCode(followUser(bobId, bobHandle), "invalid-request");
  await expectCode(followUser(bobId, `ghost-${tag}`), "invalid-request");
  await expectCode(followUser(null, aliceHandle), "unauthenticated");

  // Another user cannot mutate Bob's follow of Alice.
  assert.deepEqual(await unfollowUser(carolId, aliceHandle), { following: false });
  assert.equal(await countFollows(bobId, aliceId), 1, "Unfollow by a third party must not remove the row.");

  // Viewer sees their own follow state on the profile.
  const aliceAsSeenByBob = await getPublicProfileByHandle(aliceHandle, bobId);
  assert.equal(aliceAsSeenByBob?.viewerFollowing, true);
  const aliceAsSeenByCarol = await getPublicProfileByHandle(aliceHandle, carolId);
  assert.equal(aliceAsSeenByCarol?.viewerFollowing, false);

  assert.deepEqual(await unfollowUser(bobId, aliceHandle), { following: false });
  assert.deepEqual(await unfollowUser(bobId, aliceHandle), { following: false });
  assert.equal((await getFollowCounts(aliceId)).followers, 0);

  // Circle people: one collapsed card per person, real relationships only.
  const people = await getCirclePeople(stellarCircle.id);
  const aliceCard = people.find((person) => person.user.id === aliceId);
  assert(aliceCard, "Alice must appear in Circle people.");
  assert.equal(people.filter((person) => person.user.id === aliceId).length, 1, "Duplicate people must collapse.");
  assert(aliceCard.relationships.includes("Watcher"));
  assert(aliceCard.relationships.includes("Contributor"));
  assert(aliceCard.relationships.includes("Verified"));
  assert(
    !aliceCard.relationships.some((rel) => rel === "Verified Holder" || rel === "Verified Trustline"),
    "P7.2 default-private: public relationships never distinguish holder from trustline.",
  );
  assert.equal(aliceCard.approvedContributionCount, 1);
  const peopleLeaked = JSON.stringify(people);
  assert(!/publicKey/i.test(peopleLeaked), "Circle people must not leak wallet keys.");
  assert(!/secret/i.test(peopleLeaked), "Circle people must not leak secrets.");

  // Ecosystem scoping + contributor discovery filters.
  const stellarPeople = await getEcosystemPeople("stellar", 8);
  assert(stellarPeople.some((person) => person.user.id === aliceId), "Alice must be active in Stellar.");
  assert.deepEqual(await getEcosystemPeople("dogechain", 8), []);
  const contributors = await listContributors({ ecosystem: "stellar", sort: "recent", limit: 10 });
  assert(contributors.some((person) => person.user.id === aliceId));
  const baseContributors = await listContributors({ ecosystem: "base", sort: "recent", limit: 10 });
  assert(!baseContributors.some((person) => person.user.id === aliceId), "Ecosystem filter must scope correctly.");

  console.log("Social verification passed", {
    publicBoundary: true,
    noWalletLeakage: true,
    pendingHidden: true,
    followIdempotent: true,
    selfFollowBlocked: true,
    countsCorrect: true,
    thirdPartyUnfollowSafe: true,
    unfollowWorks: true,
    circlePeopleCollapsed: true,
    ecosystemScoped: true,
  });
}

verify()
  .catch((error) => {
    console.error("Social verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
