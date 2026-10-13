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

  // 3. Discover and Use preserve Stellar-first ordering in source.
  const browser = read("src/components/explore-browser.tsx");
  assert.ok(browser.indexOf("Stellar · home") < browser.indexOf("Beyond Stellar"), "home renders before beyond");
  const useBrowser = read("src/components/use-browser.tsx");
  assert.ok(useBrowser.indexOf("On Stellar") < useBrowser.indexOf("Beyond Stellar"), "use leads with Stellar");

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

  console.log("wave3-ia:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
