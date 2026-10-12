import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetLifecycleSteps, circles } from "../src/db/schema";
import {
  getCircleLifecycle,
  isLifecycleAccessMode,
  isLifecycleStage,
  lifecycleStages,
} from "../src/lib/lifecycle/service";
import { getCircleBySlug } from "../src/lib/data/circles";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();

const EXPECTED_STAGES: Record<string, string[]> = {
  "benji-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "wtgxx-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "wtsyx-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "tipsx-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "spxux-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "techx-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "usdy-on-stellar": ["access", "hold", "use", "earn", "exit"],
  "usdc-on-stellar": ["access", "hold", "use", "exit"],
  "pyusd-on-stellar": ["access", "hold", "use", "exit"],
};

const YIELD_PATTERN = /apy|tv[l]|\b\d+(\.\d+)?\s*%\s*(apy|yield|returns?)\b|\$[\d,]+(\.\d+)?\s*[bmt]\b|projected|guaranteed returns?/i;

async function verify() {
  // Valid stages only, deterministic ACCESS → EXIT order, sources required.
  for (const [slug, stages] of Object.entries(EXPECTED_STAGES)) {
    const steps = await getCircleLifecycle(slug);
    assert.deepEqual(
      steps.map((step) => step.stage),
      stages,
      `${slug} exposes exactly its evidenced stages in order.`,
    );
    for (const step of steps) {
      assert(isLifecycleStage(step.stage), `${slug} valid stage.`);
      assert(step.title.length > 0 && step.shortDescription.length > 20, `${slug}/${step.stage} copy present.`);
      assert(step.sourceUrl.startsWith("https://"), `${slug}/${step.stage} source required.`);
      assert(["in_vicus", "connected", "guide"].includes(step.supportMode), `${slug}/${step.stage} known mode.`);
      if (step.accessMode !== null) {
        assert(isLifecycleAccessMode(step.accessMode), `${slug}/${step.stage} known access mode.`);
      }
      if (step.ctaLabel) assert(step.destinationUrl, `${slug}/${step.stage} CTA has a destination.`);
      assert(!YIELD_PATTERN.test(`${step.title} ${step.shortDescription}`), `${slug}/${step.stage} invents no yield.`);
    }
  }

  // Stablecoin lifecycles differ from fund lifecycles: no earn stage.
  const usdc = await getCircleLifecycle("usdc-on-stellar");
  assert(!usdc.some((step) => step.stage === "earn"), "USDC carries no earn stage.");
  const benji = await getCircleLifecycle("benji-on-stellar");
  assert(benji.some((step) => step.stage === "earn"), "BENJI carries its documented earn stage.");

  // USDC may reference Access; non-USDC assets never claim CCTP execution.
  const usdcUse = usdc.find((step) => step.stage === "use");
  assert.equal(usdcUse?.destinationUrl, "/access", "USDC use links Vicus Access.");
  for (const slug of Object.keys(EXPECTED_STAGES)) {
    if (slug === "usdc-on-stellar") continue;
    const steps = await getCircleLifecycle(slug);
    for (const step of steps) {
      for (const field of [step.title, step.shortDescription, step.ctaLabel, step.destinationUrl]) {
        assert(!/cctp|vicus access|\/access/i.test(field ?? ""), `${slug} never claims CCTP execution.`);
      }
    }
  }

  // Inactive steps hidden; rows scoped to the correct Circle.
  const [circle] = await database
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.slug, "benji-on-stellar"))
    .limit(1);
  assert(circle, "BENJI circle exists.");
  await database
    .update(assetLifecycleSteps)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(assetLifecycleSteps.circleId, circle.id), eq(assetLifecycleSteps.stage, "earn")));
  const hidden = await getCircleLifecycle("benji-on-stellar");
  assert(!hidden.some((step) => step.stage === "earn"), "Inactive steps stay hidden.");
  await database
    .update(assetLifecycleSteps)
    .set({ active: true, updatedAt: new Date() })
    .where(and(eq(assetLifecycleSteps.circleId, circle.id), eq(assetLifecycleSteps.stage, "earn")));
  const restored = await getCircleLifecycle("benji-on-stellar");
  assert(restored.some((step) => step.stage === "earn"), "Reactivated steps return.");

  // Unknown circles resolve empty, never error.
  assert.deepEqual(await getCircleLifecycle("no-such-circle"), []);
  assert.deepEqual(await getCircleLifecycle(""), []);

  // Lifecycle is public asset metadata: exact key set, no secret material.
  const payload = await getCircleLifecycle("benji-on-stellar");
  for (const step of payload) {
    assert.deepEqual(
      Object.keys(step).sort(),
      ["accessMode", "circleId", "circleSlug", "ctaLabel", "destinationUrl", "eligibilityNote", "id", "shortDescription", "sourceUrl", "stage", "supportMode", "supportModeLabel", "title"],
      "Lifecycle payload carries public fields only.",
    );
  }
  const serialized = JSON.stringify(payload);
  assert(!/S[A-Z0-9]{55}|privateKey|token_hash|DATABASE_URL|ISSUER_SECRET/i.test(serialized), "No private data leaks.");

  // Circle pages still resolve with lifecycle alongside utility data.
  const detail = await getCircleBySlug("spxux-on-stellar");
  assert(detail, "SPXUX passport resolves with lifecycle present.");
  assert(!isLifecycleStage("buy"), "Stage vocabulary stays closed.");

  console.log("Lifecycle verification passed", {
    assets: Object.keys(EXPECTED_STAGES).length,
    stageOrder: lifecycleStages.join(">"),
    stablecoinDiffers: true,
    accessGated: true,
    inactiveHidden: true,
    noLeakage: true,
  });
}

verify().catch((error) => {
  console.error("Lifecycle verification failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
