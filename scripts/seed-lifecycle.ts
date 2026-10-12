import { config } from "dotenv";
import { getDatabase } from "../src/db";
import { assetLifecycleSteps, circles } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const now = new Date();

type SeedStep = {
  slug: string;
  stage: string;
  title: string;
  shortDescription: string;
  supportMode: string;
  accessMode: string | null;
  ctaLabel: string | null;
  destinationUrl: string | null;
  sourceUrl: string;
  eligibilityNote: string | null;
  sortOrder: number;
};

const FT_FUND =
  "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX";
const WT_SUITE = "https://www.wisdomtree.com/onchain/tokenized-funds";
const WT_WTGXX = "https://www.wisdomtree.com/investments/digital-funds/money-market/wtgxx";
const WT_SPXUX = "https://www.wisdomtree.com/investments/digital-funds/equity/spxux";
const ONDO_USDY = "https://ondo.finance/usdy";
const CIRCLE_USDC = "https://www.circle.com/usdc";
const PAYPAL_PYUSD = "https://www.paypal.com/pyusd";

const RESTRICTED_NOTE =
  "Access is eligibility-gated by the issuer. Availability varies by region, channel, and verification status.";
const NOT_ADVICE = "This is educational content, not financial advice.";

/**
 * Source-backed lifecycle rows for the Stellar universe. Copy is drawn only
 * from official issuer, SDF, transfer-agent, or fund-document material:
 * - BENJI mechanics: Franklin Templeton + SDF releases (P2P transfers, daily
 *   onchain dividends, Benji app purchase/sale/transfer).
 * - WisdomTree mechanics: official fund pages, Prime/Connect releases (Prime
 *   purchase/sale/transfer, daily NAV, permissioned wallets).
 * - USDY mechanics: ondo.finance/usdy (daily subscriptions/redemptions,
 *   accumulating price, free transferability, non-US eligibility).
 * - USDC mechanics: Circle (issuer redemption, venue access). Earn is
 *   intentionally absent: the issuer pays holders no yield.
 * - PYUSD mechanics: PayPal/Paxos ecosystem rails. Earn intentionally absent.
 * No APY, yields, prices, or returns appear anywhere below.
 */
const STEPS: SeedStep[] = [
  // ---- BENJI (Franklin OnChain U.S. Government Money Fund) ----
  { slug: "benji-on-stellar", stage: "access", title: "Onboard through Benji", shortDescription: "Eligible investors access fund shares through the official Benji Investments app.", supportMode: "connected", accessMode: "official", ctaLabel: "Official fund page", destinationUrl: FT_FUND, sourceUrl: FT_FUND, eligibilityNote: RESTRICTED_NOTE, sortOrder: 0 },
  { slug: "benji-on-stellar", stage: "hold", title: "One token, one share", shortDescription: "Each BENJI token represents one share of the fund, recorded on Stellar.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: FT_FUND, eligibilityNote: null, sortOrder: 1 },
  { slug: "benji-on-stellar", stage: "use", title: "Peer-to-peer transfers", shortDescription: "Eligible holders can transfer shares directly to other authorized wallets.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: FT_FUND, eligibilityNote: "Transfers require issuer-authorized wallets.", sortOrder: 2 },
  { slug: "benji-on-stellar", stage: "earn", title: "Daily onchain distributions", shortDescription: "The fund distributes income onchain every day, including weekends and holidays.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: FT_FUND, eligibilityNote: null, sortOrder: 3 },
  { slug: "benji-on-stellar", stage: "exit", title: "Sell or redeem via Benji", shortDescription: "Leave through sale or redemption inside the official Benji flow.", supportMode: "connected", accessMode: null, ctaLabel: "Official fund page", destinationUrl: FT_FUND, sourceUrl: FT_FUND, eligibilityNote: null, sortOrder: 4 },
  // ---- WTGXX ----
  { slug: "wtgxx-on-stellar", stage: "access", title: "Purchase via Prime", shortDescription: "Eligible investors purchase shares through the official WisdomTree Prime app.", supportMode: "connected", accessMode: "official", ctaLabel: "Official fund page", destinationUrl: WT_WTGXX, sourceUrl: WT_WTGXX, eligibilityNote: RESTRICTED_NOTE, sortOrder: 0 },
  { slug: "wtgxx-on-stellar", stage: "hold", title: "Money-market fund share", shortDescription: "Each token maps to a share of the Treasury money market fund, tracked on Stellar.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_WTGXX, eligibilityNote: null, sortOrder: 1 },
  { slug: "wtgxx-on-stellar", stage: "use", title: "Transfer between wallets", shortDescription: "Move shares between eligible permissioned wallets on Stellar.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_WTGXX, eligibilityNote: "Wallets must be registered and permissioned.", sortOrder: 2 },
  { slug: "wtgxx-on-stellar", stage: "earn", title: "Fund income distributions", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_WTGXX, eligibilityNote: null, sortOrder: 3 },
  { slug: "wtgxx-on-stellar", stage: "exit", title: "Sell or redeem via Prime", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", accessMode: null, ctaLabel: "Official fund page", destinationUrl: WT_WTGXX, sourceUrl: WT_WTGXX, eligibilityNote: null, sortOrder: 4 },
  // ---- WTSYX ----
  { slug: "wtsyx-on-stellar", stage: "access", title: "Purchase via Prime", shortDescription: "Eligible investors purchase shares through the official WisdomTree Prime app.", supportMode: "connected", accessMode: "official", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: RESTRICTED_NOTE, sortOrder: 0 },
  { slug: "wtsyx-on-stellar", stage: "hold", title: "Short-term Treasury share", shortDescription: "Each token maps to a share of the short-term Treasury fund, tracked on Stellar.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 1 },
  { slug: "wtsyx-on-stellar", stage: "use", title: "Transfer between wallets", shortDescription: "Move shares between eligible permissioned wallets on Stellar.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: "Wallets must be registered and permissioned.", sortOrder: 2 },
  { slug: "wtsyx-on-stellar", stage: "earn", title: "Fund income distributions", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 3 },
  { slug: "wtsyx-on-stellar", stage: "exit", title: "Sell or redeem via Prime", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", accessMode: null, ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 4 },
  // ---- TIPSX ----
  { slug: "tipsx-on-stellar", stage: "access", title: "Purchase via Prime", shortDescription: "Eligible investors purchase shares through the official WisdomTree Prime app.", supportMode: "connected", accessMode: "official", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: RESTRICTED_NOTE, sortOrder: 0 },
  { slug: "tipsx-on-stellar", stage: "hold", title: "TIPS fund share", shortDescription: "Each token maps to a share of the inflation-protected Treasury fund, tracked on Stellar.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 1 },
  { slug: "tipsx-on-stellar", stage: "use", title: "Transfer between wallets", shortDescription: "Move shares between eligible permissioned wallets on Stellar.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: "Wallets must be registered and permissioned.", sortOrder: 2 },
  { slug: "tipsx-on-stellar", stage: "earn", title: "Fund income distributions", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 3 },
  { slug: "tipsx-on-stellar", stage: "exit", title: "Sell or redeem via Prime", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", accessMode: null, ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 4 },
  // ---- SPXUX ----
  { slug: "spxux-on-stellar", stage: "access", title: "Purchase via Prime", shortDescription: "Eligible investors purchase shares through the official WisdomTree Prime app.", supportMode: "connected", accessMode: "official", ctaLabel: "Official fund page", destinationUrl: WT_SPXUX, sourceUrl: WT_SPXUX, eligibilityNote: RESTRICTED_NOTE, sortOrder: 0 },
  { slug: "spxux-on-stellar", stage: "hold", title: "Equity index fund share", shortDescription: "Each token maps to a share tracking the WisdomTree 500 Index, recorded on Stellar.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SPXUX, eligibilityNote: null, sortOrder: 1 },
  { slug: "spxux-on-stellar", stage: "use", title: "Transfer between wallets", shortDescription: "Move shares between eligible permissioned wallets on Stellar.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SPXUX, eligibilityNote: "Wallets must be registered and permissioned.", sortOrder: 2 },
  { slug: "spxux-on-stellar", stage: "earn", title: "Fund income distributions", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SPXUX, eligibilityNote: null, sortOrder: 3 },
  { slug: "spxux-on-stellar", stage: "exit", title: "Sell or redeem via Prime", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", accessMode: null, ctaLabel: "Official fund page", destinationUrl: WT_SPXUX, sourceUrl: WT_SPXUX, eligibilityNote: null, sortOrder: 4 },
  // ---- TECHX ----
  { slug: "techx-on-stellar", stage: "access", title: "Purchase via Prime", shortDescription: "Eligible investors purchase shares through the official WisdomTree Prime app.", supportMode: "connected", accessMode: "official", ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: RESTRICTED_NOTE, sortOrder: 0 },
  { slug: "techx-on-stellar", stage: "hold", title: "Technology equity share", shortDescription: "Each token maps to a share of the technology equity fund, tracked on Stellar.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 1 },
  { slug: "techx-on-stellar", stage: "use", title: "Transfer between wallets", shortDescription: "Move shares between eligible permissioned wallets on Stellar.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: "Wallets must be registered and permissioned.", sortOrder: 2 },
  { slug: "techx-on-stellar", stage: "earn", title: "Fund income distributions", shortDescription: "The fund distributes income to shareholders per the prospectus.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 3 },
  { slug: "techx-on-stellar", stage: "exit", title: "Sell or redeem via Prime", shortDescription: "Sell or redeem shares through WisdomTree Prime at daily NAV on business days.", supportMode: "connected", accessMode: null, ctaLabel: "Official fund suite", destinationUrl: WT_SUITE, sourceUrl: WT_SUITE, eligibilityNote: null, sortOrder: 4 },
  // ---- USDY ----
  { slug: "usdy-on-stellar", stage: "access", title: "Subscribe via Ondo", shortDescription: "Eligible non-US investors subscribe through Ondo's official flow.", supportMode: "connected", accessMode: "official", ctaLabel: "Official product page", destinationUrl: ONDO_USDY, sourceUrl: ONDO_USDY, eligibilityNote: "Available to non-US individuals and institutions; eligibility rules apply.", sortOrder: 0 },
  { slug: "usdy-on-stellar", stage: "hold", title: "Accumulating yield token", shortDescription: "A token backed by short-term Treasuries and bank deposits; income shows up as an increasing token price.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: ONDO_USDY, eligibilityNote: null, sortOrder: 1 },
  { slug: "usdy-on-stellar", stage: "use", title: "Transfer, pay, collateral", shortDescription: "Freely transferable for payments, cash management, and collateral use.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: ONDO_USDY, eligibilityNote: null, sortOrder: 2 },
  { slug: "usdy-on-stellar", stage: "earn", title: "Daily accrual in price", shortDescription: "Yield accrues daily and is reflected in the token's increasing price.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: ONDO_USDY, eligibilityNote: null, sortOrder: 3 },
  { slug: "usdy-on-stellar", stage: "exit", title: "Redeem via Ondo", shortDescription: "Daily subscriptions and redemptions run through Ondo's official flow.", supportMode: "connected", accessMode: null, ctaLabel: "Official product page", destinationUrl: ONDO_USDY, sourceUrl: ONDO_USDY, eligibilityNote: null, sortOrder: 4 },
  // ---- USDC (stablecoin lifecycle differs: no earn) ----
  { slug: "usdc-on-stellar", stage: "access", title: "Get USDC", shortDescription: "Obtain USDC through exchanges, wallets, or Circle's official mint flow.", supportMode: "connected", accessMode: "venue", ctaLabel: "About USDC", destinationUrl: CIRCLE_USDC, sourceUrl: CIRCLE_USDC, eligibilityNote: null, sortOrder: 0 },
  { slug: "usdc-on-stellar", stage: "hold", title: "Dollar-denominated balance", shortDescription: "Each token represents a dollar-denominated balance backed by reserves held for USDC.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: CIRCLE_USDC, eligibilityNote: null, sortOrder: 1 },
  { slug: "usdc-on-stellar", stage: "use", title: "Send, pay, move networks", shortDescription: "Pay, transfer, and move native USDC across networks with Vicus Access.", supportMode: "in_vicus", accessMode: null, ctaLabel: "Move across networks", destinationUrl: "/access", sourceUrl: CIRCLE_USDC, eligibilityNote: null, sortOrder: 2 },
  { slug: "usdc-on-stellar", stage: "exit", title: "Redeem or sell", shortDescription: "Redeem through Circle's official flow or sell through supported venues.", supportMode: "connected", accessMode: null, ctaLabel: "About USDC", destinationUrl: CIRCLE_USDC, sourceUrl: CIRCLE_USDC, eligibilityNote: null, sortOrder: 4 },
  // ---- PYUSD (stablecoin lifecycle differs: no earn) ----
  { slug: "pyusd-on-stellar", stage: "access", title: "Get PYUSD", shortDescription: "Obtain PYUSD through the PayPal ecosystem, exchanges, or supported venues.", supportMode: "connected", accessMode: "venue", ctaLabel: "About PYUSD", destinationUrl: PAYPAL_PYUSD, sourceUrl: PAYPAL_PYUSD, eligibilityNote: null, sortOrder: 0 },
  { slug: "pyusd-on-stellar", stage: "hold", title: "Dollar-denominated balance", shortDescription: "Each token represents a dollar-denominated balance issued by Paxos.", supportMode: "guide", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: PAYPAL_PYUSD, eligibilityNote: null, sortOrder: 1 },
  { slug: "pyusd-on-stellar", stage: "use", title: "Transfer and pay", shortDescription: "Transfer between wallets and pay where PYUSD is accepted.", supportMode: "connected", accessMode: null, ctaLabel: null, destinationUrl: null, sourceUrl: PAYPAL_PYUSD, eligibilityNote: null, sortOrder: 2 },
  { slug: "pyusd-on-stellar", stage: "exit", title: "Sell or redeem", shortDescription: "Sell through supported venues or redeem through official issuer rails.", supportMode: "connected", accessMode: null, ctaLabel: "About PYUSD", destinationUrl: PAYPAL_PYUSD, sourceUrl: PAYPAL_PYUSD, eligibilityNote: null, sortOrder: 4 },
];

async function seedLifecycle() {
  const circleRows = await database.select({ id: circles.id, slug: circles.slug }).from(circles);
  const circleIds = new Map(circleRows.map((row) => [row.slug, row.id]));

  let upserted = 0;
  let skippedMissing = 0;
  for (const step of STEPS) {
    const circleId = circleIds.get(step.slug);
    if (!circleId) {
      skippedMissing += 1;
      continue;
    }
    await database
      .insert(assetLifecycleSteps)
      .values({
        circleId,
        stage: step.stage,
        title: step.title,
        shortDescription: `${step.shortDescription} ${NOT_ADVICE}`,
        supportMode: step.supportMode,
        accessMode: step.accessMode,
        ctaLabel: step.ctaLabel,
        destinationUrl: step.destinationUrl,
        sourceUrl: step.sourceUrl,
        eligibilityNote: step.eligibilityNote,
        sortOrder: step.sortOrder,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [assetLifecycleSteps.circleId, assetLifecycleSteps.stage],
        set: {
          title: step.title,
          shortDescription: `${step.shortDescription} ${NOT_ADVICE}`,
          supportMode: step.supportMode,
          accessMode: step.accessMode,
          ctaLabel: step.ctaLabel,
          destinationUrl: step.destinationUrl,
          sourceUrl: step.sourceUrl,
          eligibilityNote: step.eligibilityNote,
          sortOrder: step.sortOrder,
          active: true,
          updatedAt: now,
        },
      });
    upserted += 1;
  }
  console.log("Lifecycle steps ensured", { upserted, skippedMissing, total: STEPS.length });
}

seedLifecycle().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
