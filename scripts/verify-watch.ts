import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { circleMemberships, circles, users } from "../src/db/schema";
import { getDatabase } from "../src/db";
import { listWatchedCircleIds, unwatchCircle, watchCircle } from "../src/lib/data/watch";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const circleSlug = "usdc-on-stellar";

async function createUser() {
  const id = randomUUID();
  temporaryUserIds.push(id);
  await database.insert(users).values({
    id,
    handle: `watch-verify-${id.slice(0, 8)}`,
    displayName: "Watch verification member",
    avatarUrl: null,
    role: "member",
  });
  return id;
}

async function activeMembershipCount(userId: string, circleId: string) {
  const rows = await database
    .select({ id: circleMemberships.id })
    .from(circleMemberships)
    .where(
      and(
        eq(circleMemberships.userId, userId),
        eq(circleMemberships.circleId, circleId),
        isNull(circleMemberships.leftAt),
      ),
    );
  return rows.length;
}

async function cleanup() {
  if (temporaryUserIds.length === 0) return;
  await database.delete(circleMemberships).where(inArray(circleMemberships.userId, temporaryUserIds));
  await database.delete(users).where(inArray(users.id, temporaryUserIds));
}

async function verify() {
  const [circle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, circleSlug))
    .limit(1);
  assert(circle, "The seeded USDC circle is required for Watch verification.");

  const firstUserId = await createUser();
  const secondUserId = await createUser();

  assert.equal(await watchCircle(firstUserId, circleSlug), true);
  assert.equal(await watchCircle(firstUserId, circleSlug), true);
  assert.equal(await activeMembershipCount(firstUserId, circle.id), 1, "Duplicate Watch must remain one row.");
  assert.deepEqual(await listWatchedCircleIds(firstUserId), [circle.id]);

  assert.equal(await unwatchCircle(secondUserId, circleSlug), false, "Another user cannot mutate this Watch row.");
  assert.equal(await activeMembershipCount(firstUserId, circle.id), 1);

  assert.equal(await unwatchCircle(firstUserId, circleSlug), false);
  assert.equal(await activeMembershipCount(firstUserId, circle.id), 0);
  assert.deepEqual(await listWatchedCircleIds(firstUserId), []);

  console.log("Watch verification passed", {
    createWatch: true,
    duplicateWatchSingleRow: true,
    unauthorizedMutationRejected: true,
    unwatch: true,
    persistenceReadback: true,
  });
}

verify()
  .catch((error) => {
    console.error("Watch verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
