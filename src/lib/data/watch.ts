import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { circleMemberships, circles } from "@/db/schema";

export async function watchCircle(userId: string, slug: string): Promise<boolean | null> {
  const database = getDatabase();
  const [circle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, slug.trim()))
    .limit(1);
  if (!circle) return null;

  const [existing] = await database
    .select({ id: circleMemberships.id })
    .from(circleMemberships)
    .where(and(eq(circleMemberships.circleId, circle.id), eq(circleMemberships.userId, userId)))
    .limit(1);

  if (existing) {
    await database
      .update(circleMemberships)
      .set({ role: "watcher", source: "user-watch", leftAt: null })
      .where(eq(circleMemberships.id, existing.id));
  } else {
    await database.insert(circleMemberships).values({
      circleId: circle.id,
      userId,
      role: "watcher",
      source: "user-watch",
    });
  }

  return true;
}

export async function unwatchCircle(userId: string, slug: string): Promise<boolean | null> {
  const database = getDatabase();
  const [circle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, slug.trim()))
    .limit(1);
  if (!circle) return null;

  await database
    .update(circleMemberships)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(circleMemberships.circleId, circle.id),
        eq(circleMemberships.userId, userId),
        isNull(circleMemberships.leftAt),
      ),
    );

  return false;
}

export async function listWatchedCircleIds(userId: string): Promise<string[]> {
  const database = getDatabase();
  const rows = await database
    .select({ circleId: circleMemberships.circleId })
    .from(circleMemberships)
    .where(and(eq(circleMemberships.userId, userId), isNull(circleMemberships.leftAt)));
  return rows.map(({ circleId }) => circleId);
}
