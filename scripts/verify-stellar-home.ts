import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import {
  buildDiscoveryGroups,
  isAssetCircle,
  listCircles,
  matchesCircleFilters,
} from "../src/lib/data/circles";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import { listActiveCampaignCircles } from "../src/lib/campaigns/service";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(__dirname, "..");
const FAKE_METRIC = /apy|%|\$\d|yield\s+\d|x\s+returns?|tvl|\bguaranteed\b/i;

async function main() {
  // 1. Pure grouping: Stellar home first, beyond separate, no duplicates,
  // no chain selection required to discover.
  const groups = buildDiscoveryGroups({
    slugs: ["usdc-on-stellar", "benji-on-stellar", "aaplx-on-solana", "aaplx-on-solana", "nvdac-on-base"],
    categoryOf: (slug) =>
      slug === "usdc-on-stellar" ? "stablecoin" : slug === "benji-on-stellar" ? "treasury_fund" : "equity_fund",
    ecosystemOf: (slug) => (slug.endsWith("stellar") ? "stellar" : slug.includes("solana") ? "solana" : "base"),
    usableSlugs: ["usdc-on-stellar", "aaplx-on-solana"],
    campaignSlugs: [],
  });
  assert.deepEqual(groups.stellar, ["usdc-on-stellar", "benji-on-stellar"], "home layer in input order, deduped");
  assert.deepEqual(groups.beyond, ["aaplx-on-solana", "nvdac-on-base"], "extension layer separate");
  assert.ok(!groups.collections.some((c) => c.key === "campaigns"), "empty collections omitted");
  const canUse = groups.collections.find((c) => c.key === "can-use")!;
  assert.deepEqual(canUse.slugs.sort(), ["aaplx-on-solana", "usdc-on-stellar"], "can-use from engine set");
  assert.ok(groups.collections.some((c) => c.key === "funds"), "taxonomy collections derived");

  // 2. Live registry: every supported Stellar asset appears once, at home.
  const all = await listCircles(null);
  const assets = all.filter(isAssetCircle);
  const live = buildDiscoveryGroups({
    slugs: assets.map((c) => c.slug),
    categoryOf: (slug) => assets.find((c) => c.slug === slug)?.category ?? "",
    ecosystemOf: (slug) => assets.find((c) => c.slug === slug)?.ecosystem ?? "",
    usableSlugs: [],
    campaignSlugs: [],
  });
  const stellarSlugs = live.stellar;
  for (const slug of ["benji-on-stellar", "wtgxx-on-stellar", "usdy-on-stellar", "usdc-on-stellar", "pyusd-on-stellar"]) {
    assert.ok(stellarSlugs.includes(slug), `${slug} at home`);
  }
  assert.equal(new Set(live.stellar).size, live.stellar.length, "no home duplicates");
  assert.ok(live.stellar.length >= 9, "Stellar is the deepest collection");
  for (const slug of ["aaplx-on-solana", "tslax-on-solana", "aaplc-on-base", "nvdac-on-base"]) {
    assert.ok(live.beyond.includes(slug), `${slug} extends below, never as home`);
  }

  // 3. "Can use now" reuses engine truth — available-state actions only.
  const usable: string[] = [];
  for (const circle of assets) {
    const actions = await resolveAssetActions(circle.slug, circle.network);
    if (actions.some((a) => a.state === "available")) usable.push(circle.slug);
  }
  assert.ok(usable.includes("usdc-on-stellar"), "USDC usable now");
  assert.ok(usable.includes("aaplx-on-solana"), "AAPLx usable now");
  assert.ok(usable.includes("tslax-on-solana"), "TSLAx usable now");
  const campaigns = await listActiveCampaignCircles();
  assert.ok(Array.isArray(campaigns), "campaign set resolves (possibly empty)");

  // 4. Gated assets never render executable.
  const nvdac = await resolveAssetActions("nvdac-on-base", "Base");
  assert.ok(!nvdac.some((a) => a.state === "available" && (a.kind === "access" || a.kind === "swap")), "NVDAc nothing executable");
  const aaplc = await resolveAssetActions("aaplc-on-base", "Base");
  assert.ok(!aaplc.some((a) => a.kind === "access" && a.state === "available"), "AAPLc acquisition stays gated");

  // 5. Card copy carries no fake metrics; search finds both worlds.
  for (const circle of assets) {
    assert.ok(!FAKE_METRIC.test(`${circle.name} ${circle.summary} ${circle.issuerSource}`), `${circle.slug}: honest card copy`);
  }
  const foundStellar = assets.filter((c) => matchesCircleFilters(c, { assetClass: "all", ecosystem: "all", query: "benji", state: "All statuses" }));
  assert.ok(foundStellar.some((c) => c.slug === "benji-on-stellar"), "search finds Stellar");
  const foundExternal = assets.filter((c) => matchesCircleFilters(c, { assetClass: "all", ecosystem: "all", query: "tslax", state: "All statuses" }));
  assert.ok(foundExternal.some((c) => c.slug === "tslax-on-solana"), "search finds external");

  // 6. Source structure: home/beyond headings, category shortcuts, one Filters control.
  const browser = readFileSync(join(ROOT, "src/components/explore-browser.tsx"), "utf8");
  assert.ok(browser.includes(">Stellar</h2>") && browser.includes("Beyond Stellar"), "hierarchy headings present");
  assert.ok(browser.includes("CATEGORY_SHORTCUTS") && browser.includes("x-filters-more"), "shortcuts plus one Filters control");
  assert.ok(!browser.includes("x-collections") && !browser.includes("directory-count"), "clutter controls removed");
  assert.ok(!/w-\[|min-w-\[|whitespace-nowrap|<table/.test(browser), "no overflow-prone constructs");

  console.log("stellar-home:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
