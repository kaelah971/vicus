import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { listCircles, isAssetCircle } from "../src/lib/data/circles";
import {
  PRICE_TYPE_LABELS,
  validateEvidence,
  unavailableEvidence,
  type PriceEvidence,
} from "../src/lib/prices/types";
import { clearPriceCache, getPriceEvidence } from "../src/lib/prices/sources";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(__dirname, "..");
const FABRICATED = /apy|tvl|market[\s-]?cap|guaranteed[\s-]returns?|\bx\s+returns?\b/i;

const goodQuote: PriceEvidence = {
  slug: "aaplx-on-solana",
  code: "AAPLx",
  network: "Solana",
  status: "available",
  priceType: "indicative_quote",
  value: 250,
  currency: "USDC",
  source: { name: "Jupiter", url: "https://jup.ag/" },
  observedAt: new Date().toISOString(),
  retrievedAt: new Date().toISOString(),
  freshness: "live",
  detail: "Indicative 25-USDC swap quote",
  reason: null,
  series: [],
};

async function main() {
  // 1. Price types are four distinct, honestly labeled kinds.
  assert.equal(Object.keys(PRICE_TYPE_LABELS).length, 4, "four price types");
  assert.ok(!PRICE_TYPE_LABELS.indicative_quote.toLowerCase().includes("market"), "quote never labeled market");
  assert.ok(!PRICE_TYPE_LABELS.issuer_nav.toLowerCase().includes("market"), "NAV never labeled market");
  assert.ok(
    PRICE_TYPE_LABELS.underlying_reference.toLowerCase().includes("reference") &&
      PRICE_TYPE_LABELS.underlying_reference !== PRICE_TYPE_LABELS.token_market,
    "reference is its own labeled kind, never market",
  );

  // 2. Validation: good evidence passes; fabrication paths fail.
  assert.deepEqual(validateEvidence(goodQuote), [], "valid quote passes");
  assert.deepEqual(
    validateEvidence({ ...goodQuote, value: Number.NaN }),
    ["available evidence needs a finite positive value"],
    "NaN value rejected",
  );
  assert.ok(validateEvidence({ ...goodQuote, value: -3 }).length > 0, "negative rejected");
  assert.ok(validateEvidence({ ...goodQuote, currency: null }).length > 0, "missing currency rejected");
  assert.ok(validateEvidence({ ...goodQuote, observedAt: null }).length > 0, "missing timestamp rejected");
  assert.ok(validateEvidence({ ...goodQuote, reason: "provider_error" }).length > 0, "available must not carry a reason");
  const absent = unavailableEvidence({
    slug: "nvdac-on-base",
    code: "NVDAc",
    network: "Base",
    reason: "venue_gated",
    detail: "No verified price feed — venue gated",
  });
  assert.deepEqual(validateEvidence(absent), [], "well-formed absence passes");
  assert.ok(validateEvidence({ ...absent, value: 10 }).length > 0, "unavailable must not carry a value");
  assert.ok(validateEvidence({ ...absent, priceType: "token_market" }).length > 0, "unavailable must not claim a type");
  assert.ok(
    validateEvidence({ ...goodQuote, series: [{ t: "not-a-date", value: 1 }] }).length > 0,
    "bad series observation rejected",
  );

  // 3. Feed-coverage matrix with stub transports (no network, deterministic).
  clearPriceCache();
  const stubQuote = async () => ({ outAmount: "100000000", observedAt: "2026-10-16T12:00:00.000Z" });
  const aaplx = await getPriceEvidence("aaplx-on-solana", { transport: stubQuote });
  assert.equal(aaplx.status, "available", "AAPLx quote available");
  assert.equal(aaplx.priceType, "indicative_quote", "AAPLx is a quote, never market");
  assert.equal(aaplx.currency, "USDC", "quote denominated in USDC, never USD");
  assert.equal(aaplx.value, 25, "25 USDC / 1.0 token = 25 USDC per token");
  assert.equal(aaplx.freshness, "live", "stub quote is live");
  assert.deepEqual(validateEvidence(aaplx), [], "stub quote validates");

  clearPriceCache();
  const tslax = await getPriceEvidence("tslax-on-solana", { transport: stubQuote });
  assert.equal(tslax.priceType, "indicative_quote", "TSLAx is a quote, never market");

  // Zero / malformed venue output must never become a zero price.
  clearPriceCache();
  const zeroOut = await getPriceEvidence("aaplx-on-solana", {
    transport: async () => ({ outAmount: "0", observedAt: new Date().toISOString() }),
  });
  assert.equal(zeroOut.status, "unavailable", "zero venue output stays unavailable");

  // Provider failure stays a failure — never fresh, never stale-as-fresh.
  clearPriceCache();
  const failing = await getPriceEvidence("aaplx-on-solana", {
    transport: async () => null,
  });
  assert.equal(failing.status, "unavailable", "provider failure is unavailable");
  assert.equal(failing.reason, "provider_error", "failure reason recorded");
  assert.equal(failing.value, null, "failure carries no value");

  // Issuer NAV without any network call.
  let networkCalls = 0;
  const counting = async () => {
    networkCalls += 1;
    return null;
  };
  const benji = await getPriceEvidence("benji-on-stellar", { transport: counting });
  assert.equal(benji.priceType, "issuer_nav", "BENJI is issuer NAV");
  assert.equal(benji.value, 1, "BENJI NAV is 1 USD");
  assert.equal(benji.freshness, "reference", "NAV is reference, never live");
  assert.equal(networkCalls, 0, "NAV needs no venue call");
  assert.ok((benji.detail + (benji.source?.name ?? "")).toLowerCase().includes("issuer"), "NAV labeled issuer-reported");
  const wtgxx = await getPriceEvidence("wtgxx-on-stellar", { transport: counting });
  assert.equal(wtgxx.priceType, "issuer_nav", "WTGXX is issuer NAV");

  // Gated venues and feed-less assets.
  const aaplc = await getPriceEvidence("aaplc-on-base", { transport: counting });
  assert.equal(aaplc.reason, "venue_gated", "AAPLc venue gated");
  const nvdac = await getPriceEvidence("nvdac-on-base", { transport: counting });
  assert.equal(nvdac.reason, "venue_gated", "NVDAc venue gated");
  for (const slug of ["usdc-on-stellar", "pyusd-on-stellar", "usdy-on-stellar", "wtsyx-on-stellar", "usdc-on-base"]) {
    const ev = await getPriceEvidence(slug, { transport: counting });
    assert.equal(ev.status, "unavailable", `${slug} unavailable`);
    assert.equal(ev.reason, "no_verified_feed", `${slug} reason is no_verified_feed`);
  }
  const unknown = await getPriceEvidence("fakecoin-xyz", { transport: counting });
  assert.equal(unknown.reason, "unsupported_asset", "unknown asset unsupported");

  // 4. Live registry: every catalogue asset resolves to a VALID evidence
  // object (matrix covers the catalogue, nothing silently missing).
  const all = (await listCircles(null)).filter(isAssetCircle);
  assert.ok(all.length >= 14, `catalogue has depth (saw ${all.length})`);
  const covered = new Set<string>();
  for (const circle of all) {
    const ev = await getPriceEvidence(circle.slug, {
      transport: async () => ({ outAmount: "100000000", observedAt: new Date().toISOString() }),
    });
    assert.deepEqual(validateEvidence(ev), [], `${circle.slug}: evidence validates`);
    if (ev.status === "available") covered.add(circle.slug);
  }
  assert.ok(covered.has("benji-on-stellar") && covered.has("wtgxx-on-stellar"), "NAV assets covered");
  assert.ok(covered.has("aaplx-on-solana") && covered.has("tslax-on-solana"), "quote assets covered");

  // 5. Live provider probe (tolerant): either a valid live quote or an
  // honest provider_error — never a throw, never a fabricated value.
  clearPriceCache();
  const live = await getPriceEvidence("aaplx-on-solana");
  assert.deepEqual(validateEvidence(live), [], "live evidence validates either way");
  console.log(`live Jupiter probe: ${live.status}${live.status === "available" ? ` @ ${live.value} ${live.currency}` : ` (${live.reason})`}`);

  // 6. Product wiring: sheet + circle detail show price/absence; tiles
  // stay price-free (P1.1 hierarchy preserved); no fabricated metrics.
  const sheetSrc = readFileSync(join(ROOT, "src/components/asset-sheet.tsx"), "utf8");
  const circleSrc = readFileSync(join(ROOT, "src/app/circles/[slug]/page.tsx"), "utf8");
  const tileSrc = readFileSync(join(ROOT, "src/components/asset-tile.tsx"), "utf8");
  const blockSrc = readFileSync(join(ROOT, "src/components/price-block.tsx"), "utf8");
  const apiSrc = readFileSync(join(ROOT, "src/app/api/v1/prices/route.ts"), "utf8");
  const libSrc =
    readFileSync(join(ROOT, "src/lib/prices/types.ts"), "utf8") +
      readFileSync(join(ROOT, "src/lib/prices/sources.ts"), "utf8");
  assert.ok(sheetSrc.includes("PriceBlock") && sheetSrc.includes(">Price<"), "sheet carries a Price section");
  assert.ok(circleSrc.includes("PriceBlock") && circleSrc.includes('id="price"'), "circle overview carries a price section");
  assert.ok(!tileSrc.includes("Price") && !tileSrc.includes("price"), "tiles carry no prices (P1.1 hierarchy)");
  assert.ok(blockSrc.includes("No verified price feed"), "intentional absence state exists");
  assert.ok(blockSrc.includes("Source:") && blockSrc.includes("Updated"), "source + timestamp shown");
  assert.ok(blockSrc.includes("series.length >= 2"), "charts need a verified series");
  assert.ok(blockSrc.includes("never draws decorative charts"), "no-chart honesty stated");
  assert.ok(apiSrc.includes("getPriceEvidence") && apiSrc.includes("max-age=60"), "server fetch with short cache");
  assert.ok(!/NEXT_PUBLIC_.*KEY|process\.env\.[A-Z_]*(KEY|SECRET)/.test(apiSrc + blockSrc), "no secret keys near the price path");
  for (const [name, src] of [
    ["types", readFileSync(join(ROOT, "src/lib/prices/types.ts"), "utf8")],
    ["sources", readFileSync(join(ROOT, "src/lib/prices/sources.ts"), "utf8")],
    ["price-block", blockSrc],
  ] as const) {
    assert.ok(!FABRICATED.test(src), `${name}: no fabricated metrics`);
  }
  assert.ok(libSrc.includes("XLM-denominated"), "orderbook limitation documented, not priced");

  console.log("prices:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
