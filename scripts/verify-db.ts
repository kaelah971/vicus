import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { count, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  activityEvents,
  authChallenges,
  authSessions,
  assets,
  badges,
  campaigns,
  circleMemberships,
  circles,
  missionSubmissions,
  missions,
  stellarWallets,
  users,
} from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const database = drizzle(neon(databaseUrl));

async function verify() {
  const [
    userCount,
    assetCount,
    circleCount,
    missionCount,
    campaignCount,
    membershipCount,
    badgeCount,
    activityCount,
    submissionCount,
    walletCount,
    challengeCount,
    sessionCount,
  ] = await Promise.all([
    database.select({ count: count() }).from(users),
    database.select({ count: count() }).from(assets),
    database.select({ count: count() }).from(circles),
    database.select({ count: count() }).from(missions),
    database.select({ count: count() }).from(campaigns),
    database.select({ count: count() }).from(circleMemberships),
    database.select({ count: count() }).from(badges),
    database.select({ count: count() }).from(activityEvents),
    database.select({ count: count() }).from(missionSubmissions),
    database.select({ count: count() }).from(stellarWallets),
    database.select({ count: count() }).from(authChallenges),
    database.select({ count: count() }).from(authSessions),
  ]);
  const circleRows = await database.select({ slug: circles.slug }).from(circles).orderBy(asc(circles.featuredRank));
  const missionRows = await database
    .select({
      type: missions.type,
      status: missions.status,
      config: missions.missionConfig,
      duplicatePolicy: missions.duplicatePolicy,
      reviewMode: missions.reviewMode,
    })
    .from(missions);
  const assetVerificationRows = await database
    .select({
      code: assets.code,
      stellarAssetCode: assets.stellarAssetCode,
      stellarNetwork: assets.stellarNetwork,
      stellarIssuerAccount: assets.stellarIssuerAccount,
      verificationMode: assets.verificationMode,
    })
    .from(assets);
  const [demoUser] = await database.select({ handle: users.handle }).from(users).where(eq(users.handle, "demo"));

  const counts = {
    users: Number(userCount[0]?.count ?? 0),
    assets: Number(assetCount[0]?.count ?? 0),
    circles: Number(circleCount[0]?.count ?? 0),
    missions: Number(missionCount[0]?.count ?? 0),
    campaigns: Number(campaignCount[0]?.count ?? 0),
    memberships: Number(membershipCount[0]?.count ?? 0),
    badges: Number(badgeCount[0]?.count ?? 0),
    activityEvents: Number(activityCount[0]?.count ?? 0),
    missionSubmissions: Number(submissionCount[0]?.count ?? 0),
    stellarWallets: Number(walletCount[0]?.count ?? 0),
    authChallenges: Number(challengeCount[0]?.count ?? 0),
    authSessions: Number(sessionCount[0]?.count ?? 0),
  };
  const slugs = circleRows.map((row) => row.slug);
  const expectedSlugs = [
    "usdc-on-stellar",
    "pyusd-on-stellar",
    "usdy-on-stellar",
    "tokenized-treasury-education",
  ];

  const countsMatch =
    counts.users === 1 &&
    counts.assets === 3 &&
    counts.circles === 4 &&
    counts.missions === 6 &&
    counts.campaigns === 2 &&
    counts.memberships === 3 &&
    counts.badges === 4 &&
    counts.activityEvents === 4 &&
    counts.missionSubmissions === 0 &&
    counts.stellarWallets === 0 &&
    counts.authChallenges === 0 &&
    counts.authSessions === 0;
  const slugsMatch = expectedSlugs.every((slug) => slugs.includes(slug));
  const usdcConfig = assetVerificationRows.find((asset) => asset.code === "USDC");
  const pyusdConfig = assetVerificationRows.find((asset) => asset.code === "PYUSD");
  const usdyConfig = assetVerificationRows.find((asset) => asset.code === "USDY");
  const canonicalConfigMatch = Boolean(
    usdcConfig?.stellarAssetCode === "USDC" &&
      usdcConfig.stellarNetwork === "mainnet" &&
      usdcConfig.stellarIssuerAccount ===
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" &&
      usdcConfig.verificationMode === "classic-asset" &&
      pyusdConfig?.verificationMode === "sac-deferred" &&
      usdyConfig?.verificationMode === "unsupported",
  );
  const quizMission = missionRows.find((mission) => mission.type === "quiz");
  const textMission = missionRows.find((mission) => mission.type === "text");
  const researchMission = missionRows.find((mission) => mission.type === "research");
  const missionConfigMatch = Boolean(
    quizMission?.status === "open" &&
      quizMission.reviewMode === "automatic" &&
      quizMission.duplicatePolicy === "allow-revision" &&
      quizMission.config?.kind === "quiz" &&
      textMission?.status === "open" &&
      textMission.reviewMode === "manual" &&
      textMission.config?.kind === "text" &&
      researchMission?.status === "open" &&
      researchMission.reviewMode === "manual" &&
      researchMission.config?.kind === "research",
  );

  if (!demoUser || !countsMatch || !slugsMatch || !canonicalConfigMatch || !missionConfigMatch) {
    console.error("Database verification failed.");
    console.error({
      counts,
      slugs,
      demoUser: Boolean(demoUser),
      canonicalConfigMatch,
      missionConfigMatch,
    });
    process.exit(1);
  }

  console.log("Database verification passed", {
    counts,
    circleSlugs: slugs,
    canonicalAssetConfig: canonicalConfigMatch,
    missionConfig: missionConfigMatch,
    demoUser: demoUser.handle,
  });
}

verify().catch(() => {
  console.error("Database verification failed.");
  process.exitCode = 1;
});
