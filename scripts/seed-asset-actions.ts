import { config } from "dotenv";
import { getDatabase } from "../src/db";
import { assetCapabilities, circles } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

// Every entry mirrors a source-backed lifecycle/use claim already verified in
// scripts/seed-lifecycle.ts (same official URLs). No prices, yields, APYs,
// market caps, or speculative claims. Anything unverified is absent —
// notably borrow/collateralize (no exact live product supports these tokens
// as collateral) and transfers for permission-uncertain funds.
const FT_FUND =
  "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX";
const BENJI_APP = "https://digitalassets.franklintempleton.com/benji/";
const WT_SUITE = "https://www.wisdomtree.com/onchain/tokenized-funds";
const WT_WTGXX = "https://www.wisdomtree.com/investments/digital-funds/money-market/wtgxx";
const WT_SPXUX = "https://www.wisdomtree.com/investments/digital-funds/equity/spxux";
const ONDO_USDY = "https://ondo.finance/usdy";
const PAYPAL_PYUSD = "https://www.paypal.com/pyusd";
const CIRCLE_MINT = "https://www.circle.com/en/circle-mint";
const BLEND_DOCS = "https://docs.blend.capital";

const PRIME_NOTE =
  "Available to eligible WisdomTree Prime account holders. Vicus never moves funds or holds shares.";

type SeedAction = {
  slug: string;
  capabilityType: string;
  title: string;
  shortDescription: string;
  supportMode: "in_vicus" | "connected" | "guide";
  ctaLabel: string;
  destinationUrl: string | null;
  sourceUrl: string;
  eligibilityNote: string | null;
  sortOrder: number;
};

const ACTIONS: SeedAction[] = [
  // BENJI — P2P transfers + daily onchain distributions verified by Franklin/SDF.
  { slug: "benji-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible investors access fund shares through the official Benji flow.", supportMode: "connected", ctaLabel: "Official fund page", destinationUrl: FT_FUND, sourceUrl: FT_FUND, eligibilityNote: "KYC required; the issuer authorizes each holder wallet. Vicus never moves funds.", sortOrder: 1 },
  { slug: "benji-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "The fund distributes income onchain every day, including weekends and holidays.", supportMode: "guide", ctaLabel: "How distributions work", destinationUrl: null, sourceUrl: BENJI_APP, eligibilityNote: null, sortOrder: 2 },
  { slug: "benji-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Redeem shares through the official Benji flow. Vicus never holds shares.", supportMode: "connected", ctaLabel: "Official fund page", destinationUrl: FT_FUND, sourceUrl: FT_FUND, eligibilityNote: null, sortOrder: 3 },
  // WTGXX / WTSYX / TIPSX — Prime funds: access, distributions, redemption.
  { slug: "wtgxx-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible investors purchase shares through WisdomTree Prime.", supportMode: "connected", ctaLabel: "Official fund page", destinationUrl: WT_WTGXX, sourceUrl: WT_WTGXX, eligibilityNote: PRIME_NOTE, sortOrder: 1 },
  { slug: "wtgxx-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", ctaLabel: "Official fund page", destinationUrl: null, sourceUrl: WT_WTGXX, eligibilityNote: null, sortOrder: 2 },
  { slug: "wtgxx-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", ctaLabel: "Official fund page", destinationUrl: WT_WTGXX, sourceUrl: WT_WTGXX, eligibilityNote: null, sortOrder: 3 },
  { slug: "wtsyx-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible investors purchase shares through WisdomTree Prime.", supportMode: "connected", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: PRIME_NOTE, sortOrder: 1 },
  { slug: "wtsyx-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", ctaLabel: "Official fund suite", destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 2 },
  { slug: "wtsyx-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 3 },
  { slug: "tipsx-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible investors purchase shares through WisdomTree Prime.", supportMode: "connected", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: PRIME_NOTE, sortOrder: 1 },
  { slug: "tipsx-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", ctaLabel: "Official fund suite", destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 2 },
  { slug: "tipsx-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 3 },
  // SPXUX / TECHX — equity funds: same official rails.
  { slug: "spxux-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible investors purchase shares through WisdomTree Prime.", supportMode: "connected", ctaLabel: "Official fund page", destinationUrl: WT_SPXUX, sourceUrl: WT_SPXUX, eligibilityNote: PRIME_NOTE, sortOrder: 1 },
  { slug: "spxux-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", ctaLabel: "Official fund page", destinationUrl: null, sourceUrl: WT_SPXUX, eligibilityNote: null, sortOrder: 2 },
  { slug: "spxux-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", ctaLabel: "Official fund page", destinationUrl: WT_SPXUX, sourceUrl: WT_SPXUX, eligibilityNote: null, sortOrder: 3 },
  { slug: "techx-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible investors purchase shares through WisdomTree Prime.", supportMode: "connected", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: PRIME_NOTE, sortOrder: 1 },
  { slug: "techx-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", ctaLabel: "Official fund suite", destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 2 },
  { slug: "techx-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 3 },
  // USDY — subscribe, daily accrual in price, redeem. No P2P send: transfer
  // eligibility is permission-gated and unverified for generic holders.
  { slug: "usdy-on-stellar", capabilityType: "access", title: "Access", shortDescription: "Eligible non-US investors subscribe through Ondo's official flow.", supportMode: "connected", ctaLabel: "Official product page", destinationUrl: ONDO_USDY, sourceUrl: ONDO_USDY, eligibilityNote: "Available to non-US individuals and institutions; eligibility rules apply.", sortOrder: 1 },
  { slug: "usdy-on-stellar", capabilityType: "earn", title: "Earn", shortDescription: "Yield accrues daily and is reflected in the token's increasing price.", supportMode: "guide", ctaLabel: "Official product page", destinationUrl: null, sourceUrl: ONDO_USDY, eligibilityNote: null, sortOrder: 2 },
  { slug: "usdy-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Daily subscriptions and redemptions run through Ondo's official flow.", supportMode: "connected", ctaLabel: "Official product page", destinationUrl: ONDO_USDY, sourceUrl: ONDO_USDY, eligibilityNote: null, sortOrder: 3 },
  // PYUSD — transfer and redeem through official rails.
  { slug: "pyusd-on-stellar", capabilityType: "transfer", title: "Transfer", shortDescription: "Move PYUSD between Stellar wallets you control, where supported.", supportMode: "connected", ctaLabel: "About PYUSD", destinationUrl: PAYPAL_PYUSD, sourceUrl: PAYPAL_PYUSD, eligibilityNote: null, sortOrder: 1 },
  { slug: "pyusd-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Redeem through official issuer rails. Vicus never holds funds.", supportMode: "connected", ctaLabel: "About PYUSD", destinationUrl: PAYPAL_PYUSD, sourceUrl: PAYPAL_PYUSD, eligibilityNote: null, sortOrder: 2 },
  // USDC on Stellar — Blend supply (Soroban lending pools verified live) and
  // Circle Mint redemption join the existing send/receive/build rows.
  { slug: "usdc-on-stellar", capabilityType: "supply", title: "Supply", shortDescription: "Supply USDC to live Stellar lending pools and earn variable interest paid by borrowers.", supportMode: "connected", ctaLabel: "Blend lending pools", destinationUrl: "https://blend.capital/", sourceUrl: BLEND_DOCS, eligibilityNote: "Lending rates vary with utilization; Soroban transactions need XLM for fees. Vicus does not execute deposits.", sortOrder: 4 },
  { slug: "usdc-on-stellar", capabilityType: "redeem", title: "Redeem", shortDescription: "Eligible businesses convert USDC through Circle's official redemption flow.", supportMode: "connected", ctaLabel: "Redemption information", destinationUrl: null, sourceUrl: CIRCLE_MINT, eligibilityNote: "Redemption runs through Circle Mint and is intended for businesses, not individuals.", sortOrder: 5 },
];

const database = getDatabase();
const now = new Date();

export async function seedAssetActions() {
  const circleRows = await database.select({ id: circles.id, slug: circles.slug }).from(circles);
  const circleIds = new Map(circleRows.map((row) => [row.slug, row.id]));
  let upserted = 0;
  let skipped = 0;
  for (const action of ACTIONS) {
    const circleId = circleIds.get(action.slug);
    if (!circleId) {
      skipped += 1;
      continue;
    }
    await database
      .insert(assetCapabilities)
      .values({
        circleId,
        capabilityType: action.capabilityType,
        title: action.title,
        shortDescription: action.shortDescription,
        supportMode: action.supportMode,
        ctaLabel: action.ctaLabel,
        destinationUrl: action.destinationUrl,
        sourceUrl: action.sourceUrl,
        eligibilityNote: action.eligibilityNote,
        sortOrder: action.sortOrder,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [assetCapabilities.circleId, assetCapabilities.capabilityType],
        set: {
          title: action.title,
          shortDescription: action.shortDescription,
          supportMode: action.supportMode,
          ctaLabel: action.ctaLabel,
          destinationUrl: action.destinationUrl,
          sourceUrl: action.sourceUrl,
          eligibilityNote: action.eligibilityNote,
          sortOrder: action.sortOrder,
          active: true,
          updatedAt: now,
        },
      });
    upserted += 1;
  }
  return { upserted, skipped };
}

async function main() {
  const result = await seedAssetActions();
  console.log("asset actions ensured", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
