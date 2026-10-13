import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolveAssetActions } from "../src/lib/asset-actions/service";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

async function main() {
  // 1. Core IA destinations exist.
  for (const route of ["src/app/discover/page.tsx", "src/app/use/page.tsx", "src/app/circles/page.tsx", "src/app/activity/page.tsx", "src/app/profile/me/page.tsx"]) {
    assert.ok(existsSync(join(ROOT, route)), `${route} exists`);
  }

  // 2. Mobile primary nav is bounded to five destinations.
  const shell = read("src/components/app-shell.tsx");
  const bottomSection = shell.slice(shell.indexOf("BOTTOM_NAV"), shell.indexOf("SIDEBAR_EXTRA_NAV"));
  const bottomCount = (bottomSection.match(/href: "\//g) ?? []).length;
  assert.equal(bottomCount, 5, "five mobile destinations");
  for (const href of ["/discover", "/use", "/circles", "/activity", "/profile/me"]) {
    assert.ok(bottomSection.includes(`href: "${href}"`), `mobile nav links ${href}`);
  }
  assert.ok(!bottomSection.includes("/missions") && !bottomSection.includes("/lab"), "secondary routes stay out of mobile nav");

  // 3. Each tab owns a distinct primary: catalogue, action tool, social layer.
  const browser = read("src/components/explore-browser.tsx");
  assert.ok(browser.indexOf("Stellar · home") < browser.indexOf("Beyond Stellar"), "home renders before beyond");
  assert.ok(browser.includes("AssetTile") && browser.includes("v-tiles"), "Discover primary is the asset grid");
  const useBrowser = read("src/components/use-browser.tsx");
  assert.ok(useBrowser.includes("ActionIntentGrid"), "Use primary is the action-intent grid");
  assert.ok(!useBrowser.includes("AssetTile"), "Use does not reuse the Discover grid");
  const circlesPage = read("src/app/circles/page.tsx");
  assert.ok(circlesPage.includes("getCircleSocialSummary") && circlesPage.includes("s-circle-card"), "Circles primary is social/community cards");
  assert.ok(!circlesPage.includes("AssetTile") && !circlesPage.includes("v-tiles"), "Circles does not reuse the Discover grid");

  // 4. Personal links resolve; profile exposes tools without duplicating data.
  for (const route of ["src/app/positions/page.tsx", "src/app/watch/page.tsx", "src/app/activity/page.tsx"]) {
    assert.ok(existsSync(join(ROOT, route)), `${route} exists`);
  }
  const profile = read("src/app/profile/me/page.tsx");
  for (const href of ["/activity", "/positions", "/watch", "/contacts"]) {
    assert.ok(profile.includes(href), `profile links ${href}`);
  }

  // 5. Gated routes never receive executable styling or claims.
  const nvdac = await resolveAssetActions("nvdac-on-base", "Base");
  assert.ok(!nvdac.some((a) => a.state === "available" && (a.kind === "access" || a.kind === "swap")), "NVDAc gated");
  const runner = read("src/components/access-routes-runner.tsx");
  const gatedBlock = runner.slice(runner.indexOf("route-gated"));
  assert.ok(!gatedBlock.includes("btn primary"), "gated cards carry no primary CTA");
  assert.ok(runner.includes("Not executable"), "gated label explicit");

  // 6. Compare stays mobile-stacked; long identifiers render safely.
  const compare = read("src/app/compare/page.tsx");
  assert.ok(!/<table/.test(compare), "no wide tables in compare");
  const subjects = read("src/app/subjects/[slug]/page.tsx");
  assert.ok(subjects.includes("slice(-6)") || subjects.includes("…"), "identifiers abbreviated");

  // 7. No generic global social-feed route or model.
  assert.ok(!existsSync(join(ROOT, "src/app/feed")) && !existsSync(join(ROOT, "src/app/timeline")), "no feed routes");
  const activityService = read("src/lib/activity/service.ts");
  assert.ok(!/globalFeed|timeline|forYou/i.test(activityService), "no feed model in activity");

  // 8. Wave-3 route targets are valid files.
  for (const route of ["src/app/subjects/[slug]/page.tsx", "src/app/compare/page.tsx", "src/app/circles/[slug]/conviction/page.tsx", "src/app/circles/[slug]/conviction/[id]/page.tsx"]) {
    assert.ok(existsSync(join(ROOT, route)), `${route} exists`);
  }

  // 9. Navigation payloads carry no private position/contact data.
  assert.ok(!/\bwallet address\b|\bbalance\b|\bendpoint\b|\bsecret\b|\bseed phrase\b/i.test(shell), "nav shell carries no private data");

  // 10. Preview sheet is route-aware and privacy-clean (additive, no IA change).
  const tileSrc = read("src/components/asset-tile.tsx");
  const sheetSrc = read("src/components/asset-sheet.tsx");
  const visuals = read("src/lib/asset-visuals.ts");
  assert.ok(tileSrc.includes("data-asset") && !/Watching|Role check|Source review/i.test(tileSrc), "tiles carry identity, no status pills");
  assert.ok(sheetSrc.includes('role="dialog"') && sheetSrc.includes("Escape"), "sheet is a dismissible dialog");
  assert.ok(!/\bapy\b|\$\d|\btvl\b|guaranteed returns/i.test(tileSrc + sheetSrc), "no fake market metrics in preview layer");
  assert.ok(visuals.includes("localSrc") && visuals.includes("officialSource"), "imagery mapping prefers verified sources with fallback");
  // 11. Global typography: DM Sans product-wide, mono reserved for technical.
  const layout = read("src/app/layout.tsx");
  const globals = read("src/app/globals.css");
  assert.ok(layout.includes("DM_Sans") && layout.includes("--font-dm-sans"), "DM Sans via next/font");
  assert.ok(layout.includes("Geist_Mono"), "mono retained for technical values");
  assert.ok(globals.includes("--font-dm-sans") && /body\s*\{[\s\S]*?font-family:\s*var\(--font-dm-sans\)/.test(globals), "body defaults to sans");
  assert.ok(!/body\s*\{[^}]*font-family:[^;]*--font-mono/.test(globals), "body no longer mono");
  assert.ok(globals.includes(".mono") && globals.includes(".t-id"), "technical mono classes exist");
  assert.ok(globals.includes(".wordmark") && /\.wordmark[\s\S]*?letter-spacing:\s*0\.35em/.test(globals), "wordmark keeps deliberate tracking");

  // 12. Mobile menu: light Spoke-pattern sheet, segmented, grouped, no chains.
  const menu = read("src/components/mobile-menu.tsx");
  const shellSrc = read("src/components/app-shell.tsx");
  assert.ok(shellSrc.includes("MobileMenu"), "menu mounted in app shell");
  assert.ok(menu.includes('role="dialog"') && menu.includes('aria-modal="true"'), "dialog semantics");
  assert.ok(menu.includes('aria-expanded') && menu.includes('aria-controls="vicus-menu-sheet"'), "trigger exposes state");
  assert.ok(menu.includes('aria-label="Close menu"'), "close is labelled");
  assert.ok(menu.includes('"personal"') && menu.includes('"projects"') && menu.includes("m-menu-seg"), "Personal/Projects segmented control");
  for (const heading of ["Discover", "Personal", "Participate", "Tools", "Build", "For projects"]) {
    assert.ok(menu.includes(`heading: "${heading}"`), `menu group ${heading}`);
  }
  assert.ok(!menu.includes("/ecosystems/"), "no chain destinations in menu");
  for (const href of ["/discover", "/use", "/circles", "/activity", "/profile/me", "/positions", "/watch", "/missions", "/rewards", "/send", "/contacts", "/spaces", "/lab", "/host", "/admin"]) {
    assert.ok(menu.includes(`"${href}"`), `menu links ${href}`);
  }
  assert.ok(menu.includes('aria-current') && menu.includes("is-active"), "active route treatment");
  assert.ok(menu.includes("popstate") && menu.includes("pushState") && menu.includes('"Escape"'), "back/Escape/backdrop close");
  assert.ok(menu.includes("overflow") && menu.includes("hidden"), "background locks while open");
  assert.ok(!/\/lib\/(services\/|[a-z-]+\/service)/.test(menu) && !menu.includes("fetch("), "menu touches no business logic");
  const menuCss = read("src/app/vicus-system.css");
  assert.ok(menuCss.includes(".m-menu-sheet") && menuCss.includes("92dvh") && menuCss.includes(".m-menu-seg"), "sheet styles present");

  // 13. Exactly one mobile menu: the light sheet, no legacy drawer.
  const walletAuth = read("src/components/wallet-auth.tsx");
  assert.ok(!/wallet-mobile|mobileMenuOpen|mobileNavigation/.test(walletAuth), "legacy drawer code removed");
  assert.ok(!/wallet-mobile/.test(globals) && !/wallet-mobile/.test(menuCss), "legacy drawer styles removed");
  assert.ok((shellSrc.match(/>Menu</g) ?? []).length <= 1, "one mobile Menu trigger");
  assert.ok(menu.includes("m-menu-sheet") && !menu.includes("wallet-"), "only the light menu remains");

  // 14. Use rhythm + density: spaced sections, no mobile path counts.
  const usePage = read("src/app/use/page.tsx");
  assert.ok(usePage.includes("u-page-head") && useBrowser.includes("u-question"), "Use spacing structure present");
  assert.ok(menuCss.includes(".u-question") && menuCss.includes(".u-results"), "Use rhythm styles present");
  assert.ok(/\.u-intent small\s*\{[^}]*display:\s*none/.test(menuCss), "path counts hidden on mobile");

  // 15. Asset density: disclosures, one-column timeline, wrap guards, no blue oval.
  const assetPageSrc = read("src/app/circles/[slug]/page.tsx");
  assert.ok(assetPageSrc.includes("a-disclosure") && assetPageSrc.includes("passport-disclosure") === false, "About disclosures live on the page");
  const vicusSrc = read("src/components/vicus.tsx");
  assert.ok(vicusSrc.includes("passport-disclosure"), "passport prose behind disclosure");
  assert.ok(assetPageSrc.includes("a-timeline") && assetPageSrc.includes("a-timeline-details"), "stage-by-stage timeline with collapsed detail");
  assert.ok(!/\.a-timeline[^}]*repeat\(2/.test(menuCss), "timeline stays single-column");
  assert.ok(!assetPageSrc.includes('Orb icon="globe"'), "blue official-source oval absent");
  assert.ok(assetPageSrc.includes("c-sources") && assetPageSrc.includes("c-more"), "source content present but collapsed");
  assert.ok(menuCss.includes("overflow-wrap: anywhere"), "technical identifiers wrap safely");
  assert.ok(assetPageSrc.includes("StepFlow") && assetPageSrc.includes("stageLine"), "lifecycle truth intact");

  // 16. Asset page is tabbed: Overview / Actions / Circle / Details.
  const assetPage = read("src/app/circles/[slug]/page.tsx");
  assert.ok(assetPage.includes("AssetTabs"), "segmented asset sections");
  for (const tab of ['"overview"', '"actions"', '"circle"', '"details"']) {
    assert.ok(assetPage.includes(tab), `asset tab ${tab} exists`);
  }
  assert.ok(assetPage.includes("StepFlow") && assetPage.includes("a-facts"), "Overview keeps lifecycle visual + key facts");
  assert.ok(assetPage.includes("AssetPassport"), "Details keeps provenance");
  const css = read("src/app/vicus-system.css");
  assert.ok(/\.v-sheet\s*\{[^}]*max-height:\s*66d?vh/.test(css), "sheet default ~two-thirds viewport");
  assert.ok(css.includes(".v-sheet-actions") && css.includes(".v-sheet-backdrop"), "action grid + backdrop present");
  const navZ = (css.match(/\.bottom-nav\s*\{[\s\S]*?z-index:\s*(\d+)/) ?? [])[1];
  const sheetZ = (css.match(/\.v-sheet-root\s*\{[\s\S]*?z-index:\s*(\d+)/) ?? [])[1];
  assert.ok(Number(sheetZ) > Number(navZ), `sheet (${sheetZ}) covers nav (${navZ}) intentionally`);

  console.log("wave3-ia:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
