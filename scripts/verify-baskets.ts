import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import {
  BASKETS,
  BASKET_WEIGHT_TOTAL_BPS,
  DISCOVERY_ONLY_DISCLOSURE,
  getBasketDef,
  validateBasketDef,
  validateSeededBaskets,
  weightPercent,
} from "../src/lib/baskets/config";
import { BasketsError, listBaskets, resolveBasket } from "../src/lib/baskets/service";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(__dirname, "..");
const FAKE = /apy\s*\d|guaranteed|projected returns?|\bROI\b|risk-free|earn\s+up\s+to/i;

async function main() {
  // 1. Seeded themes are structurally valid: 4 curated baskets, exact totals.
  assert.ok(BASKETS.length >= 3, "3+ seeded curated themes");
  assert.deepEqual(validateSeededBaskets(), [], "seeded defs structurally valid");
  for (const def of BASKETS) {
    const total = def.constituents.reduce((sum, c) => sum + c.weightBps, 0);
    assert.equal(total, BASKET_WEIGHT_TOTAL_BPS, `${def.slug}: weights total exactly`);
    assert.ok(def.constituents.every((c) => Number.isInteger(c.weightBps) && c.weightBps > 0), `${def.slug}: positive integer weights`);
    assert.ok(def.theme.length > 20 && def.rationale.length > 20, `${def.slug}: theme + rationale present`);
    assert.ok(def.sourceUrl.startsWith("http"), `${def.slug}: provenance source present`);
  }

  // 2. Validation rejects malformed defs deterministically.
  assert.deepEqual(validateBasketDef({ slug: "x", name: "X", theme: "t", rationale: "r", constituents: [{ slug: "a", weightBps: 5000 }, { slug: "a", weightBps: 5000 }], sourceUrl: "https://example.com", version: 1 }), { ok: false, issues: ["duplicate-constituent"] }, "duplicates rejected");
  const badTotal = validateBasketDef({ slug: "x", name: "X", theme: "t", rationale: "r", constituents: [{ slug: "a", weightBps: 5000 }], sourceUrl: "https://example.com", version: 1 });
  assert.ok(!badTotal.ok && badTotal.issues.includes("bad-total"), "partial totals rejected");
  const badWeight = validateBasketDef({ slug: "x", name: "X", theme: "t", rationale: "r", constituents: [{ slug: "a", weightBps: 2.5 }], sourceUrl: "https://example.com", version: 1 });
  assert.ok(!badWeight.ok && badWeight.issues.includes("bad-weight"), "fractional weights rejected");
  assert.deepEqual(validateBasketDef(null as unknown as never), { ok: false, issues: ["unknown-shape"] }, "malformed def rejected");
  assert.equal(getBasketDef("  "), null, "blank slug resolves null");
  assert.equal(weightPercent(5000), "50%", "weight display");
  assert.equal(weightPercent(3333), "33.33%", "weight display with decimals");

  // 3. Registry resolution: every seeded constituent resolves live.
  const summaries = await listBaskets();
  assert.equal(summaries.length, BASKETS.length, "every theme listed");
  assert.deepEqual(summaries.map((s) => s.slug), [...BASKETS].map((d) => d.slug).sort(), "list is slug-sorted");
  for (const def of BASKETS) {
    const resolved = await resolveBasket(def.slug);
    assert.equal(resolved.unresolved.length, 0, `${def.slug}: all constituents resolve`);
    assert.equal(resolved.complete, true, `${def.slug}: complete`);
    assert.equal(resolved.disclosure, DISCOVERY_ONLY_DISCLOSURE, "disclosure attached");
    assert.equal(resolved.members.length, def.constituents.length, "no member invented or dropped");
    const weights = resolved.members.reduce((sum, m) => sum + m.weightBps, 0);
    assert.equal(weights, BASKET_WEIGHT_TOTAL_BPS, "resolved weights still total");
    for (const member of resolved.members) {
      assert.ok(member.code.length > 0, `${member.slug}: code from registry`);
      assert.ok(member.issuer.length > 0, `${member.slug}: issuer from registry`);
      assert.ok(member.network.length > 0, `${member.slug}: network from registry`);
      assert.ok(member.openHref === `/circles/${member.slug}`, "member links to its asset page");
    }
    const again = await resolveBasket(def.slug);
    assert.deepEqual(again, resolved, `${def.slug}: deterministic resolution`);
  }

  // 4. Unknown slugs fail closed, never fabricated.
  try {
    await resolveBasket("no-such-basket");
    assert.fail("unknown basket must throw");
  } catch (error) {
    assert.ok(error instanceof BasketsError && error.code === "not-found", "unknown basket is not-found");
  }
  assert.equal(getBasketDef("no-such-basket"), null, "unknown def is null");

  // 5. Restricted constituents keep their engine verdicts — membership
  // implies nothing about eligibility.
  const benji = await resolveAssetActions("benji-on-stellar", "Stellar");
  assert.equal(benji.find((a) => a.kind === "send")?.state, "permissioned", "BENJI send stays permissioned inside a theme");

  // 6. No fabricated financial claims anywhere in basket copy. The shared
  // disclosure is excluded first so its honest negation reads clean.
  const copy = JSON.stringify({ defs: BASKETS }).split(DISCOVERY_ONLY_DISCLOSURE).join("");
  assert.ok(!FAKE.test(copy), "no APY/return/guarantee language");
  assert.ok(!/buy now|\ballocate\b|portfolio holding/i.test(copy), "no purchasability language");
  assert.ok(!/\binvestable\b/i.test(copy), "investable appears only in the disclosure");

  // 7. Presentation: routes exist, disclosure rendered, no execution affordances.
  for (const file of ["src/app/baskets/page.tsx", "src/app/baskets/[slug]/page.tsx", "src/lib/baskets/config.ts", "src/lib/baskets/service.ts"]) {
    assert.ok(existsSync(join(ROOT, file)), `${file} exists`);
  }
  const detail = readFileSync(join(ROOT, "src/app/baskets/[slug]/page.tsx"), "utf8");
  assert.ok(detail.includes("DISCOVERY_ONLY_DISCLOSURE") && detail.includes("Not investable"), "detail carries the disclosure");
  assert.ok(!/Buy|Invest(able)?|Allocate|Purchase|Checkout|swap|Swap/i.test(detail.replace(/Open asset|Open theme|Open USDC|openHref|Not investable/g, "")), "no execution affordances");
  const list = readFileSync(join(ROOT, "src/app/baskets/page.tsx"), "utf8");
  assert.ok(list.includes("DISCOVERY_ONLY_DISCLOSURE"), "list carries the disclosure");

  console.log("baskets:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
