import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { users } from "../src/db/schema";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import { getUtilityDiscovery, modeLabel } from "../src/lib/utility-discovery/service";
import { groupByAsset } from "../src/lib/utility-discovery/grouping";
import { LENDING_MARKET_URL } from "../src/lib/lending/config";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const ROOT = join(__dirname, "..");
const FAKE = /apy\s*\d|projected returns?|\btvl\b|best opportunity|risk score|\bROI\b|portfolio yield/i;

async function main() {
  const discovery = await getUtilityDiscovery(null, null);

  // 1. Stellar leads with the home utility set.
  assert.ok(discovery.counts.stellar >= 9, "Stellar utility depth");
  assert.ok(discovery.stellar.every((item) => item.ecosystem === "stellar"), "home bucket pure");
  assert.ok(discovery.beyond.every((item) => item.ecosystem !== "stellar"), "extension bucket separate");
  assert.ok(discovery.beyond.length > 0, "external utility present but secondary");

  // 2. Every opportunity derives from engine truth — same kinds, same states.
  for (const item of [...discovery.stellar.slice(0, 12), ...discovery.beyond.slice(0, 8)]) {
    if (item.kind === "campaign-reward") continue;
    const engine = await resolveAssetActions(item.assetSlug, item.network);
    const match = engine.find((action) => action.kind === item.kind);
    assert.ok(match, `${item.id}: engine parity`);
    assert.equal(match!.state, item.state, `${item.id}: state parity`);
    assert.equal(match!.href, item.href, `${item.id}: href parity`);
  }

  // 3. Named executable routes render correctly.
  const find = (slug: string, kind: string) =>
    [...discovery.stellar, ...discovery.beyond].filter((item) => item.assetSlug === slug && item.kind === kind);
  assert.ok(find("aaplx-on-solana", "access").some((item) => item.state === "available"), "AAPLx access live");
  assert.ok(find("aaplx-on-solana", "exit").length > 0, "AAPLx exit represented");
  assert.ok(find("tslax-on-solana", "access").some((item) => item.state === "available"), "TSLAx access live");
  const nvdacAccess = find("nvdac-on-base", "access");
  assert.ok(nvdacAccess.length === 0 || nvdacAccess.every((item) => item.state !== "available"), "NVDAc never executable");
  const borrow = find("aaplc-on-base", "borrow");
  assert.ok(borrow.length > 0 && borrow[0]!.executionMode === "connected", "AAPLc borrow from the real adapter");
  for (const slug of ["benji-on-stellar", "aaplx-on-solana", "tslax-on-solana", "nvdac-on-base"]) {
    assert.ok(![...discovery.stellar, ...discovery.beyond].some((item) => item.assetSlug === slug && item.kind === "borrow" && slug !== "aaplc-on-base"), `${slug}: no unsupported borrow`);
  }

  // 4. Campaign opportunities require live state.
  for (const item of [...discovery.stellar, ...discovery.beyond].filter((i) => i.kind === "campaign-reward")) {
    assert.ok(item.campaign && (item.campaign.status === "active" || item.campaign.status === "funded"), "only live campaigns");
    assert.ok((item.campaign!.rewardPerCompletion ?? "").length > 0, "real reward amount, never invented");
  }

  // 5. Signed-out discovery carries no holding flags; no wallets anywhere.
  assert.ok([...discovery.stellar, ...discovery.beyond].every((item) => item.held === false), "signed-out holds nothing");
  const blob = JSON.stringify(discovery);
  assert.ok(!FAKE.test(blob), "no fabricated APY/TVL/ROI");
  // The pinned Morpho market route is an exact protocol link, not a leak.
  assert.ok(!/G[A-Z2-7]{55}|0x[0-9a-fA-F]{40}/.test(blob.split(LENDING_MARKET_URL).join("")), "no wallet/contract leakage");

  // 6. Execution modes preserved; unknown stays gated.
  assert.ok(modeLabel("vicus", "available") === "LIVE IN VICUS", "live label");
  assert.ok(modeLabel("connected", "available") === "CONNECTED", "connected label");
  assert.ok(modeLabel("official", "permissioned") === "OFFICIAL", "official label");
  const gated = find("nvdac-on-base", "access");
  assert.ok(gated.length === 0 || gated.every((item) => /GATED|PERMISSIONED|route planner/i.test(item.stateLabel)), "gated stays gated");

  // 7. Holding personalization is private boolean-only.
  const id = randomUUID();
  await database.insert(users).values({ id, handle: `ud-${id.slice(0, 8)}`, displayName: "ud", avatarUrl: null, role: "member" });
  try {
    const authed = await getUtilityDiscovery(id, `G${"Z".repeat(55)}`);
    assert.ok(
      JSON.stringify(authed).length > 0 && !/G[A-Z2-7]{55}/.test(JSON.stringify(authed)),
      "no wallet in payload",
    );
  } finally {
    await database.delete(users).where(eq(users.id, id)).catch(() => {});
  }

  // 8. UI structure: intent chips, stacked cards, no wide tables.
  const page = readFileSync(join(ROOT, "src/app/use/page.tsx"), "utf8");
  const browser = readFileSync(join(ROOT, "src/components/use-browser.tsx"), "utf8");
  assert.ok(browser.includes("Filter by intent") && page.includes("Put tokenized assets to work"), "intent-first surface");
  assert.ok(!/<table/.test(browser), "stacked cards, mobile-safe");
  assert.ok(!browser.includes(">Open</a>") && !browser.includes(">Asset</a>"), "ambiguous CTAs removed");
  assert.ok(browser.includes("Open {group.code}"), "asset-named primary CTA");

  // 9. Asset grouping: each asset once, actions nested, campaigns embedded.
  const all = [...discovery.stellar, ...discovery.beyond];
  const groups = groupByAsset(all);
  assert.equal(new Set(groups.map((group) => group.slug)).size, groups.length, "each asset once");
  const benji = groups.find((group) => group.slug === "benji-on-stellar")!;
  assert.ok(benji && benji.actions.length >= 2, "BENJI actions grouped, not repeated");
  assert.ok(!groups.some((group) => group.actions.some((action) => action.assetSlug !== group.slug)), "no cross-asset leakage");
  const earnFiltered = groupByAsset(all.filter((item) => item.intent === "earn"));
  for (const group of earnFiltered) {
    assert.ok(group.actions.every((action) => action.intent === "earn"), `${group.slug}: filtered view shows only relevant actions`);
    assert.equal(group.campaigns.length, 0, `${group.slug}: campaigns stay out of intent views`);
  }
  const everything = groupByAsset(all);
  const liveCampaignItems = all.filter((item) => item.kind === "campaign-reward");
  for (const item of liveCampaignItems) {
    const group = everything.find((entry) => entry.slug === item.assetSlug)!;
    assert.ok(group.campaigns.some((entry) => entry.id === item.id), `${item.assetSlug}: campaign embedded under its asset`);
  }
  for (const group of groups) {
    const executable = group.actions.filter((action) => action.state === "available");
    const gated = group.actions.filter((action) => action.state !== "available");
    assert.ok(executable.every((action) => action.href.length > 0), `${group.slug}: executable keeps real href`);
    void gated;
  }

  console.log("utility-discovery:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
