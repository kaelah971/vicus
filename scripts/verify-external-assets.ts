import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assets, circles } from "../src/db/schema";
import { seedExternalAssets } from "./seed-external-assets";
import { getCircleLifecycle } from "../src/lib/lifecycle/service";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import {
  assetClassLabels,
  listCircles,
  matchesCircleFilters,
} from "../src/lib/data/circles";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();

const EXPECTED = [
  {
    slug: "tslax-on-solana",
    code: "TSLAx",
    chain: "Solana",
    ecosystem: "solana",
    mintOrContract: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    officialUrl: "https://xstocks.fi/",
    verificationSourceUrl: "https://docs.xstocks.fi/docs",
    issuer: "Backed (xStocks)",
  },
  {
    slug: "nvdac-on-base",
    code: "NVDAc",
    chain: "Base",
    ecosystem: "base",
    mintOrContract: "0xb20000000000000000000078ee7ce2fE4908108C",
    officialUrl: "https://www.base.org/stocks",
    verificationSourceUrl: "https://www.base.org/stocks",
    issuer: "Coinbase",
  },
];

const FAKE_METRIC = /apy|%|\$\d|yield\s+\d|x\s+returns?|tvl|\bguaranteed\b/i;
const UNSUPPORTED = ["swap", "send", "move", "exit", "borrow", "collateral", "supply", "earn"];

async function main() {
  // 1. Seed is idempotent: run twice, still exactly the two circles.
  const first = await seedExternalAssets();
  assert.deepEqual([...first.targets].sort(), ["nvdac-on-base", "tslax-on-solana"]);
  const second = await seedExternalAssets();
  assert.equal(second.ensured, 0, "second run creates nothing");
  for (const target of EXPECTED) {
    const rows = await database.select().from(circles).where(eq(circles.slug, target.slug));
    assert.equal(rows.length, 1, `${target.slug}: exactly one circle`);
  }

  // 2. Exact identity per asset: network, contract/mint, issuer, sources.
  for (const target of EXPECTED) {
    const [circle] = await database.select().from(circles).where(eq(circles.slug, target.slug)).limit(1);
    assert.ok(circle, `${target.slug} exists`);
    assert.equal(circle.category, "equity_fund", `${target.slug}: taxonomy valid`);
    assert.ok(assetClassLabels[circle.category], `${target.slug}: known asset-class label`);
    const [asset] = await database.select().from(assets).where(eq(assets.id, circle.assetId!)).limit(1);
    assert.ok(asset, `${target.slug}: asset row exists`);
    assert.equal(asset.chain, target.chain, `${target.slug}: exact chain`);
    assert.equal(asset.ecosystem, target.ecosystem, `${target.slug}: exact ecosystem`);
    assert.equal(asset.stellarContractId, target.mintOrContract, `${target.slug}: exact mint/contract`);
    assert.equal(asset.issuer, target.issuer, `${target.slug}: exact issuer`);
    assert.equal(asset.officialUrl, target.officialUrl, `${target.slug}: official URL`);
    assert.equal(asset.verificationSourceUrl, target.verificationSourceUrl, `${target.slug}: verification source`);
    assert.ok(asset.officialUrl.startsWith("https://"), `${target.slug}: https sources`);
    assert.ok((asset.eligibilityNote ?? "").length > 20, `${target.slug}: eligibility note present`);
    // No duplicate identity: mint/contract appears once across assets.
    const sameMint = await database.select({ id: assets.id }).from(assets).where(eq(assets.stellarContractId, target.mintOrContract));
    assert.equal(sameMint.length, 1, `${target.slug}: mint/contract unique`);
  }

  // 3. No fake metrics anywhere in the new copy.
  for (const target of EXPECTED) {
    const [circle] = await database.select().from(circles).where(eq(circles.slug, target.slug)).limit(1);
    const [asset] = await database.select().from(assets).where(eq(assets.id, circle!.assetId!)).limit(1);
    const copy = [circle!.name, circle!.tagline, asset!.name, asset!.description, asset!.intendedUse].join(" ");
    assert.ok(!FAKE_METRIC.test(copy), `${target.slug}: no invented metrics`);
    const steps = await getCircleLifecycle(target.slug);
    assert.ok(!FAKE_METRIC.test(steps.map((s) => `${s.title} ${s.shortDescription}`).join(" ")), `${target.slug}: lifecycle invents nothing`);
  }

  // 4. Lifecycle: evidenced stages only, in order; missing earn allowed.
  for (const target of EXPECTED) {
    const steps = await getCircleLifecycle(target.slug);
    assert.deepEqual(
      steps.map((s) => s.stage),
      ["access", "hold", "use", "exit"],
      `${target.slug}: exactly the evidenced stages`,
    );
    assert.ok(!steps.some((s) => s.stage === "earn"), `${target.slug}: no unverified earn`);
    for (const step of steps) {
      assert.ok(step.sourceUrl.startsWith("https://"), `${target.slug}/${step.stage}: source required`);
      if (step.ctaLabel) assert.ok(step.destinationUrl, `${target.slug}/${step.stage}: CTA has a destination`);
    }
  }

  // 5. Action engine: only real actions, no chain-specific hacks.
  for (const target of EXPECTED) {
    const actions = await resolveAssetActions(target.slug, target.chain);
    const kinds = actions.map((a) => a.kind);
    assert.ok(kinds.includes("access"), `${target.slug}: ACCESS present`);
    assert.ok(kinds.includes("redeem"), `${target.slug}: REDEEM present`);
    for (const bad of UNSUPPORTED) {
      assert.ok(!kinds.includes(bad as never), `${target.slug}: no ${bad} without execution`);
    }
    for (const action of actions) {
      assert.equal(action.network, target.chain, `${target.slug}/${action.kind}: carries its chain`);
      assert.ok(action.executionMode === "official" || action.executionMode === "connected", `${target.slug}/${action.kind}: no Vicus-execution claim`);
      assert.ok(action.sourceUrl.startsWith("https://"), `${target.slug}/${action.kind}: source required`);
    }
    assert.ok(!/0x[0-9a-fA-F]{40}/.test(JSON.stringify(actions)), `${target.slug}: no raw addresses in actions`);
  }

  // 6. Discover filters compose over the broader directory.
  const all = await listCircles(null);
  const entries = all.filter((c) => c.state !== "education");
  const equitySolana = entries.filter((c) =>
    matchesCircleFilters(c, { assetClass: "equity_fund", ecosystem: "solana", query: "", state: "All statuses" }),
  );
  assert.deepEqual(equitySolana.map((c) => c.slug).sort(), ["aaplx-on-solana", "tslax-on-solana"]);
  const equityBase = entries.filter((c) =>
    matchesCircleFilters(c, { assetClass: "equity_fund", ecosystem: "base", query: "", state: "All statuses" }),
  );
  assert.deepEqual(equityBase.map((c) => c.slug).sort(), ["aaplc-on-base", "nvdac-on-base"]);
  const queried = entries.filter((c) =>
    matchesCircleFilters(c, { assetClass: "all", ecosystem: "all", query: "tslax", state: "All statuses" }),
  );
  assert.ok(queried.some((c) => c.slug === "tslax-on-solana"), "text query finds TSLAx");

  // 7. Existing behavior unchanged.
  const aaplx = await resolveAssetActions("aaplx-on-solana", "Solana");
  assert.deepEqual(aaplx.map((a) => a.kind), ["access", "swap", "exit"], "AAPLx actions unchanged");
  const aaplc = await resolveAssetActions("aaplc-on-base", "Base");
  assert.equal(aaplc.find((a) => a.kind === "access")?.state, "permissioned", "AAPLc still gated");

  // 8. Public payloads leak nothing private.
  const payload = JSON.stringify(await resolveAssetActions("tslax-on-solana", "Solana"));
  assert.ok(!/userId|orderId|privateKey|seed phrase/i.test(payload), "no private material");

  console.log("external-assets:verified — tslax-on-solana + nvdac-on-base");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
