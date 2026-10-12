import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetLifecycleSteps, assets, circles } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

// Mirrors src/lib/external-utility/config.ts (kept literal: seeds cannot
// import server-only modules). Source of truth for values is that file.
const TARGET = {
  slug: "aaplx-on-solana",
  code: "AAPLx",
  assetClass: "equity_fund",
  issuer: "Backed (xStocks)",
  network: "Solana",
  ecosystem: "solana",
  mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  officialUrl: "https://xstocks.fi/",
  verificationSourceUrl: "https://docs.xstocks.fi/docs",
  representation:
    "An xStock by Backed tracking Apple: 1:1 backed by the underlying share, permissionless onchain transfers, self-custody, fractional by design.",
  eligibilityNote:
    "Not available in the United States, to US persons, or in other restricted jurisdictions. Vicus performs no eligibility verification.",
};

const database = getDatabase();
const now = new Date();

const ASSET_ID = "00000000-0000-0000-0000-000000000141";
const CIRCLE_ID = "00000000-0000-0000-0000-000000000241";

const RISK_NOTE =
  "This is educational content, not financial advice. Tokenized stocks carry issuer, liquidity, and regulatory risk.";

async function seedAaplx() {
  const existing = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, TARGET.slug))
    .limit(1);
  let circleId: string;
  if (existing.length > 0) {
    circleId = existing[0]!.id;
    console.log("AAPLx circle already present", { skipped: true });
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
        stellarContractId: TARGET.mint,
        verificationMode: "solana-mint",
        verificationSourceUrl: TARGET.verificationSourceUrl,
        name: `${TARGET.code} on Solana`,
        description: `${TARGET.representation} Mint ${TARGET.mint} — always verify the mint before interacting; look-alike tokens exist.`,
        intendedUse: "Build context for what an xStock on Solana represents before deciding whether any action is relevant to you.",
        officialUrl: TARGET.officialUrl,
        riskNote: RISK_NOTE,
        eligibilityNote: TARGET.eligibilityNote,
        sourceStatus: "xStocks + Jupiter source",
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
        name: `${TARGET.code} on Solana`,
        tagline: "Apple exposure as an xStock on Solana, swappable via Jupiter.",
        status: "pending",
        category: TARGET.assetClass,
        officialStatus: "pending",
        featuredRank: 31,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: circles.id })
      .returning({ id: circles.id });
    circleId = circle?.id ?? CIRCLE_ID;
  }

  const steps = [
    { stage: "access", title: "Confirm eligibility first", shortDescription: "xStocks are not available to US persons or restricted jurisdictions; access runs through supported Solana wallets and venues.", supportMode: "connected", accessMode: "venue", ctaLabel: "Official xStocks site", destinationUrl: TARGET.officialUrl, eligibilityNote: TARGET.eligibilityNote, sortOrder: 0 },
    { stage: "hold", title: "1:1 claim on Apple", shortDescription: "Each token is backed 1:1 by the underlying Apple share held with a regulated custodian.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 1 },
    { stage: "use", title: "Swap and self-custody", shortDescription: "Hold in a self-custodial Solana wallet and swap against live Jupiter-routed liquidity.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 2 },
    { stage: "earn", title: "Corporate actions onchain", shortDescription: "Dividends and splits are reflected through an onchain rebasing mechanism; no action is required from holders.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, eligibilityNote: null, sortOrder: 3 },
    { stage: "exit", title: "Sell or redeem", shortDescription: "Exit by selling through supported venues; issuance and redemption through the issuer follow market hours.", supportMode: "connected", accessMode: null, ctaLabel: "Official xStocks site", destinationUrl: TARGET.officialUrl, eligibilityNote: null, sortOrder: 4 },
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
        accessMode: step.accessMode,
        ctaLabel: step.ctaLabel,
        destinationUrl: step.destinationUrl,
        sourceUrl: TARGET.verificationSourceUrl,
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
  console.log("AAPLx ensured", { circleId });
}

seedAaplx().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
