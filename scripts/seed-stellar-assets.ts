import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assets, circles } from "../src/db/schema";

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
  benjiAsset: "00000000-0000-0000-0000-000000000121",
  wtgxxAsset: "00000000-0000-0000-0000-000000000122",
  wtsyxAsset: "00000000-0000-0000-0000-000000000123",
  tipsxAsset: "00000000-0000-0000-0000-000000000124",
  spxuxAsset: "00000000-0000-0000-0000-000000000125",
  techxAsset: "00000000-0000-0000-0000-000000000126",
  benjiCircle: "00000000-0000-0000-0000-000000000221",
  wtgxxCircle: "00000000-0000-0000-0000-000000000222",
  wtsyxCircle: "00000000-0000-0000-0000-000000000223",
  tipsxCircle: "00000000-0000-0000-0000-000000000224",
  spxuxCircle: "00000000-0000-0000-0000-000000000225",
  techxCircle: "00000000-0000-0000-0000-000000000226",
};

/**
 * Curated Stellar-native tokenized-asset universe V1. Every claim below is
 * backed by an official issuer, SDF, or fund-document source (see officialUrl
 * per asset). Stellar issuer accounts are stored ONLY where verified against
 * an official fund document or corroborated registry record — never invented.
 * No prices, yields, TVL, market caps, or availability claims are stored.
 * Last reviewed against official sources on 2026-10-12.
 *
 * Omitted deliberately (could not verify Stellar availability):
 * - Spiko money-market products (EVM issuance only per current sources)
 * - Figure YLDS (Provenance chain, not Stellar)
 * - WisdomTree Gold Token (only a disclosures footnote; no product record)
 * - WisdomTree Siegel allocation funds (allocation wrapper; kept out to avoid
 *   forcing an inaccurate category)
 * - EURC / OUSG on Stellar (no verified Stellar record in hand)
 */
const newAssets = [
  {
    id: ids.benjiAsset,
    circleId: ids.benjiCircle,
    slug: "benji-on-stellar",
    code: "BENJI",
    category: "treasury_fund",
    issuer: "Franklin Templeton",
    name: "BENJI on Stellar",
    tagline: "One BENJI token represents one share of a U.S.-registered government money fund.",
    description:
      "BENJI is the token representation of the Franklin OnChain U.S. Government Money Fund (FOBXX), a U.S.-registered money market fund investing primarily in government securities, cash, and repurchase agreements collateralized by government securities or cash. The fund launched on Stellar in 2021 — the first U.S.-registered fund to use a public blockchain as its official system of record — with Stellar as its founding chain (BENJI-GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5; confirm on StellarExpert). Terms, access, and eligibility must always be confirmed with official sources.",
    intendedUse:
      "Build context for what a tokenized government money fund share on Stellar represents before deciding whether any action is relevant to you.",
    officialUrl:
      "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX",
    stellarAssetCode: "BENJI",
    stellarIssuerAccount: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    sourceStatus: "Issuer + SDF source",
  },
  {
    id: ids.wtgxxAsset,
    circleId: ids.wtgxxCircle,
    slug: "wtgxx-on-stellar",
    code: "WTGXX",
    category: "treasury_fund",
    issuer: "WisdomTree",
    name: "WTGXX on Stellar",
    tagline: "A tokenized Treasury money market fund share, recorded on Stellar.",
    description:
      "WTGXX is the WisdomTree Treasury Money Market Digital Fund, a U.S.-registered fund seeking current income with preservation of capital and a stable $1.00 NAV. Fund shares are recorded on Stellar as a secondary record alongside the transfer agent's official book-entry record (WTGXX-GDMBNMFJ3TRFLASJ6UGETFME3PJPNKPU24C7KFDBEBPQFG2CI6UC3JG6 per the official fund fact sheet; confirm on StellarExpert). Terms, access, and eligibility must always be confirmed with official sources.",
    intendedUse:
      "Build context for what a tokenized Treasury money market fund share on Stellar represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.wisdomtree.com/investments/digital-funds/money-market/wtgxx",
    stellarAssetCode: "WTGXX",
    stellarIssuerAccount: "GDMBNMFJ3TRFLASJ6UGETFME3PJPNKPU24C7KFDBEBPQFG2CI6UC3JG6",
    sourceStatus: "Issuer fund document",
  },
  {
    id: ids.wtsyxAsset,
    circleId: ids.wtsyxCircle,
    slug: "wtsyx-on-stellar",
    code: "WTSYX",
    category: "fixed_income",
    issuer: "WisdomTree",
    name: "WTSYX on Stellar",
    tagline: "A tokenized short-term Treasury fund share, recorded on Stellar.",
    description:
      "WTSYX is the WisdomTree Short-Term Treasury Digital Fund, a U.S.-registered fund offering short-term U.S. Treasury exposure with ownership recorded on the Stellar blockchain as a secondary record alongside the transfer agent's official book-entry record. Terms, access, and eligibility must always be confirmed with official sources.",
    intendedUse:
      "Build context for what a tokenized short-term Treasury fund share on Stellar represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
    stellarAssetCode: "WTSYX",
    stellarIssuerAccount: null,
    sourceStatus: "Issuer suite source",
  },
  {
    id: ids.tipsxAsset,
    circleId: ids.tipsxCircle,
    slug: "tipsx-on-stellar",
    code: "TIPSX",
    category: "fixed_income",
    issuer: "WisdomTree",
    name: "TIPSX on Stellar",
    tagline: "A tokenized TIPS fund share, recorded on Stellar.",
    description:
      "TIPSX is the WisdomTree TIPS Digital Fund, a U.S.-registered fund offering Treasury Inflation-Protected Securities exposure with ownership recorded on the Stellar blockchain as a secondary record alongside the transfer agent's official book-entry record. Terms, access, and eligibility must always be confirmed with official sources.",
    intendedUse:
      "Build context for what a tokenized TIPS fund share on Stellar represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
    stellarAssetCode: "TIPSX",
    stellarIssuerAccount: null,
    sourceStatus: "Issuer suite source",
  },
  {
    id: ids.spxuxAsset,
    circleId: ids.spxuxCircle,
    slug: "spxux-on-stellar",
    code: "SPXUX",
    category: "equity_fund",
    issuer: "WisdomTree",
    name: "SPXUX on Stellar",
    tagline: "A tokenized U.S. equity index fund share, recorded on Stellar.",
    description:
      "SPXUX is the WisdomTree 500 Digital Fund, a U.S.-registered fund seeking to track the WisdomTree 500 Index, with ownership recorded on the Stellar blockchain as a secondary record alongside the transfer agent's official book-entry record. Terms, access, and eligibility must always be confirmed with official sources.",
    intendedUse:
      "Build context for what a tokenized equity index fund share on Stellar represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.wisdomtree.com/investments/digital-funds/equity/spxux",
    stellarAssetCode: "SPXUX",
    stellarIssuerAccount: null,
    sourceStatus: "Issuer suite source",
  },
  {
    id: ids.techxAsset,
    circleId: ids.techxCircle,
    slug: "techx-on-stellar",
    code: "TECHX",
    category: "equity_fund",
    issuer: "WisdomTree",
    name: "TECHX on Stellar",
    tagline: "A tokenized technology equity fund share, recorded on Stellar.",
    description:
      "TECHX is the WisdomTree Technology and Innovation 100 Digital Fund, a U.S.-registered fund offering technology equity exposure with ownership recorded on the Stellar blockchain as a secondary record alongside the transfer agent's official book-entry record. Terms, access, and eligibility must always be confirmed with official sources.",
    intendedUse:
      "Build context for what a tokenized technology equity fund share on Stellar represents before deciding whether any action is relevant to you.",
    officialUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
    stellarAssetCode: "TECHX",
    stellarIssuerAccount: null,
    sourceStatus: "Issuer suite source",
  },
];

const RISK_NOTE =
  "This is educational content, not financial advice. Asset access, restrictions, and risks vary by issuer and region.";
const ELIGIBILITY_NOTE =
  "Access and eligibility can depend on wallets, venues, issuer rules, and region. Watching this Circle is not proof of ownership.";

async function seedStellarAssets() {
  const existingCircles = await database.select({ slug: circles.slug }).from(circles);
  const existingSlugs = new Set(existingCircles.map((row) => row.slug));

  let insertedAssets = 0;
  let insertedCircles = 0;
  let skipped = 0;

  for (const [index, entry] of newAssets.entries()) {
    if (existingSlugs.has(entry.slug)) {
      skipped += 1;
      continue;
    }

    await database
      .insert(assets)
      .values({
        id: entry.id,
        code: entry.code,
        issuer: entry.issuer,
        chain: "Stellar",
        ecosystem: "stellar",
        type: "tokenized asset",
        stellarNetwork: "mainnet",
        stellarAssetCode: entry.stellarAssetCode,
        stellarIssuerAccount: entry.stellarIssuerAccount,
        stellarContractId: null,
        verificationMode: entry.stellarIssuerAccount ? "classic-issuer" : "issuer-suite",
        verificationSourceUrl: entry.officialUrl,
        name: entry.name,
        description: entry.description,
        intendedUse: entry.intendedUse,
        officialUrl: entry.officialUrl,
        riskNote: RISK_NOTE,
        eligibilityNote: ELIGIBILITY_NOTE,
        sourceStatus: entry.sourceStatus,
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: assets.id });
    insertedAssets += 1;

    await database
      .insert(circles)
      .values({
        id: entry.circleId,
        assetId: entry.id,
        slug: entry.slug,
        name: entry.name,
        tagline: entry.tagline,
        status: "pending",
        category: entry.category,
        officialStatus: "pending",
        featuredRank: 20 + index,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: circles.id });
    insertedCircles += 1;
    existingSlugs.add(entry.slug);
  }

  // Idempotency proof: a second pass over the same slugs inserts nothing.
  const reseedCheck = await database
    .select({ slug: circles.slug })
    .from(circles)
    .where(eq(circles.slug, newAssets[0]!.slug))
    .limit(1);
  console.log("Stellar assets ensured", {
    insertedAssets,
    insertedCircles,
    skipped,
    reseedCheck: reseedCheck.length,
  });
}

seedStellarAssets().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
