import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
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
import { circles as circleContent } from "../src/lib/vicus-data";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const database = drizzle(sql);
const seedTimestamp = new Date("2025-01-01T00:00:00.000Z");

const ids = {
  user: "00000000-0000-0000-0000-000000000001",
  usdcAsset: "00000000-0000-0000-0000-000000000101",
  pyusdAsset: "00000000-0000-0000-0000-000000000102",
  usdyAsset: "00000000-0000-0000-0000-000000000103",
  usdcCircle: "00000000-0000-0000-0000-000000000201",
  pyusdCircle: "00000000-0000-0000-0000-000000000202",
  usdyCircle: "00000000-0000-0000-0000-000000000203",
  treasuryCircle: "00000000-0000-0000-0000-000000000204",
  campaignOne: "00000000-0000-0000-0000-000000000301",
  campaignTwo: "00000000-0000-0000-0000-000000000302",
  missionOne: "00000000-0000-0000-0000-000000000401",
  missionTwo: "00000000-0000-0000-0000-000000000402",
  missionThree: "00000000-0000-0000-0000-000000000403",
  missionFour: "00000000-0000-0000-0000-000000000404",
  missionFive: "00000000-0000-0000-0000-000000000405",
  missionSix: "00000000-0000-0000-0000-000000000406",
  membershipOne: "00000000-0000-0000-0000-000000000501",
  membershipTwo: "00000000-0000-0000-0000-000000000502",
  membershipThree: "00000000-0000-0000-0000-000000000503",
  badgeOne: "00000000-0000-0000-0000-000000000601",
  badgeTwo: "00000000-0000-0000-0000-000000000602",
  badgeThree: "00000000-0000-0000-0000-000000000603",
  badgeFour: "00000000-0000-0000-0000-000000000604",
  activityOne: "00000000-0000-0000-0000-000000000701",
  activityTwo: "00000000-0000-0000-0000-000000000702",
  activityThree: "00000000-0000-0000-0000-000000000703",
  activityFour: "00000000-0000-0000-0000-000000000704",
};

const [usdc, pyusd, usdy, treasury] = circleContent;

async function seed() {
  // Development seed: clear the development participation tables first, then recreate stable records.
  await database.delete(authSessions);
  await database.delete(authChallenges);
  await database.delete(stellarWallets);
  await database.delete(missionSubmissions);
  await database.delete(activityEvents);
  await database.delete(missions);
  await database.delete(badges);
  await database.delete(circleMemberships);
  await database.delete(campaigns);
  await database.delete(circles);
  await database.delete(assets);
  await database.delete(users);

  await database.insert(users).values({
    id: ids.user,
    handle: "demo",
    displayName: "Demo participant",
    avatarUrl: null,
    role: "admin",
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  });

  await database.insert(assets).values([
    {
      id: ids.usdcAsset,
      code: usdc.code,
      issuer: null,
      chain: usdc.network,
      type: "asset education",
      stellarNetwork: usdc.stellar?.network ?? null,
      stellarAssetCode: usdc.stellar?.assetCode ?? null,
      stellarIssuerAccount: usdc.stellar?.issuerAccount ?? null,
      stellarContractId: usdc.stellar?.contractId ?? null,
      verificationMode: usdc.stellar?.verificationMode ?? null,
      verificationSourceUrl: usdc.stellar?.verificationSourceUrl ?? null,
      name: usdc.name,
      description: usdc.description,
      intendedUse: usdc.intendedUse,
      officialUrl: usdc.sourceUrl,
      riskNote: usdc.riskNote,
      eligibilityNote: usdc.eligibilityNote,
      sourceStatus: usdc.sourceStatus,
      lastVerifiedAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.pyusdAsset,
      code: pyusd.code,
      issuer: null,
      chain: pyusd.network,
      type: "asset education",
      stellarNetwork: pyusd.stellar?.network ?? null,
      stellarAssetCode: pyusd.stellar?.assetCode ?? null,
      stellarIssuerAccount: pyusd.stellar?.issuerAccount ?? null,
      stellarContractId: pyusd.stellar?.contractId ?? null,
      verificationMode: pyusd.stellar?.verificationMode ?? null,
      verificationSourceUrl: pyusd.stellar?.verificationSourceUrl ?? null,
      name: pyusd.name,
      description: pyusd.description,
      intendedUse: pyusd.intendedUse,
      officialUrl: pyusd.sourceUrl,
      riskNote: pyusd.riskNote,
      eligibilityNote: pyusd.eligibilityNote,
      sourceStatus: pyusd.sourceStatus,
      lastVerifiedAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.usdyAsset,
      code: usdy.code,
      issuer: null,
      chain: usdy.network,
      type: "asset education",
      stellarNetwork: usdy.stellar?.network ?? null,
      stellarAssetCode: usdy.stellar?.assetCode ?? null,
      stellarIssuerAccount: usdy.stellar?.issuerAccount ?? null,
      stellarContractId: usdy.stellar?.contractId ?? null,
      verificationMode: usdy.stellar?.verificationMode ?? null,
      verificationSourceUrl: usdy.stellar?.verificationSourceUrl ?? null,
      name: usdy.name,
      description: usdy.description,
      intendedUse: usdy.intendedUse,
      officialUrl: usdy.sourceUrl,
      riskNote: usdy.riskNote,
      eligibilityNote: usdy.eligibilityNote,
      sourceStatus: usdy.sourceStatus,
      lastVerifiedAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
  ]);

  await database.insert(circles).values([
    {
      id: ids.usdcCircle,
      assetId: ids.usdcAsset,
      slug: usdc.slug,
      name: usdc.name,
      tagline: usdc.summary,
      status: "pending",
      category: usdc.category,
      officialStatus: "pending",
      featuredRank: 1,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.pyusdCircle,
      assetId: ids.pyusdAsset,
      slug: pyusd.slug,
      name: pyusd.name,
      tagline: pyusd.summary,
      status: "pending",
      category: pyusd.category,
      officialStatus: "pending",
      featuredRank: 2,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.usdyCircle,
      assetId: ids.usdyAsset,
      slug: usdy.slug,
      name: usdy.name,
      tagline: usdy.summary,
      status: "pending",
      category: usdy.category,
      officialStatus: "pending",
      featuredRank: 3,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.treasuryCircle,
      assetId: null,
      slug: treasury.slug,
      name: treasury.name,
      tagline: treasury.summary,
      status: "education-only",
      category: treasury.category,
      officialStatus: "community",
      featuredRank: 4,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
  ]);

  await database.insert(campaigns).values([
    {
      id: ids.campaignOne,
      issuerUserId: null,
      circleId: ids.usdcCircle,
      objective: "Preview an education campaign around the asset Passport.",
      budgetAsset: null,
      budgetAmount: null,
      budgetStatus: "not-configured",
      status: "draft",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.campaignTwo,
      issuerUserId: null,
      circleId: ids.treasuryCircle,
      objective: "Preview a category-level learning campaign without an asset claim.",
      budgetAsset: null,
      budgetAmount: null,
      budgetStatus: "not-configured",
      status: "draft",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
  ]);

  await database.insert(missions).values([
    {
      id: ids.missionOne,
      circleId: ids.usdcCircle,
      campaignId: ids.campaignOne,
      type: "quiz",
      title: "Understand USDC on Stellar",
      description:
        "Read the USDC Passport and check your understanding of what the asset represents, what it does not promise, and which eligibility and risk notes matter.",
      points: 100,
      rewardAsset: "XLM",
      rewardAmount: "0.1",
      eligibilityRule: { kind: "education-only", note: "This is a proof-of-understanding check." },
      missionConfig: {
        kind: "quiz",
        passingScore: 3,
        questions: [
          {
            id: "represents",
            prompt: "What does USDC on Stellar represent in this circle?",
            choices: [
              "A dollar-denominated token represented in a Stellar asset ecosystem",
              "A guaranteed return paid by Vicus",
              "An issuer approval for every visitor",
            ],
            correctAnswer: "A dollar-denominated token represented in a Stellar asset ecosystem",
          },
          {
            id: "does-not-represent",
            prompt: "What does this entry not represent?",
            choices: [
              "A source-linked educational asset context",
              "A guarantee of investment returns or universal access",
              "A reason to read official eligibility notes",
            ],
            correctAnswer: "A guarantee of investment returns or universal access",
          },
          {
            id: "eligibility",
            prompt: "Which eligibility statement is accurate?",
            choices: [
              "Every visitor is automatically approved",
              "A quiz pass grants a wallet trustline",
              "Access and eligibility can depend on official sources, issuer rules, and region",
            ],
            correctAnswer: "Access and eligibility can depend on official sources, issuer rules, and region",
          },
          {
            id: "risk",
            prompt: "Which risk and context statement is accurate?",
            choices: [
              "A positive role result guarantees future value",
              "Educational content is not financial advice, and asset access and risks vary",
              "Mission points are a blockchain asset",
            ],
            correctAnswer: "Educational content is not financial advice, and asset access and risks vary",
          },
        ],
      },
      duplicatePolicy: "allow-revision",
      reviewMode: "automatic",
      status: "open",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.missionTwo,
      circleId: ids.usdcCircle,
      campaignId: ids.campaignOne,
      type: "text",
      title: "Write a source-backed USDC explainer",
      description:
        "Write a short, neutral explanation of what USDC on Stellar represents and one boundary a new participant should understand.",
      points: 150,
      rewardAsset: null,
      rewardAmount: null,
      eligibilityRule: { kind: "education-only", note: "A reviewer checks the response and source." },
      missionConfig: {
        kind: "text",
        minLength: 80,
        maxLength: 2_000,
        evidenceRequired: true,
        evidencePrompt: "Use the official Circle source and explain the point it supports.",
      },
      duplicatePolicy: "allow-revision",
      reviewMode: "manual",
      status: "open",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.missionThree,
      circleId: ids.pyusdCircle,
      campaignId: null,
      type: pyusd.mission!.type,
      title: pyusd.mission!.title,
      description: pyusd.mission!.description,
      points: 0,
      rewardAsset: null,
      rewardAmount: null,
      eligibilityRule: { kind: "education-only", note: "Preview content; eligibility is not evaluated." },
      missionConfig: null,
      duplicatePolicy: "one-per-user",
      reviewMode: "not-connected",
      status: "preview",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.missionFour,
      circleId: ids.usdyCircle,
      campaignId: null,
      type: usdy.mission!.type,
      title: usdy.mission!.title,
      description: usdy.mission!.description,
      points: 0,
      rewardAsset: null,
      rewardAmount: null,
      eligibilityRule: { kind: "education-only", note: "Preview content; eligibility is not evaluated." },
      missionConfig: null,
      duplicatePolicy: "one-per-user",
      reviewMode: "not-connected",
      status: "preview",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.missionFive,
      circleId: ids.treasuryCircle,
      campaignId: ids.campaignTwo,
      type: treasury.mission!.type,
      title: treasury.mission!.title,
      description: treasury.mission!.description,
      points: 0,
      rewardAsset: null,
      rewardAmount: null,
      eligibilityRule: { kind: "education-only", note: "This circle has no asset eligibility." },
      missionConfig: null,
      duplicatePolicy: "one-per-user",
      reviewMode: "not-connected",
      status: "preview",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
    {
      id: ids.missionSix,
      circleId: ids.treasuryCircle,
      campaignId: ids.campaignTwo,
      type: "research",
      title: "Build a better source question",
      description:
        "Submit one useful question a primary source should answer before a learner treats a tokenized treasury description as complete.",
      points: 75,
      rewardAsset: null,
      rewardAmount: null,
      eligibilityRule: { kind: "education-only", note: "A reviewer checks the response and source." },
      missionConfig: {
        kind: "research",
        minLength: 40,
        maxLength: 1_200,
        evidenceRequired: true,
        evidencePrompt: "Link the primary source that motivated your question.",
      },
      duplicatePolicy: "allow-revision",
      reviewMode: "manual",
      status: "open",
      startsAt: null,
      endsAt: null,
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    },
  ]);

  await database.insert(circleMemberships).values([
    {
      id: ids.membershipOne,
      circleId: ids.usdcCircle,
      userId: ids.user,
      role: "watcher",
      source: "seeded-demo",
      joinedAt: seedTimestamp,
      leftAt: null,
    },
    {
      id: ids.membershipTwo,
      circleId: ids.pyusdCircle,
      userId: ids.user,
      role: "watcher",
      source: "seeded-demo",
      joinedAt: seedTimestamp,
      leftAt: null,
    },
    {
      id: ids.membershipThree,
      circleId: ids.treasuryCircle,
      userId: ids.user,
      role: "early-circle-member",
      source: "seeded-demo",
      joinedAt: seedTimestamp,
      leftAt: null,
    },
  ]);

  await database.insert(badges).values([
    {
      id: ids.badgeOne,
      userId: ids.user,
      circleId: ids.usdcCircle,
      badgeType: "watcher",
      metadata: { fixture: true, note: "Seeded demo role; no wallet verification." },
      awardedAt: seedTimestamp,
      revokedAt: null,
    },
    {
      id: ids.badgeTwo,
      userId: ids.user,
      circleId: ids.treasuryCircle,
      badgeType: "researcher",
      metadata: { fixture: true, note: "Example badge type; no contribution was submitted." },
      awardedAt: seedTimestamp,
      revokedAt: null,
    },
    {
      id: ids.badgeThree,
      userId: ids.user,
      circleId: ids.treasuryCircle,
      badgeType: "early-circle-member",
      metadata: { fixture: true, note: "Seeded demo role; no milestone was evaluated." },
      awardedAt: seedTimestamp,
      revokedAt: null,
    },
    {
      id: ids.badgeFour,
      userId: ids.user,
      circleId: ids.pyusdCircle,
      badgeType: "watcher",
      metadata: { fixture: true, note: "Seeded demo role; no wallet verification." },
      awardedAt: seedTimestamp,
      revokedAt: null,
    },
  ]);

  await database.insert(activityEvents).values([
    {
      id: ids.activityOne,
      userId: null,
      circleId: ids.usdcCircle,
      type: "pulse",
      metadata: {
        label: "Seeded preview",
        title: "Source review is pending",
        detail: "No issuer activity is represented by this development seed.",
      },
      createdAt: seedTimestamp,
    },
    {
      id: ids.activityTwo,
      userId: null,
      circleId: ids.pyusdCircle,
      type: "pulse",
      metadata: {
        label: "Seeded preview",
        title: "The circle is ready for source-led context",
        detail: "No access, approval, or campaign is implied by this entry.",
      },
      createdAt: seedTimestamp,
    },
    {
      id: ids.activityThree,
      userId: null,
      circleId: ids.usdyCircle,
      type: "pulse",
      metadata: {
        label: "Seeded preview",
        title: "Asset language stays separate from promises",
        detail: "No yield, balance, or return information is stored in this seed.",
      },
      createdAt: seedTimestamp,
    },
    {
      id: ids.activityFour,
      userId: null,
      circleId: ids.treasuryCircle,
      type: "pulse",
      metadata: {
        label: "Seeded preview",
        title: "Education-only context is available",
        detail: "This circle has no asset record, issuer, or eligibility check.",
      },
      createdAt: seedTimestamp,
    },
  ]);

  console.log("Seeded Vicus development data", {
    users: 1,
    assets: 3,
    circles: 4,
    campaigns: 2,
    missions: 6,
    missionSubmissions: 0,
    memberships: 3,
    badges: 4,
    activityEvents: 4,
  });
}

seed().catch(() => {
  console.error("Vicus database seed failed.");
  process.exitCode = 1;
});
