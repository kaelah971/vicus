import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetCapabilities, assetLifecycleSteps, assets, circles } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

// External Asset Expansion V1 — two strongly verified tokenized stocks.
// TSLAx: Tesla xStock by Backed on Solana. Mint XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB
// verified 2026-10-12 via Jupiter's curated token search (exact symbol TSLAx,
// "Tesla xStock", 8 decimals, Backed metadata domain xstocks-metadata.backed.fi,
// Token-2022 program, ~229k supply) with look-alike pump/meme mints excluded;
// live 25-USDC Jupiter quote returned a real price the same day.
// NVDAc: Nvidia Coinbase tokenized stock on Base. Contract
// 0xb20000000000000000000078ee7ce2fE4908108C mapped from the official
// https://www.base.org/stocks page (BaseScan link labeled NVDAc) and read back
// live from Base Mainnet (symbol NVDAc, decimals 8) the same day.
// No Vicus execution is wired for either asset: official/guide actions only.
// Ethereum and BNB Chain were investigated and SKIPPED — no candidate cleared
// the exact-identity bar (see slice report). Seeds cannot import server-only
// modules, so values are kept literal here.

const database = getDatabase();
const now = new Date();

const RISK_STOCK =
  "This is educational content, not financial advice. Tokenized stocks carry issuer, liquidity, and regulatory risk.";

type SeedTarget = {
  slug: string;
  code: string;
  assetClass: string;
  issuer: string;
  network: string;
  ecosystem: string;
  mintOrContract: string;
  verificationMode: string;
  officialUrl: string;
  verificationSourceUrl: string;
  name: string;
  tagline: string;
  representation: string;
  eligibilityNote: string;
  sourceStatus: string;
  intendedUse: string;
  assetId: string;
  circleId: string;
  featuredRank: number;
  steps: {
    stage: string;
    title: string;
    shortDescription: string;
    supportMode: string;
    accessMode: string | null;
    ctaLabel: string | null;
    destinationUrl: string | null;
    eligibilityNote: string | null;
    sortOrder: number;
  }[];
  capabilities: {
    capabilityType: string;
    title: string;
    shortDescription: string;
    supportMode: "connected" | "guide";
    ctaLabel: string;
    destinationUrl: string | null;
    eligibilityNote: string | null;
    sortOrder: number;
  }[];
};

const TARGETS: SeedTarget[] = [
  {
    slug: "tslax-on-solana",
    code: "TSLAx",
    assetClass: "equity_fund",
    issuer: "Backed (xStocks)",
    network: "Solana",
    ecosystem: "solana",
    mintOrContract: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    verificationMode: "solana-mint",
    officialUrl: "https://xstocks.fi/",
    verificationSourceUrl: "https://docs.xstocks.fi/docs",
    name: "TSLAx on Solana",
    tagline: "Tesla exposure as an xStock on Solana.",
    representation:
      "A Tesla xStock by Backed tracking Tesla: 1:1 backed by the underlying share, permissionless onchain transfers, self-custody, fractional by design.",
    eligibilityNote:
      "Not available in the United States, to US persons, or in other restricted jurisdictions. Vicus performs no eligibility verification.",
    sourceStatus: "xStocks + Jupiter source",
    intendedUse:
      "Build context for what a Tesla xStock on Solana represents before deciding whether any action is relevant to you.",
    assetId: "00000000-0000-0000-0000-000000000142",
    circleId: "00000000-0000-0000-0000-000000000242",
    featuredRank: 32,
    steps: [
      { stage: "access", title: "Confirm eligibility first", shortDescription: "xStocks are not available to US persons or restricted jurisdictions; access runs through supported Solana wallets and venues.", supportMode: "connected", accessMode: "venue", ctaLabel: "Official xStocks site", destinationUrl: "https://xstocks.fi/", eligibilityNote: "Not available in the United States, to US persons, or in other restricted jurisdictions. Vicus performs no eligibility verification.", sortOrder: 0 },
      { stage: "hold", title: "1:1 claim on Tesla", shortDescription: "Each token is backed 1:1 by the underlying Tesla share held with a regulated custodian.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 1 },
      { stage: "use", title: "Self-custody on Solana", shortDescription: "Hold in a self-custodial Solana wallet; the token trades on supported Solana venues like any Solana token.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 2 },
      { stage: "exit", title: "Sell or redeem", shortDescription: "Exit by selling through supported venues; issuance and redemption through the issuer follow market hours.", supportMode: "connected", accessMode: null, ctaLabel: "Official xStocks site", destinationUrl: "https://xstocks.fi/", eligibilityNote: null, sortOrder: 4 },
    ],
    capabilities: [
      { capabilityType: "access", title: "Access", shortDescription: "Eligible investors access the token through the official xStocks flow.", supportMode: "connected", ctaLabel: "Official xStocks site", destinationUrl: "https://xstocks.fi/", eligibilityNote: "Not available in the United States, to US persons, or in other restricted jurisdictions. Vicus never moves funds.", sortOrder: 1 },
      { capabilityType: "redeem", title: "Redeem", shortDescription: "Redemption runs through the issuer's official flow during market hours. Vicus never holds shares.", supportMode: "connected", ctaLabel: "Official xStocks site", destinationUrl: "https://xstocks.fi/", eligibilityNote: null, sortOrder: 2 },
    ],
  },
  {
    slug: "nvdac-on-base",
    code: "NVDAc",
    assetClass: "equity_fund",
    issuer: "Coinbase",
    network: "Base",
    ecosystem: "base",
    mintOrContract: "0xb20000000000000000000078ee7ce2fE4908108C",
    verificationMode: "base-contract",
    officialUrl: "https://www.base.org/stocks",
    verificationSourceUrl: "https://www.base.org/stocks",
    name: "NVDAc on Base",
    tagline: "Nvidia exposure as a Coinbase tokenized stock on Base.",
    representation:
      "A B20 token issued by Coinbase representing a beneficial claim on a real Nvidia share held in regulated, bankruptcy-remote custody.",
    eligibilityNote:
      "Available only to persons in eligible jurisdictions outside the US. Vicus performs no eligibility verification.",
    sourceStatus: "Base + issuer source",
    intendedUse:
      "Build context for what a Coinbase tokenized stock on Base represents before deciding whether any action is relevant to you.",
    assetId: "00000000-0000-0000-0000-000000000143",
    circleId: "00000000-0000-0000-0000-000000000243",
    featuredRank: 33,
    steps: [
      { stage: "access", title: "Confirm eligibility first", shortDescription: "Only persons in eligible jurisdictions outside the US may hold these tokens; access runs through supported wallets and venues.", supportMode: "connected", accessMode: "venue", ctaLabel: "Official program page", destinationUrl: "https://www.base.org/stocks", eligibilityNote: "Available only to persons in eligible jurisdictions outside the US. Vicus performs no eligibility verification.", sortOrder: 0 },
      { stage: "hold", title: "Beneficial claim on Nvidia", shortDescription: "Each token is a B20 beneficial claim on a real Nvidia share held in regulated, bankruptcy-remote custody.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 1 },
      { stage: "use", title: "Self-custody and DeFi", shortDescription: "Hold in a self-custodial wallet, trade around the clock, and use across supported Base DeFi venues.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 2 },
      { stage: "exit", title: "Sell through venues", shortDescription: "Exit by selling through supported venues; mint and redeem are restricted to authorized participants.", supportMode: "connected", accessMode: null, ctaLabel: "Official program page", destinationUrl: "https://www.base.org/stocks", eligibilityNote: null, sortOrder: 4 },
    ],
    capabilities: [
      { capabilityType: "access", title: "Access", shortDescription: "Eligible investors access the token through the official program flow.", supportMode: "connected", ctaLabel: "Official program page", destinationUrl: "https://www.base.org/stocks", eligibilityNote: "Available only to persons in eligible jurisdictions outside the US. Vicus never moves funds.", sortOrder: 1 },
      { capabilityType: "redeem", title: "Redeem", shortDescription: "Mint and redeem are restricted to authorized participants through official rails. Vicus never holds shares.", supportMode: "connected", ctaLabel: "Official program page", destinationUrl: "https://www.base.org/stocks", eligibilityNote: null, sortOrder: 2 },
    ],
  },
];

export async function seedExternalAssets() {
  let ensured = 0;
  for (const target of TARGETS) {
    const existing = await database
      .select({ id: circles.id })
      .from(circles)
      .where(eq(circles.slug, target.slug))
      .limit(1);
    let circleId: string;
    if (existing.length > 0) {
      circleId = existing[0]!.id;
    } else {
      await database
        .insert(assets)
        .values({
          id: target.assetId,
          code: target.code,
          issuer: target.issuer,
          chain: target.network,
          ecosystem: target.ecosystem,
          type: "tokenized asset",
          stellarNetwork: null,
          stellarAssetCode: null,
          stellarIssuerAccount: null,
          stellarContractId: target.mintOrContract,
          verificationMode: target.verificationMode,
          verificationSourceUrl: target.verificationSourceUrl,
          name: target.name,
          description: `${target.representation} ${target.ecosystem === "solana" ? "Mint" : "Contract"} ${target.mintOrContract} — always verify before interacting; look-alike tokens exist.`,
          intendedUse: target.intendedUse,
          officialUrl: target.officialUrl,
          riskNote: RISK_STOCK,
          eligibilityNote: target.eligibilityNote,
          sourceStatus: target.sourceStatus,
          lastVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: assets.id });
      const [circle] = await database
        .insert(circles)
        .values({
          id: target.circleId,
          assetId: target.assetId,
          slug: target.slug,
          name: target.name,
          tagline: target.tagline,
          status: "pending",
          category: target.assetClass,
          officialStatus: "pending",
          featuredRank: target.featuredRank,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: circles.id })
        .returning({ id: circles.id });
      circleId = circle?.id ?? target.circleId;
      ensured += 1;
    }

    for (const step of target.steps) {
      await database
        .insert(assetLifecycleSteps)
        .values({
          circleId,
          stage: step.stage,
          title: step.title,
          shortDescription: `${step.shortDescription} This is educational content, not financial advice.`,
          supportMode: step.supportMode,
          accessMode: step.accessMode,
          ctaLabel: step.ctaLabel,
          destinationUrl: step.destinationUrl,
          sourceUrl: target.verificationSourceUrl,
          eligibilityNote: step.eligibilityNote,
          sortOrder: step.sortOrder,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [assetLifecycleSteps.circleId, assetLifecycleSteps.stage],
          set: { title: step.title, updatedAt: now },
        });
    }

    for (const capability of target.capabilities) {
      await database
        .insert(assetCapabilities)
        .values({
          circleId,
          capabilityType: capability.capabilityType,
          title: capability.title,
          shortDescription: capability.shortDescription,
          supportMode: capability.supportMode,
          ctaLabel: capability.ctaLabel,
          destinationUrl: capability.destinationUrl,
          sourceUrl: target.verificationSourceUrl,
          eligibilityNote: capability.eligibilityNote,
          sortOrder: capability.sortOrder,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [assetCapabilities.circleId, assetCapabilities.capabilityType],
          set: {
            title: capability.title,
            shortDescription: capability.shortDescription,
            updatedAt: now,
          },
        });
    }
  }
  return { ensured, targets: TARGETS.map((t) => t.slug) };
}

async function main() {
  const result = await seedExternalAssets();
  console.log("external assets ensured", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
