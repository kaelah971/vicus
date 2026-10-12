import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetLifecycleSteps, assets, circles } from "../src/db/schema";

// Mirrors src/lib/asset-access/config.ts (kept literal: seeds cannot import
// server-only modules). Source of truth for values is that file.
const TARGET = {
  slug: "aaplc-on-base",
  code: "AAPLc",
  assetClass: "equity_fund",
  issuer: "Coinbase",
  network: "Base",
  ecosystem: "base",
  contractAddress: "0xb200000000000000000000C2e324d24d7eEcd1fb",
  officialUrl: "https://www.base.org/stocks",
  verificationSourceUrl: "https://www.base.org/stocks",
  representation:
    "A B20 token issued by Coinbase representing a beneficial claim on a real Apple share held in regulated, bankruptcy-remote custody.",
  eligibilityNote:
    "Available only to persons in eligible jurisdictions outside the US. Vicus performs no eligibility verification.",
};

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const now = new Date();

const ASSET_ID = "00000000-0000-0000-0000-000000000131";
const CIRCLE_ID = "00000000-0000-0000-0000-000000000231";

const RISK_NOTE =
  "This is educational content, not financial advice. Tokenized stocks carry issuer, liquidity, and regulatory risk.";
const ELIGIBILITY_NOTE =
  "Available only to persons in eligible jurisdictions outside the US. Vicus performs no eligibility verification.";

async function seedAaplc() {
  const existing = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, TARGET.slug))
    .limit(1);
  let circleId: string;
  if (existing.length > 0) {
    circleId = existing[0]!.id;
    console.log("AAPLc circle already present", { skipped: true });
  } else {
    await database
      .insert(assets)
      .values({
        id: ASSET_ID,
        code: TARGET.code,
        issuer: TARGET.issuer,
        chain: TARGET.network,
        ecosystem: TARGET.ecosystem,
        type: "tokenized asset",
        stellarNetwork: null,
        stellarAssetCode: null,
        stellarIssuerAccount: null,
        stellarContractId: TARGET.contractAddress,
        verificationMode: "base-contract",
        verificationSourceUrl: TARGET.verificationSourceUrl,
        name: `${TARGET.code} on Base`,
        description: `${TARGET.representation} Contract ${TARGET.contractAddress} — always verify the address before interacting; look-alike tokens exist.`,
        intendedUse: "Build context for what a Coinbase tokenized stock on Base represents before deciding whether any action is relevant to you.",
        officialUrl: TARGET.officialUrl,
        riskNote: RISK_NOTE,
        eligibilityNote: ELIGIBILITY_NOTE,
        sourceStatus: "Base + issuer source",
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: assets.id });
    const [circle] = await database
      .insert(circles)
      .values({
        id: CIRCLE_ID,
        assetId: ASSET_ID,
        slug: TARGET.slug,
        name: `${TARGET.code} on Base`,
        tagline: "Apple exposure as a Coinbase tokenized stock on Base.",
        status: "pending",
        category: TARGET.assetClass,
        officialStatus: "pending",
        featuredRank: 30,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: circles.id })
      .returning({ id: circles.id });
    circleId = circle?.id ?? CIRCLE_ID;
  }

  const steps = [
    { stage: "access", title: "Confirm eligibility first", shortDescription: "Only persons in eligible jurisdictions outside the US may hold these tokens; access runs through supported wallets and venues.", supportMode: "connected", ctaLabel: "Official program page", destinationUrl: TARGET.officialUrl, eligibilityNote: TARGET.eligibilityNote, sortOrder: 0 },
    { stage: "hold", title: "Beneficial claim on Apple", shortDescription: "Each token is a B20 beneficial claim on a real Apple share held in regulated, bankruptcy-remote custody.", supportMode: "guide", ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 1 },
    { stage: "use", title: "Self-custody and DeFi", shortDescription: "Hold in a self-custodial wallet, trade around the clock, and use across supported Base DeFi venues.", supportMode: "connected", ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 2 },
    { stage: "exit", title: "Sell through venues", shortDescription: "Exit by selling through supported venues; mint and redeem are restricted to authorized participants.", supportMode: "connected", ctaLabel: "Official program page", destinationUrl: TARGET.officialUrl, eligibilityNote: null, sortOrder: 4 },
  ];
  for (const step of steps) {
    await database
      .insert(assetLifecycleSteps)
      .values({
        circleId,
        stage: step.stage,
        title: step.title,
        shortDescription: `${step.shortDescription} This is educational content, not financial advice.`,
        supportMode: step.supportMode,
        accessMode: step.stage === "access" ? "venue" : null,
        ctaLabel: step.ctaLabel,
        destinationUrl: step.destinationUrl,
        sourceUrl: TARGET.officialUrl,
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
  console.log("AAPLc ensured", { circleId });
}

seedAaplc().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
