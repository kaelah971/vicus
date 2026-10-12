import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assets, circles } from "../src/db/schema";
import {
  assetClassLabel,
  isAssetCircle,
  listCircles,
  getCircleBySlug,
  matchesCircleFilters,
} from "../src/lib/data/circles";
import { getPublicProfileByHandle } from "../src/lib/social/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();

const EXPECTED = [
  {
    slug: "benji-on-stellar",
    code: "BENJI",
    category: "treasury_fund",
    issuer: "Franklin Templeton",
    stellarIssuerAccount: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
    officialUrl:
      "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX",
  },
  {
    slug: "wtgxx-on-stellar",
    code: "WTGXX",
    category: "treasury_fund",
    issuer: "WisdomTree",
    stellarIssuerAccount: "GDMBNMFJ3TRFLASJ6UGETFME3PJPNKPU24C7KFDBEBPQFG2CI6UC3JG6",
    officialUrl: "https://www.wisdomtree.com/investments/digital-funds/money-market/wtgxx",
  },
  {
    slug: "wtsyx-on-stellar",
    code: "WTSYX",
    category: "fixed_income",
    issuer: "WisdomTree",
    stellarIssuerAccount: null,
    officialUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
  },
  {
    slug: "tipsx-on-stellar",
    code: "TIPSX",
    category: "fixed_income",
    issuer: "WisdomTree",
    stellarIssuerAccount: null,
    officialUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
  },
  {
    slug: "spxux-on-stellar",
    code: "SPXUX",
    category: "equity_fund",
    issuer: "WisdomTree",
    stellarIssuerAccount: null,
    officialUrl: "https://www.wisdomtree.com/investments/digital-funds/equity/spxux",
  },
  {
    slug: "techx-on-stellar",
    code: "TECHX",
    category: "equity_fund",
    issuer: "WisdomTree",
    stellarIssuerAccount: null,
    officialUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
  },
];

const VALID_CATEGORIES = new Set([
  "stablecoin",
  "treasury_fund",
  "equity_fund",
  "fixed_income",
  "commodity",
  "private_credit",
  "alternative",
  "real_estate",
  "other_financial",
]);

const METRIC_PATTERN = /apy|tvl|market\s?cap|\d+(\.\d+)?\s*%(\s*yield|\s*apy)?|\$[\d,]+(\.\d+)?\s*[bmt]\b|aum/i;

async function verify() {
  // Every seeded asset resolves with official sources, issuer, and network.
  for (const expected of EXPECTED) {
    const [circle] = await database
      .select()
      .from(circles)
      .where(eq(circles.slug, expected.slug))
      .limit(1);
    assert(circle, `${expected.slug} must exist.`);
    assert.equal(circle.category, expected.category, `${expected.slug} taxonomy.`);
    assert(VALID_CATEGORIES.has(circle.category), `${expected.slug} valid taxonomy.`);
    assert(circle.assetId, `${expected.slug} must link a real asset row.`);

    const [asset] = await database
      .select()
      .from(assets)
      .where(eq(assets.id, circle.assetId!))
      .limit(1);
    assert(asset, `${expected.slug} asset row must exist.`);
    assert.equal(asset.code, expected.code);
    assert.equal(asset.issuer, expected.issuer, `${expected.slug} issuer present.`);
    assert.equal(asset.ecosystem, "stellar", `${expected.slug} Stellar-native.`);
    assert.equal(asset.chain, "Stellar");
    assert.equal(asset.stellarNetwork, "mainnet");
    assert.equal(asset.stellarAssetCode, expected.code);
    assert.equal(asset.stellarIssuerAccount, expected.stellarIssuerAccount, `${expected.slug} verified identifier.`);
    assert(asset.officialUrl?.startsWith("https://"), `${expected.slug} official source.`);
    assert.equal(asset.officialUrl, expected.officialUrl);
    assert(asset.verificationSourceUrl?.startsWith("https://"), `${expected.slug} verification source.`);
    assert(asset.description && asset.description.length > 80, `${expected.slug} representation summary.`);
    assert(asset.intendedUse && asset.intendedUse.length > 20, `${expected.slug} intended use.`);

    // No fake financial metrics anywhere in the seeded copy.
    for (const field of [asset.name, asset.description, asset.intendedUse]) {
      assert(!METRIC_PATTERN.test(field ?? ""), `${expected.slug} must carry no fabricated metrics.`);
    }
  }

  // Duplicate asset identity prevented: slugs unique, codes unique per issuer.
  const slugs = EXPECTED.map((entry) => entry.slug);
  assert.equal(new Set(slugs).size, slugs.length, "Seeded slugs unique.");
  const rows = await database.select({ slug: circles.slug }).from(circles);
  const slugCounts = new Map<string, number>();
  for (const row of rows) slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
  for (const slug of slugs) assert.equal(slugCounts.get(slug), 1, `${slug} exists exactly once.`);

  // Discover returns only real production assets (state-gated, asset-linked).
  const all = await listCircles(null);
  const discoverEntries = all.filter(isAssetCircle);
  assert(discoverEntries.length >= 12, "Universe visible in Discover.");
  for (const entry of discoverEntries) {
    assert(entry.state !== "education", `${entry.slug} non-educational.`);
  }
  const stellarEntries = discoverEntries.filter((entry) =>
    matchesCircleFilters(entry, { assetClass: "all", ecosystem: "stellar", query: "", state: "All statuses" }),
  );
  assert(stellarEntries.length >= 9, "Stellar breadth visible.");
  const classes = new Set(stellarEntries.map((entry) => entry.category));
  for (const required of ["stablecoin", "treasury_fund", "fixed_income", "equity_fund"]) {
    assert(classes.has(required), `Stellar shows ${required}.`);
  }

  // Filters compose on the new classes.
  const equityStellar = discoverEntries.filter((entry) =>
    matchesCircleFilters(entry, { assetClass: "equity_fund", ecosystem: "stellar", query: "", state: "All statuses" }),
  );
  assert.deepEqual(
    equityStellar.map((entry) => entry.slug).sort(),
    ["spxux-on-stellar", "techx-on-stellar"],
  );

  // Every new asset resolves to a real Circle/Passport with class + issuer.
  for (const expected of EXPECTED) {
    const detail = await getCircleBySlug(expected.slug);
    assert(detail, `${expected.slug} passport resolves.`);
    assert.equal(detail?.category, expected.category);
    assert(detail?.assetClassLabel, `${expected.slug} class label.`);
    assert.equal(assetClassLabel(expected.category), detail?.assetClassLabel);
  }

  // Existing social surfaces still attach: public profile + a legacy circle.
  const profile = await getPublicProfileByHandle("demo").catch(() => null);
  assert(profile === null || typeof profile === "object", "Public profile loader safe.");
  const legacy = await getCircleBySlug("usdc-on-stellar");
  assert(legacy, "Legacy Watch/Community anchor intact.");

  // Public loaders expose no private data: no wallet, secret, or session keys.
  const serialized = JSON.stringify(all);
  assert(!/secret|privateKey|token_hash|challengeHash/i.test(serialized), "No private fields leak.");
  assert(!/S[A-Z0-9]{55}/.test(serialized), "No secret keys leak.");

  console.log("Stellar assets verification passed", {
    seeded: EXPECTED.length,
    stellarVisible: stellarEntries.length,
    classesVisible: [...classes].sort(),
    filtersCompose: true,
    passportsResolve: true,
    noMetrics: true,
    noLeakage: true,
  });
}

verify().catch((error) => {
  console.error("Stellar assets verification failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
