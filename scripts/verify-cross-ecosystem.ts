import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assets, circleMemberships, circles, missions, users } from "../src/db/schema";
import {
  getCircleBySlug,
  getCircleVerificationConfig,
  listCircles,
  listEcosystems,
} from "@/lib/data/circles";
import { listWatchedCircleIds, unwatchCircle, watchCircle } from "@/lib/data/watch";
import { parseMissionConfig } from "@/lib/missions/config";
import { normalizeXlmAmount } from "@/lib/rewards/config-core";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];
const expectedCircles = [
  { slug: "usdc-on-ethereum", ecosystem: "ethereum", chain: "Ethereum" },
  { slug: "usdc-on-base", ecosystem: "base", chain: "Base" },
  { slug: "usdc-on-solana", ecosystem: "solana", chain: "Solana" },
];

async function cleanup() {
  if (temporaryUserIds.length > 0) {
    await database
      .delete(circleMemberships)
      .where(inArray(circleMemberships.userId, temporaryUserIds));
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

async function verify() {
  // Non-Stellar assets are persisted with correct ecosystem values.
  const rows = await database
    .select({
      asset: assets,
      circle: circles,
    })
    .from(circles)
    .innerJoin(assets, eq(circles.assetId, assets.id))
    .where(
      inArray(
        circles.slug,
        expectedCircles.map((entry) => entry.slug),
      ),
    );

  assert.equal(rows.length, 3, "All three non-Stellar circles must be persisted.");
  for (const expected of expectedCircles) {
    const row = rows.find((entry) => entry.circle.slug === expected.slug);
    assert(row, `The ${expected.slug} circle must exist.`);
    assert.equal(row.asset.ecosystem, expected.ecosystem);
    assert.equal(row.asset.chain, expected.chain);
    assert.equal(row.asset.code, "USDC");
    assert.equal(row.asset.issuer, "Circle");
    assert(row.asset.officialUrl?.startsWith("https://www.circle.com/"));
    assert.equal(row.asset.stellarNetwork, null);
    assert.equal(row.asset.stellarAssetCode, null);
    assert.equal(row.asset.stellarIssuerAccount, null);
    assert.equal(row.asset.verificationMode, null);

    // No fake balance / chain state in stored content.
    const content = [
      row.asset.description,
      row.asset.intendedUse ?? "",
      row.asset.eligibilityNote ?? "",
      row.asset.riskNote ?? "",
      row.circle.tagline ?? "",
    ].join("\n");
    assert(!/\$\d/.test(content), `${expected.slug} must not contain prices.`);
    assert(!/apy|yield of|market cap/i.test(content), `${expected.slug} must not contain yield or market-cap claims.`);
  }

  // Sidebar + Discover ecosystems are data-driven.
  const ecosystems = await listEcosystems();
  const values = new Set(ecosystems.map((entry) => entry.value));
  for (const expected of ["stellar", "ethereum", "base", "solana"]) {
    assert(values.has(expected), `The ${expected} ecosystem must be listed from DB data.`);
  }

  const allCircles = await listCircles(null);
  for (const expected of expectedCircles) {
    const match = allCircles.filter((circle) => circle.ecosystem === expected.ecosystem);
    assert(match.length >= 1, `Discover filtering by ${expected.ecosystem} must return assets.`);
    assert(
      match.every((circle) => circle.ecosystemLabel === expected.chain),
      `Ecosystem labels for ${expected.ecosystem} must read ${expected.chain}.`,
    );
  }
  assert(
    allCircles.filter((circle) => circle.ecosystem === "stellar").length >= 1,
    "Stellar filtering must keep working.",
  );

  // Watch works unchanged for a non-Stellar circle.
  const userId = randomUUID();
  temporaryUserIds.push(userId);
  await database.insert(users).values({
    id: userId,
    handle: `xeco-verify-${userId.slice(0, 8)}`,
    displayName: "Cross-ecosystem verification member",
    avatarUrl: null,
    role: "member",
  });
  assert.equal(await watchCircle(userId, "usdc-on-base"), true);
  const watched = await listWatchedCircleIds(userId);
  const [baseCircle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, "usdc-on-base"))
    .limit(1);
  assert(baseCircle && watched.includes(baseCircle.id), "Watch must persist for the Base circle.");
  assert.equal(await unwatchCircle(userId, "usdc-on-base"), false);

  // Non-Stellar circles do NOT expose Stellar holder verification.
  for (const expected of expectedCircles) {
    const verificationConfig = await getCircleVerificationConfig(expected.slug);
    assert(verificationConfig, `Verification config must resolve for ${expected.slug}.`);
    assert.equal(verificationConfig.verificationMode, null);
    const detail = await getCircleBySlug(expected.slug, null);
    assert(detail && !detail.verification.enabled, `${expected.slug} must not enable role verification.`);
  }

  // Stellar circles STILL expose supported role verification.
  const stellarConfig = await getCircleVerificationConfig("usdc-on-stellar");
  assert.equal(stellarConfig?.verificationMode, "classic-asset");
  assert.equal(stellarConfig?.stellarNetwork, "mainnet");
  assert(stellarConfig?.stellarAssetCode && stellarConfig?.stellarIssuerAccount);
  const stellarDetail = await getCircleBySlug("usdc-on-stellar", null);
  assert(stellarDetail?.verification.enabled, "USDC on Stellar must keep role verification enabled.");

  // Cross-ecosystem mission attached to the Base circle with Stellar-Testnet XLM config.
  const [mission] = await database
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.circleId, baseCircle!.id),
        eq(missions.title, "Understand USDC on Base"),
      ),
    )
    .limit(1);
  assert(mission, "The Base learning mission must be attached to the Base circle.");
  assert.equal(mission.type, "quiz");
  assert.equal(mission.status, "open");
  assert.equal(mission.reviewMode, "automatic");
  assert.equal(mission.rewardAsset, "XLM");
  assert.equal(normalizeXlmAmount(String(mission.rewardAmount)), "0.05");
  const parsed = parseMissionConfig(mission.missionConfig);
  assert(parsed?.kind === "quiz", "The Base mission must carry a server-side quiz config.");
  assert(parsed.questions.length >= 3, "The Base quiz must ask source-backed questions.");
  assert(
    parsed.questions.every(
      (question) => typeof question.correctAnswer === "string" && question.choices.includes(question.correctAnswer),
    ),
    "Answer keys must remain server-side in missionConfig.",
  );
  assert(
    /Stellar Testnet/.test(mission.description),
    "Mission copy must state the Stellar Testnet settlement network.",
  );

  // Existing confirmed 0.1 XLM reward mission remains untouched.
  const [legacyMission] = await database
    .select({ rewardAsset: missions.rewardAsset, rewardAmount: missions.rewardAmount })
    .from(missions)
    .where(eq(missions.id, "00000000-0000-0000-0000-000000000401"))
    .limit(1);
  assert.equal(legacyMission?.rewardAsset, "XLM");
  assert.equal(normalizeXlmAmount(String(legacyMission?.rewardAmount)), "0.1");

  // No active memberships leak into the new circles from verification.
  const [stray] = await database
    .select({ id: circleMemberships.id })
    .from(circleMemberships)
    .where(
      and(
        eq(circleMemberships.circleId, baseCircle!.id),
        eq(circleMemberships.userId, userId),
        isNull(circleMemberships.leftAt),
      ),
    )
    .limit(1);
  assert(!stray, "Unwatch must leave no active membership behind.");

  console.log("Cross-ecosystem verification passed", {
    nonStellarAssetsPersisted: 3,
    ecosystemsDataDriven: ["stellar", "ethereum", "base", "solana"],
    watchOnBase: true,
    noStellarVerificationOnNonStellar: true,
    stellarVerificationPreserved: true,
    baseMissionReward: "0.05 XLM",
    legacyRewardUntouched: "0.1 XLM",
  });
}

verify()
  .catch((error) => {
    console.error("Cross-ecosystem verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
