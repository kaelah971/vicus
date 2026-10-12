import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetCapabilities, circles, missions } from "../src/db/schema";
import {
  assetClassLabel,
  isAssetCircle,
  listCircles,
  getCircleBySlug,
  matchesCircleFilters,
} from "../src/lib/data/circles";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const KNOWN_SLUGS = new Set([
  "usdc-on-stellar",
  "usdc-on-base",
  "usdc-on-ethereum",
  "usdc-on-solana",
  "pyusd-on-stellar",
  "usdy-on-stellar",
  "tokenized-treasury-education",
  "benji-on-stellar",
  "wtgxx-on-stellar",
  "wtsyx-on-stellar",
  "tipsx-on-stellar",
  "spxux-on-stellar",
  "techx-on-stellar",
  "aaplc-on-base",
  "aaplx-on-solana",
  "tslax-on-solana",
  "nvdac-on-base",
]);

async function verify() {
  const all = await listCircles(null);
  assert.equal(all.length, 17, "The directory holds the seven legacy rows plus the six Stellar-universe rows plus the verified Base targets and the verified Solana swap targets.");
  for (const circle of all) {
    assert(KNOWN_SLUGS.has(circle.slug), `Unexpected circle ${circle.slug}.`);
  }

  const bySlug = new Map(all.map((circle) => [circle.slug, circle]));
  for (const slug of ["usdc-on-stellar", "usdc-on-base", "usdc-on-ethereum", "usdc-on-solana", "pyusd-on-stellar"]) {
    assert.equal(bySlug.get(slug)?.category, "stablecoin", `${slug} must classify as stablecoin.`);
    assert.equal(bySlug.get(slug)?.assetClassLabel, "Tokenized money / Stablecoin");
  }
  for (const slug of ["usdy-on-stellar", "benji-on-stellar", "wtgxx-on-stellar"]) {
    assert.equal(bySlug.get(slug)?.category, "treasury_fund", `${slug} must classify as treasury_fund.`);
    assert.equal(bySlug.get(slug)?.assetClassLabel, "Tokenized Treasury / Fund");
  }
  for (const slug of ["wtsyx-on-stellar", "tipsx-on-stellar"]) {
    assert.equal(bySlug.get(slug)?.category, "fixed_income", `${slug} must classify as fixed_income.`);
    assert.equal(bySlug.get(slug)?.assetClassLabel, "Tokenized Fixed Income");
  }
  for (const slug of ["spxux-on-stellar", "techx-on-stellar", "aaplc-on-base", "aaplx-on-solana", "tslax-on-solana", "nvdac-on-base"]) {
    assert.equal(bySlug.get(slug)?.category, "equity_fund", `${slug} must classify as equity_fund.`);
    assert.equal(bySlug.get(slug)?.assetClassLabel, "Tokenized Equity / Equity Fund");
  }

  // Educational non-asset hidden from Discover, still directly resolvable.
  const education = bySlug.get("tokenized-treasury-education");
  assert(education, "Education content must keep existing.");
  assert(!isAssetCircle(education!), "Education-only content must leave Discover.");
  const discoverEntries = all.filter(isAssetCircle);
  assert.equal(discoverEntries.length, 16);
  assert(discoverEntries.every((circle) => circle.slug !== "tokenized-treasury-education"));
  const direct = await getCircleBySlug("tokenized-treasury-education");
  assert(direct, "Education circle must stay directly reachable.");

  // Asset-class filter works.
  const stablecoins = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "stablecoin", ecosystem: "all", query: "", state: "All statuses" }),
  );
  assert.equal(stablecoins.length, 5);
  const treasuries = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "treasury_fund", ecosystem: "all", query: "", state: "All statuses" }),
  );
  assert.deepEqual(
    treasuries.map((circle) => circle.slug).sort(),
    ["benji-on-stellar", "usdy-on-stellar", "wtgxx-on-stellar"],
  );
  const fixedIncome = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "fixed_income", ecosystem: "all", query: "", state: "All statuses" }),
  );
  assert.deepEqual(
    fixedIncome.map((circle) => circle.slug).sort(),
    ["tipsx-on-stellar", "wtsyx-on-stellar"],
  );
  const equities = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "equity_fund", ecosystem: "all", query: "", state: "All statuses" }),
  );
  assert.deepEqual(
    equities.map((circle) => circle.slug).sort(),
    ["aaplc-on-base", "aaplx-on-solana", "nvdac-on-base", "spxux-on-stellar", "techx-on-stellar", "tslax-on-solana"],
  );

  // Ecosystem filter works.
  const stellar = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "all", ecosystem: "stellar", query: "", state: "All statuses" }),
  );
  assert.deepEqual(
    stellar.map((circle) => circle.slug).sort(),
    [
      "benji-on-stellar",
      "pyusd-on-stellar",
      "spxux-on-stellar",
      "techx-on-stellar",
      "tipsx-on-stellar",
      "usdc-on-stellar",
      "usdy-on-stellar",
      "wtgxx-on-stellar",
      "wtsyx-on-stellar",
    ],
  );

  // Combined filters compose.
  const stableBase = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "stablecoin", ecosystem: "base", query: "", state: "All statuses" }),
  );
  assert.deepEqual(stableBase.map((circle) => circle.slug), ["usdc-on-base"]);
  const equityBase = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "equity_fund", ecosystem: "base", query: "", state: "All statuses" }),
  );
  assert.deepEqual(equityBase.map((circle) => circle.slug), ["aaplc-on-base", "nvdac-on-base"]);
  const equitySolana = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "equity_fund", ecosystem: "solana", query: "", state: "All statuses" }),
  );
  assert.deepEqual(equitySolana.map((circle) => circle.slug), ["aaplx-on-solana", "tslax-on-solana"]);
  const treasuryStellar = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "treasury_fund", ecosystem: "stellar", query: "", state: "All statuses" }),
  );
  assert.deepEqual(
    treasuryStellar.map((circle) => circle.slug).sort(),
    ["benji-on-stellar", "usdy-on-stellar", "wtgxx-on-stellar"],
  );
  const empty = discoverEntries.filter((circle) =>
    matchesCircleFilters(circle, { assetClass: "treasury_fund", ecosystem: "base", query: "", state: "All statuses" }),
  );
  assert.equal(empty.length, 0);

  // URL state: both dimensions derive from search params (back/forward safe).
  const browserSource = await import("node:fs").then((fs) =>
    fs.readFileSync("src/components/explore-browser.tsx", "utf8"),
  );
  assert(browserSource.includes('searchParams.get("class")'), "Asset-class dimension must be URL-driven.");
  assert(browserSource.includes('searchParams.get("ecosystem")'), "Ecosystem dimension must stay URL-driven.");
  assert(browserSource.includes("router.push"), "Filter changes must write back through navigation.");

  // Circle exposes class + ecosystem correctly.
  const detail = await getCircleBySlug("usdc-on-stellar");
  assert.equal(detail?.assetClassLabel, "Tokenized money / Stablecoin");
  assert.equal(detail?.ecosystemLabel, "Stellar");
  assert.equal(detail?.category, "stablecoin");

  // Activation mission still resolves on its Circle/capability.
  const [activation] = await database
    .select({ id: missions.id, status: missions.status, capability: assetCapabilities.capabilityType })
    .from(missions)
    .innerJoin(circles, eq(missions.circleId, circles.id))
    .leftJoin(assetCapabilities, eq(missions.assetCapabilityId, assetCapabilities.id))
    .where(and(eq(missions.type, "onchain_action"), eq(circles.slug, "usdc-on-stellar")))
    .limit(1);
  assert(activation, "Activation mission must still resolve.");
  assert.equal(activation.status, "open");
  assert.equal(activation.capability, "send");
  assert.equal(assetClassLabel("stablecoin"), "Tokenized money / Stablecoin");

  console.log("Classification verification passed", {
    usdcStablecoin: true,
    pyusdStablecoin: true,
    usdyTreasury: true,
    educationHidden: true,
    classFilter: true,
    ecosystemFilter: true,
    combinedFilters: true,
    urlDriven: true,
    circleIdentity: true,
    noFakeAsset: true,
    activationIntact: true,
  });
}

verify().catch((error) => {
  console.error("Classification verification failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
