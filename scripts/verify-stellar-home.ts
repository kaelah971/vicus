import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
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
  const sheetSrc = readFileSync(join(ROOT, "src/components/asset-sheet.tsx"), "utf8");
  const tileSrc = readFileSync(join(ROOT, "src/components/asset-tile.tsx"), "utf8");
  assert.ok(browser.includes(">Stellar</h2>") && browser.includes("Beyond Stellar"), "hierarchy headings present");
  assert.ok(browser.indexOf("Stellar") < browser.indexOf("Beyond Stellar"), "Stellar before Beyond Stellar");
  assert.ok(browser.includes("CATEGORY_SHORTCUTS") && browser.includes("x-filters-more"), "shortcuts plus one Filters control");
  assert.ok(!browser.includes("x-collections") && !browser.includes("directory-count"), "clutter controls removed");
  assert.ok(!/w-\[|min-w-\[|whitespace-nowrap|<table/.test(browser), "no overflow-prone constructs");
  assert.ok(browser.includes("v-tiles") && browser.includes("AssetTile"), "visual asset grid exists");
  assert.ok(!browser.includes("actionLabels"), "Discover tiles carry no action pills");
  const discoverPage = readFileSync(join(ROOT, "src/app/discover/page.tsx"), "utf8");
  assert.ok(!discoverPage.includes("v-head-stats") && !discoverPage.includes("ecosystems</span>"), "no stats strip on Discover top");
  assert.ok(browser.includes('get("asset")') && browser.includes("AssetSheet"), "route-aware sheet (?asset=)");
  assert.ok(browser.includes("v-filter-tabs"), "compact filter tabs");
  assert.ok(!/Source review|Role check|Vicus never holds funds|source-review pills/i.test(browser + tileSrc), "no source-review clutter on tiles");
  assert.ok(!/apy|\$\d|tvl|guaranteed/i.test(tileSrc), "no fake metrics on tiles");
  assert.ok(sheetSrc.includes("What you can do") && sheetSrc.includes("About") && sheetSrc.includes("Issuer") && sheetSrc.includes("Representation"), "sheet hierarchy: actions, about, issuer, representation");
  assert.ok(sheetSrc.includes("Continue to official flow") && sheetSrc.includes("v-sheet-backdrop"), "action disclosure + backdrop close");

  // 7. Official brand imagery renders from local files with provenance.
  const visuals = readFileSync(join(ROOT, "src/lib/asset-visuals.ts"), "utf8");
  for (const file of ["apple.svg", "nvidia.png", "wisdomtree.png", "circle-usdc.svg", "paypal-pyusd.svg", "ondo-usdy.svg"]) {
    assert.ok(existsSync(join(ROOT, "public/assets/brands", file)), `brand file exists: ${file}`);
  }
  for (const slug of ["aaplx-on-solana", "aaplc-on-base", "nvdac-on-base", "wtgxx-on-stellar", "usdc-on-stellar", "pyusd-on-stellar", "usdy-on-stellar"]) {
    assert.ok(visuals.includes(`"${slug}"`) && visuals.includes("/assets/brands/"), `${slug}: mapped to a local brand file`);
  }
  assert.ok(visuals.includes("officialSource") && visuals.includes("sourcePage"), "provenance retained per file");
  assert.ok(visuals.includes("https://www.apple.com") && visuals.includes("https://www.nvidia.com") && visuals.includes("https://www.paypalobjects.com"), "official-domain sources only");
  // Only the Akamai-blocked issuers may fall back (Tesla, Franklin/BENJI).
  const fallbackSlugs = [...visuals.matchAll(/"([a-z0-9-]+)":\s*\{[^}]*?localSrc:\s*null/g)].map((m) => m[1]);
  assert.ok(fallbackSlugs.every((s) => s === "tslax-on-solana" || s === "benji-on-stellar"), `fallback-only: ${fallbackSlugs.join(",")}`);
  // Every mapped localSrc resolves to a real file (tiles never 404).
  for (const match of visuals.matchAll(/localSrc:\s*"([^"]+)"/g)) {
    const rel = match[1].replace(/^\//, "");
    assert.ok(existsSync(join(ROOT, "public", rel)), `mapped file renders: ${match[1]}`);
  }

  // 8. Mobile grid is two columns at 390/430 with no single-col collapse.
  const css = readFileSync(join(ROOT, "src/app/vicus-system.css"), "utf8");
  assert.ok(css.includes(".v-tiles") && css.includes("repeat(2, minmax(0, 1fr))"), "two-column tile grid");
  assert.ok(css.includes("@media (max-width: 340px)"), "single-column only at tiny viewports");
  assert.ok(css.includes("@media (min-width: 768px)"), "tablet/desktop widens columns");
  assert.ok(tileSrc.includes("v-tile-logo") && tileSrc.includes("v-tile-visual"), "imagery is the strongest tile element");
  assert.ok(!/summary|description|eligibilityNote|sourceStatus/i.test(tileSrc), "tile carries no long descriptions");

  // 9. Sheet defaults to ~two-thirds viewport with a 2-column action grid.
  assert.ok(/\.v-sheet\s*\{[^}]*max-height:\s*66d?vh/.test(css), "sheet default ~2/3 viewport");
  assert.ok(css.includes(".v-sheet-actions") && css.includes(".v-sheet-action.is-open"), "compact action grid with full-width disclosure");

  // 10. P1.1 premium cards: hierarchy, category variants, issuer truth.
  assert.ok(tileSrc.includes("v-tile-top") && tileSrc.includes("v-tile-var"), "ticker + variant chip row");
  assert.ok(tileSrc.includes("showName") && tileSrc.includes("displayName"), "name omitted when it duplicates the ticker");
  assert.ok(tileSrc.includes("tileVariantFor") && tileSrc.includes("equity") && tileSrc.includes("stable"), "stock/fund/stablecoin variants");
  assert.ok(tileSrc.includes("data-variant"), "variant accent hook present");
  assert.ok(browser.includes("category: circle.category"), "registry category flows to tiles");
  assert.ok(visuals.includes('"Backed"') && visuals.includes('"Coinbase"'), "issuer-first attribution");
  assert.ok(!visuals.includes("Apple ·") && !visuals.includes("Tesla ·") && !visuals.includes("NVIDIA ·"), "no underlying-company issuance claims");
  assert.ok(/\.v-tile-visual\s*\{[^}]*min-height:\s*64px/.test(css), "compact logo stage");
  assert.ok(/\.v-tile-logo\s*\{[^}]*max-height:\s*44px/.test(css), "restrained logo size");
  assert.ok(css.includes('[data-variant="equity"]') && css.includes('[data-variant="stable"]'), "per-variant accents");

  console.log("stellar-home:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
