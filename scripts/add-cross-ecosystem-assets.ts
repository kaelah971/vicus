import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assets, circles, missions } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const database = drizzle(neon(databaseUrl));
const now = new Date();

const ids = {
  ethereumAsset: "00000000-0000-0000-0000-000000000111",
  baseAsset: "00000000-0000-0000-0000-000000000112",
  solanaAsset: "00000000-0000-0000-0000-000000000113",
  ethereumCircle: "00000000-0000-0000-0000-000000000211",
  baseCircle: "00000000-0000-0000-0000-000000000212",
  solanaCircle: "00000000-0000-0000-0000-000000000213",
  baseMission: "00000000-0000-0000-0000-000000000411",
};

/**
 * Cross-ecosystem discovery data. Every claim below is backed by an official
 * issuer/project source (see officialUrl per asset). No prices, yields, market
 * caps, availability, or holder-state claims are stored. Last reviewed against
 * official sources on 2026-10-11.
 */
const newAssets = [
  {
    id: ids.ethereumAsset,
    slug: "usdc-on-ethereum",
    code: "USDC",
    chain: "Ethereum",
    ecosystem: "ethereum",
    type: "asset education",
    issuer: "Circle",
    name: "USDC on Ethereum",
    tagline:
      "A watch-first circle for learning how a dollar-denominated token is represented on Ethereum.",
    description:
      "USDC is a dollar-denominated digital currency issued by Circle and represented on public blockchains including Ethereum, where it circulates as an ERC-20 token (contract 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; confirm on Etherscan). This entry is educational; terms and access should always be confirmed with official sources.",
    intendedUse:
      "Build context for what a dollar-denominated token on Ethereum represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.circle.com/multi-chain-usdc/ethereum",
    riskNote:
      "This is educational content, not financial advice. Asset access, restrictions, and risks vary by venue and region.",
    eligibilityNote:
      "Access and eligibility can depend on wallets, venues, issuer rules, and region. Vicus performs no Ethereum holder verification, and watching this Circle is not proof of ownership.",
    sourceStatus: "Circle source",
  },
  {
    id: ids.baseAsset,
    slug: "usdc-on-base",
    code: "USDC",
    chain: "Base",
    ecosystem: "base",
    type: "asset education",
    issuer: "Circle",
    name: "USDC on Base",
    tagline:
      "A watch-first circle for learning how a dollar-denominated token is represented on Base.",
    description:
      "USDC is a dollar-denominated digital currency issued by Circle and represented on public blockchains including Base. This entry is educational; contract addresses should be confirmed on a Base block explorer, and terms and access should always be confirmed with official sources.",
    intendedUse:
      "Build context for what a dollar-denominated token on Base represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.circle.com/multi-chain-usdc/base",
    riskNote:
      "This is educational content, not financial advice. Asset access, restrictions, and risks vary by venue and region.",
    eligibilityNote:
      "Access and eligibility can depend on wallets, venues, issuer rules, and region. Vicus performs no Base holder verification, and watching this Circle is not proof of ownership.",
    sourceStatus: "Circle source",
  },
  {
    id: ids.solanaAsset,
    slug: "usdc-on-solana",
    code: "USDC",
    chain: "Solana",
    ecosystem: "solana",
    type: "asset education",
    issuer: "Circle",
    name: "USDC on Solana",
    tagline:
      "A watch-first circle for learning how a dollar-denominated token is represented on Solana.",
    description:
      "USDC is a dollar-denominated digital currency issued by Circle and represented on public blockchains including Solana (mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v; confirm on Solscan). This entry is educational; terms and access should always be confirmed with official sources.",
    intendedUse:
      "Build context for what a dollar-denominated token on Solana represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.circle.com/multi-chain-usdc/solana",
    riskNote:
      "This is educational content, not financial advice. Asset access, restrictions, and risks vary by venue and region.",
    eligibilityNote:
      "Access and eligibility can depend on wallets, venues, issuer rules, and region. Vicus performs no Solana holder verification, and watching this Circle is not proof of ownership.",
    sourceStatus: "Circle source",
  },
];

const baseQuizMission = {
  id: ids.baseMission,
  type: "quiz",
  title: "Understand USDC on Base",
  description:
    "Read the USDC on Base Passport and check your understanding of what the asset represents, where rewards settle, and what Vicus does not verify. Approved completion earns Vicus points and can become eligible for a 0.05 XLM reward on Stellar Testnet. The reward settles on Stellar — not on Base.",
  points: 100,
  rewardAsset: "XLM",
  rewardAmount: "0.05",
  eligibilityRule: { kind: "education-only", note: "This is a proof-of-understanding check." },
  missionConfig: {
    kind: "quiz",
    passingScore: 3,
    questions: [
      {
        id: "represents",
        prompt: "What does USDC on Base represent in this circle?",
        choices: [
          "An educational context for a dollar-denominated token represented on Base",
          "A guaranteed return paid by Vicus",
          "An issuer approval for every visitor",
        ],
        correctAnswer:
          "An educational context for a dollar-denominated token represented on Base",
      },
      {
        id: "does-not-promise",
        prompt: "What does this entry not promise?",
        choices: [
          "A source-linked educational asset context",
          "A guarantee of investment returns or universal access",
          "A reason to read official eligibility notes",
        ],
        correctAnswer: "A guarantee of investment returns or universal access",
      },
      {
        id: "reward-network",
        prompt: "If this mission carries a reward, where does it settle?",
        choices: [
          "As 0.05 XLM on Stellar Testnet — the asset ecosystem is not the reward network",
          "As a token issued on Base",
          "As a balance paid directly to any pasted address",
        ],
        correctAnswer:
          "As 0.05 XLM on Stellar Testnet — the asset ecosystem is not the reward network",
      },
      {
        id: "verification-boundary",
        prompt: "Which verification statement is accurate?",
        choices: [
          "Watching this Circle proves token ownership",
          "Onchain holder verification for Base is not supported yet",
          "A pasted address creates a Profile role",
        ],
        correctAnswer: "Onchain holder verification for Base is not supported yet",
      },
    ],
  },
  duplicatePolicy: "allow-revision",
  reviewMode: "automatic",
  status: "open",
};

async function addCrossEcosystemAssets() {
  const existingCircles = await database
    .select({ slug: circles.slug })
    .from(circles);
  const existingSlugs = new Set(existingCircles.map((row) => row.slug));

  let insertedAssets = 0;
  let insertedCircles = 0;
  let insertedMissions = 0;

  for (const [index, entry] of newAssets.entries()) {
    if (existingSlugs.has(entry.slug)) {
      continue;
    }

    await database
      .insert(assets)
      .values({
        id: entry.id,
        code: entry.code,
        issuer: entry.issuer,
        chain: entry.chain,
        ecosystem: entry.ecosystem,
        type: entry.type,
        stellarNetwork: null,
        stellarAssetCode: null,
        stellarIssuerAccount: null,
        stellarContractId: null,
        verificationMode: null,
        verificationSourceUrl: entry.officialUrl,
        name: entry.name,
        description: entry.description,
        intendedUse: entry.intendedUse,
        officialUrl: entry.officialUrl,
        riskNote: entry.riskNote,
        eligibilityNote: entry.eligibilityNote,
        sourceStatus: entry.sourceStatus,
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: assets.id });
    insertedAssets += 1;

    const circleId =
      entry.slug === "usdc-on-ethereum"
        ? ids.ethereumCircle
        : entry.slug === "usdc-on-base"
          ? ids.baseCircle
          : ids.solanaCircle;

    await database
      .insert(circles)
      .values({
        id: circleId,
        assetId: entry.id,
        slug: entry.slug,
        name: entry.name,
        tagline: entry.tagline,
        status: "pending",
        category: "stablecoin",
        officialStatus: "pending",
        featuredRank: 5 + index,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: circles.id });
    insertedCircles += 1;
    existingSlugs.add(entry.slug);
  }

  const [baseCircle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, "usdc-on-base"))
    .limit(1);

  if (baseCircle) {
    const [existingMission] = await database
      .select({ id: missions.id })
      .from(missions)
      .where(eq(missions.id, baseQuizMission.id))
      .limit(1);

    if (!existingMission) {
      await database
        .insert(missions)
        .values({
          id: baseQuizMission.id,
          circleId: baseCircle.id,
          campaignId: null,
          type: baseQuizMission.type,
          title: baseQuizMission.title,
          description: baseQuizMission.description,
          points: baseQuizMission.points,
          rewardAsset: baseQuizMission.rewardAsset,
          rewardAmount: baseQuizMission.rewardAmount,
          eligibilityRule: baseQuizMission.eligibilityRule,
          missionConfig: baseQuizMission.missionConfig,
          duplicatePolicy: baseQuizMission.duplicatePolicy,
          reviewMode: baseQuizMission.reviewMode,
          status: baseQuizMission.status,
          startsAt: null,
          endsAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: missions.id });
      insertedMissions += 1;
    }
  }

  console.log("Cross-ecosystem assets ensured", {
    insertedAssets,
    insertedCircles,
    insertedMissions,
  });
}

addCrossEcosystemAssets().catch((error) => {
  console.error("Cross-ecosystem asset insertion failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
