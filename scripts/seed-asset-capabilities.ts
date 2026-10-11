import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetCapabilities, circles } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

type SeedCapability = {
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

// Every entry below was verified against its source URL (HTTP 200) before
// seeding. Copy is neutral and factual; no price, yield, market-cap, or
// speculative claims anywhere in this file.
const CAPABILITIES: SeedCapability[] = [
  // USDC on Stellar — a classic Stellar asset: payments, trustlines, issuance docs.
  {
    slug: "usdc-on-stellar",
    capabilityType: "send",
    title: "Send",
    shortDescription: "Move USDC to another Stellar account as a standard Stellar payment.",
    supportMode: "connected",
    ctaLabel: "Open wallet",
    destinationUrl: "https://www.freighter.app/",
    sourceUrl: "https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations",
    eligibilityNote: "Sending happens in your own Stellar wallet, outside Vicus. Vicus never moves funds.",
    sortOrder: 1,
  },
  {
    slug: "usdc-on-stellar",
    capabilityType: "receive",
    title: "Receive",
    shortDescription: "Accept USDC on Stellar once your account trusts the USDC issuing account.",
    supportMode: "guide",
    ctaLabel: "Learn how",
    destinationUrl: null,
    sourceUrl: "https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations",
    eligibilityNote: "Receiving USDC requires a trustline to the issuer. Balances stay in your wallet.",
    sortOrder: 2,
  },
  {
    slug: "usdc-on-stellar",
    capabilityType: "build",
    title: "Build",
    shortDescription: "Use USDC in Stellar applications with official developer documentation.",
    supportMode: "connected",
    ctaLabel: "Developer resources",
    destinationUrl: "https://developers.circle.com/",
    sourceUrl: "https://developers.circle.com/",
    eligibilityNote: null,
    sortOrder: 3,
  },
  // USDC on Base — L2 transfers, Base developer docs, institutional redemption.
  {
    slug: "usdc-on-base",
    capabilityType: "transfer",
    title: "Transfer",
    shortDescription: "Move USDC on Base or bridge it between supported networks using official guidance.",
    supportMode: "guide",
    ctaLabel: "Learn how",
    destinationUrl: null,
    sourceUrl: "https://docs.base.org/",
    eligibilityNote: "Bridging involves separate networks, waiting periods, and network fees.",
    sortOrder: 1,
  },
  {
    slug: "usdc-on-base",
    capabilityType: "build",
    title: "Build",
    shortDescription: "Use USDC in Base applications with the official Base developer documentation.",
    supportMode: "connected",
    ctaLabel: "Developer resources",
    destinationUrl: "https://docs.base.org/",
    sourceUrl: "https://docs.base.org/",
    eligibilityNote: null,
    sortOrder: 2,
  },
  {
    slug: "usdc-on-base",
    capabilityType: "redeem",
    title: "Redeem",
    shortDescription: "Eligible businesses can convert USDC through Circle's official redemption flow.",
    supportMode: "guide",
    ctaLabel: "Redemption information",
    destinationUrl: null,
    sourceUrl: "https://www.circle.com/en/circle-mint",
    eligibilityNote: "Redemption runs through Circle Mint and is intended for businesses, not individuals.",
    sortOrder: 3,
  },
  // USDC on Ethereum — ERC-20 transfers, Circle developer platform, redemption.
  {
    slug: "usdc-on-ethereum",
    capabilityType: "transfer",
    title: "Transfer",
    shortDescription: "Move USDC as an ERC-20 token between Ethereum accounts you control.",
    supportMode: "guide",
    ctaLabel: "Learn how",
    destinationUrl: null,
    sourceUrl: "https://ethereum.org/en/stablecoins/",
    eligibilityNote: "Ethereum transfers pay gas in ETH, which varies with network demand.",
    sortOrder: 1,
  },
  {
    slug: "usdc-on-ethereum",
    capabilityType: "build",
    title: "Build",
    shortDescription: "Integrate USDC on Ethereum with Circle's official developer platform.",
    supportMode: "connected",
    ctaLabel: "Developer resources",
    destinationUrl: "https://developers.circle.com/",
    sourceUrl: "https://developers.circle.com/",
    eligibilityNote: null,
    sortOrder: 2,
  },
  {
    slug: "usdc-on-ethereum",
    capabilityType: "redeem",
    title: "Redeem",
    shortDescription: "Eligible businesses can convert USDC through Circle's official redemption flow.",
    supportMode: "guide",
    ctaLabel: "Redemption information",
    destinationUrl: null,
    sourceUrl: "https://www.circle.com/en/circle-mint",
    eligibilityNote: "Redemption runs through Circle Mint and is intended for businesses, not individuals.",
    sortOrder: 3,
  },
  // USDC on Solana — Solana Pay, multichain context, Solana developer docs.
  {
    slug: "usdc-on-solana",
    capabilityType: "pay",
    title: "Pay",
    shortDescription: "Accept or make USDC payments with the official Solana Pay framework.",
    supportMode: "connected",
    ctaLabel: "Payment documentation",
    destinationUrl: "https://docs.solanapay.com/",
    sourceUrl: "https://docs.solanapay.com/",
    eligibilityNote: "Payments settle on Solana in the merchant's or app's own flow, not inside Vicus.",
    sortOrder: 1,
  },
  {
    slug: "usdc-on-solana",
    capabilityType: "transfer",
    title: "Transfer",
    shortDescription: "Understand how USDC moves on Solana and across the networks Circle supports.",
    supportMode: "guide",
    ctaLabel: "Learn how",
    destinationUrl: null,
    sourceUrl: "https://www.circle.com/en/usdc-multichain",
    eligibilityNote: "Each network representation is separate; moving between networks uses a bridge.",
    sortOrder: 2,
  },
  {
    slug: "usdc-on-solana",
    capabilityType: "build",
    title: "Build",
    shortDescription: "Use USDC in Solana applications with the official Solana developer documentation.",
    supportMode: "connected",
    ctaLabel: "Developer resources",
    destinationUrl: "https://solana.com/developers",
    sourceUrl: "https://solana.com/developers",
    eligibilityNote: null,
    sortOrder: 3,
  },
];

async function seed() {
  const database = getDatabase();
  const slugs = [...new Set(CAPABILITIES.map((entry) => entry.slug))];
  const circleRows = await database
    .select({ id: circles.id, slug: circles.slug })
    .from(circles)
    .where(inArray(circles.slug, slugs));
  const circleIdBySlug = new Map(circleRows.map((row) => [row.slug, row.id]));

  let upserted = 0;
  for (const entry of CAPABILITIES) {
    const circleId = circleIdBySlug.get(entry.slug);
    if (!circleId) {
      console.log(`Skipped ${entry.capabilityType} (circle ${entry.slug} missing).`);
      continue;
    }
    const { slug: _omitted, ...values } = entry;
    void _omitted;
    await database
      .insert(assetCapabilities)
      .values({ ...values, circleId, active: true })
      .onConflictDoUpdate({
        target: [assetCapabilities.circleId, assetCapabilities.capabilityType],
        set: { ...values, active: true, updatedAt: new Date() },
      });
    upserted += 1;
  }

  const [circleCount] = await database
    .select({ slug: circles.slug })
    .from(circles)
    .where(eq(circles.slug, slugs[0]!))
    .limit(1);
  console.log(`Asset capabilities seeded: ${upserted} upserted. Anchor circle present: ${Boolean(circleCount)}.`);
}

seed().catch((error) => {
  console.error("Capability seeding failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
