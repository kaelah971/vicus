import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assets, circles, lessons, organizations } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();

const ORG_SLUG = "circle";
const USDC_SLUGS = ["usdc-on-stellar", "usdc-on-ethereum", "usdc-on-base", "usdc-on-solana"];
const LESSON_SLUG = "usdc-across-ecosystems";

const LESSON_BODY = [
  "USDC is a dollar-denominated digital token issued by Circle. It exists on several public networks, and Vicus hosts one Asset Circle for each network it tracks: Stellar, Ethereum, Base, and Solana.",
  "Each Circle carries its own Passport: what the asset representation means on that network, how to check official material, and where the limits are. A Passport informs questions; it never replaces official disclosures.",
  "On Stellar, USDC is a classic Stellar asset, so Vicus can verify holder and trustline roles against mainnet state. On Ethereum, Base, and Solana there is no equivalent onchain holder check in Vicus yet — those Circles are watch-and-learn communities with the same missions discipline.",
  "To participate, watch a Circle to follow it, read its Passport and any lessons, then complete an open mission. Quizzes grade automatically; written and research responses go through review. Approval records offchain Vicus points and can make a configured XLM reward eligible, settled on Stellar. Approval never moves funds by itself.",
  "Treat everything here as education. Nothing on Vicus is financial advice, and access, eligibility, and risk always depend on official sources, issuer rules, and your region.",
].join("\n\n");

async function seed() {
  const [existing] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, ORG_SLUG))
    .limit(1);

  let orgId = existing?.id ?? null;
  if (!orgId) {
    const [created] = await database
      .insert(organizations)
      .values({
        name: "Circle",
        slug: ORG_SLUG,
        description:
          "Circle issues USDC, a dollar-denominated digital token available on multiple public networks. This presence hosts the USDC Asset Circles tracked in Vicus.",
        websiteUrl: "https://www.circle.com",
        ecosystemFocus: null,
      })
      .onConflictDoNothing({ target: organizations.slug })
      .returning({ id: organizations.id });
    orgId = created?.id ?? null;
  }
  if (!orgId) {
    throw new Error("The Circle organization could not be ensured.");
  }

  const circleRows = await database
    .select({
      circle: circles,
      officialUrl: assets.officialUrl,
      verificationSourceUrl: assets.verificationSourceUrl,
    })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(inArray(circles.slug, USDC_SLUGS));

  const hosted: string[] = [];
  const skipped: string[] = [];
  for (const slug of USDC_SLUGS) {
    const row = circleRows.find((entry) => entry.circle.slug === slug);
    if (!row) {
      skipped.push(`${slug} (missing)`);
      continue;
    }
    if (row.circle.organizationId && row.circle.organizationId !== orgId) {
      skipped.push(`${slug} (hosted elsewhere)`);
      continue;
    }
    if (!row.circle.organizationId) {
      await database
        .update(circles)
        .set({ organizationId: orgId, updatedAt: new Date() })
        .where(eq(circles.id, row.circle.id));
    }
    hosted.push(slug);
  }

  const sourceUrls = new Map<string, string>();
  sourceUrls.set("Circle — USDC official site", "https://www.circle.com/usdc");
  for (const row of circleRows) {
    if (row.officialUrl) {
      sourceUrls.set(`Official asset source (${row.circle.slug})`, row.officialUrl);
    }
    if (row.verificationSourceUrl) {
      sourceUrls.set(`Verification source (${row.circle.slug})`, row.verificationSourceUrl);
    }
  }
  const sources = [...sourceUrls.entries()].slice(0, 8).map(([label, url]) => ({ label, url }));

  const [stellarCircle] = circleRows
    .filter((row) => row.circle.slug === "usdc-on-stellar")
    .map((row) => row.circle);

  const [existingLesson] = await database
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.slug, LESSON_SLUG))
    .limit(1);
  let lessonId = existingLesson?.id ?? null;
  if (!lessonId) {
    const [created] = await database
      .insert(lessons)
      .values({
        organizationId: orgId,
        circleId: stellarCircle?.id ?? null,
        title: "USDC across ecosystems",
        slug: LESSON_SLUG,
        summary:
          "What USDC is, how it appears across the Stellar, Ethereum, Base, and Solana Circles in Vicus, and how to learn and participate without treating education as financial advice.",
        body: LESSON_BODY,
        status: "published",
        sources,
      })
      .onConflictDoNothing({ target: lessons.slug })
      .returning({ id: lessons.id });
    lessonId = created?.id ?? null;
  }

  console.log("Circle organization seed complete", {
    orgId,
    hosted,
    skipped,
    lesson: lessonId ? LESSON_SLUG : "missing",
    sources: sources.length,
  });
}

seed().catch((error) => {
  console.error("Circle organization seed failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
