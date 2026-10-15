import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { config } from "dotenv";
import { getDatabase } from "../src/db";
import { basketWatches, userBaskets, users } from "../src/db/schema";
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
import { createUserBasket, getMyBasket, listMyBaskets, resolveMyBasket } from "../src/lib/baskets/user";
import { isBasketWatched, listWatchedBaskets, unwatchBasket, watchBasket } from "../src/lib/baskets/watch";

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

  // 8. P5.2 personal baskets: create → save → revisit → watch → reload →
  // unwatch, with owner isolation throughout. No execution anywhere.
  const database = getDatabase();
  const tempUsers: string[] = [];
  async function tempUser(prefix: string): Promise<string> {
    const id = randomUUID();
    await database.insert(users).values({
      id,
      handle: `${prefix}-${id.slice(0, 8)}`,
      displayName: `${prefix} basket tester`,
      avatarUrl: null,
      role: "member",
    });
    tempUsers.push(id);
    return id;
  }
  const alice = await tempUser("p52-alice");
  const bob = await tempUser("p52-bob");
  const mine = await createUserBasket(alice, {
    name: "My income themes",
    theme: "Income-oriented Stellar funds I want to compare.",
    rationale: "BENJI and WTGXX side by side for learning.",
    constituents: [
      { slug: "benji-on-stellar", weightBps: 5000 },
      { slug: "wtgxx-on-stellar", weightBps: 5000 },
    ],
  });
  assert.ok(mine.id && mine.slug.length > 0, "saved basket has a stable reference");
  assert.deepEqual(
    mine.constituents.map((c) => c.slug).sort(),
    ["benji-on-stellar", "wtgxx-on-stellar"],
    "constituents preserved",
  );
  const revisit = await getMyBasket(alice, mine.slug);
  assert.equal(revisit?.id, mine.id, "owner revisits by slug after save");
  const revisitById = await getMyBasket(alice, mine.id);
  assert.equal(revisitById?.slug, mine.slug, "owner revisits by id");
  const resolvedMine = await resolveMyBasket(alice, mine.slug);
  assert.equal(resolvedMine.complete, true, "owned basket resolves complete");
  assert.equal(resolvedMine.members.length, 2, "owned members enriched from registry");
  // Duplicate names get stable suffixed slugs, never collisions.
  const twin = await createUserBasket(alice, {
    name: "My income themes",
    theme: "A second theme with the same name.",
    rationale: "Slug collision handling.",
    constituents: [{ slug: "benji-on-stellar", weightBps: 10000 }],
  });
  assert.notEqual(twin.slug, mine.slug, "duplicate names get distinct slugs");
  // Invalid submissions rejected with reasons, nothing persisted.
  const shortWeights = await createUserBasket(alice, {
    name: "Bad weights", theme: "Theme with enough words here.", rationale: "Rationale with enough words here.",
    constituents: [{ slug: "benji-on-stellar", weightBps: 5000 }],
  }).then(() => null, (error: unknown) => error);
  assert.ok(shortWeights instanceof BasketsError, "partial weights rejected");
  const dupes = await createUserBasket(alice, {
    name: "Dupes", theme: "Theme with enough words here.", rationale: "Rationale with enough words here.",
    constituents: [
      { slug: "benji-on-stellar", weightBps: 5000 },
      { slug: "benji-on-stellar", weightBps: 5000 },
    ],
  }).then(() => null, (error: unknown) => error);
  assert.ok(dupes instanceof BasketsError, "duplicates rejected");
  const ghost = await createUserBasket(alice, {
    name: "Ghost", theme: "Theme with enough words here.", rationale: "Rationale with enough words here.",
    constituents: [{ slug: "no-such-asset", weightBps: 10000 }],
  }).then(() => null, (error: unknown) => error);
  assert.ok(ghost instanceof BasketsError && /Unknown catalogue assets/.test(ghost.message), "unknown assets rejected with names");
  const badName = await createUserBasket(alice, {
    name: "x", theme: "Theme with enough words here.", rationale: "Rationale with enough words here.",
    constituents: [{ slug: "benji-on-stellar", weightBps: 10000 }],
  }).then(() => null, (error: unknown) => error);
  assert.ok(badName instanceof BasketsError, "short names rejected");
  const anon = await createUserBasket(null, {
    name: "Anon", theme: "Theme with enough words here.", rationale: "Rationale with enough words here.",
    constituents: [{ slug: "benji-on-stellar", weightBps: 10000 }],
  }).then(() => null, (error: unknown) => error);
  assert.ok(anon instanceof BasketsError, "signed-out creation rejected");
  // Owner isolation: Bob sees nothing of Alice's, and cannot watch hers.
  assert.equal(await getMyBasket(bob, mine.slug), null, "stranger cannot read another's basket");
  assert.deepEqual(await listMyBaskets(bob), [], "stranger lists nothing");
  assert.equal(await watchBasket(bob, "user", mine.slug), null, "stranger cannot watch another's basket");
  assert.deepEqual((await listMyBaskets(alice)).map((b) => b.slug).sort(), [mine.slug, twin.slug].sort(), "owner lists both");
  // Watch lifecycle: curated + own, reload persistence, unwatch, unknown refs.
  assert.equal(await watchBasket(alice, "curated", "stellar-money-funds"), true, "watch curated");
  assert.equal(await watchBasket(alice, "user", mine.slug), true, "watch own");
  assert.equal(await isBasketWatched(alice, "curated", "stellar-money-funds"), true, "watched state reads back");
  const watchedOnce = await listWatchedBaskets(alice);
  assert.equal(watchedOnce.length, 2, "both watches persist across reads (reload-safe)");
  assert.equal(await watchBasket(alice, "curated", "stellar-money-funds"), true, "re-watch is idempotent");
  assert.equal((await listWatchedBaskets(alice)).length, 2, "no duplicate watch rows");
  assert.equal(await unwatchBasket(alice, "curated", "stellar-money-funds"), false, "unwatch");
  assert.equal(await isBasketWatched(alice, "curated", "stellar-money-funds"), false, "unwatch persists");
  assert.equal(await isBasketWatched(alice, "user", mine.slug), true, "other watch unaffected");
  assert.equal(await watchBasket(alice, "curated", "no-such-basket"), null, "unknown curated ref rejected");
  assert.equal(await watchBasket(alice, "bogus" as never, "stellar-money-funds"), null, "unknown kind rejected");
  assert.equal(await isBasketWatched(bob, "curated", "stellar-money-funds"), false, "watches never leak across users");
  // Missing-asset fallback degrades honestly at read time.
  const degraded = await (await import("../src/lib/baskets/service")).resolveBasketDef({
    slug: "degraded",
    name: "Degraded",
    theme: "A theme with a removed member.",
    rationale: "Fallback honesty.",
    constituents: [
      { slug: "benji-on-stellar", weightBps: 5000 },
      { slug: "retired-asset", weightBps: 5000 },
    ],
    sourceUrl: "",
    version: 1,
  });
  assert.equal(degraded.complete, false, "removed member marks incomplete");
  assert.equal(degraded.unresolved.length, 1, "removed member reported, not invented");
  assert.equal(degraded.members.length, 1, " surviving member still resolves");
  // No execution affordances anywhere in the basket stack.
  for (const file of [
    "src/lib/baskets/user.ts",
    "src/lib/baskets/watch.ts",
    "src/app/api/baskets/route.ts",
    "src/app/api/baskets/[ref]/watch/route.ts",
    "src/components/basket-create-form.tsx",
    "src/components/basket-watch-button.tsx",
  ]) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.ok(
      !/submitTransaction|signTransaction|TransactionBuilder|allocate|rebalanc|Buy now|Purchase/i.test(text),
      `${file}: no execution surface`,
    );
  }
  await database.delete(basketWatches).where(inArray(basketWatches.userId, tempUsers));
  await database.delete(userBaskets).where(inArray(userBaskets.ownerUserId, tempUsers));
  await database.delete(users).where(inArray(users.id, tempUsers));

  console.log("baskets:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
