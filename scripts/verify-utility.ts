import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { assetCapabilities, circles, organizations } from "../src/db/schema";
import {
  getCapabilityDetail,
  getCircleCapabilities,
  getSpaceCapabilities,
} from "../src/lib/utility/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();

const PUBLIC_KEYS = [
  "capabilityType",
  "circleId",
  "circleName",
  "circleSlug",
  "ctaLabel",
  "destinationUrl",
  "eligibilityNote",
  "id",
  "shortDescription",
  "sourceUrl",
  "supportMode",
  "title",
].sort();

async function cleanup(ids: string[]) {
  if (ids.length > 0) {
    await database.delete(assetCapabilities).where(inArray(assetCapabilities.id, ids));
  }
}

async function verify() {
  const probeIds: string[] = [];
  try {
    // Capability belongs to the correct Circle with validated support mode.
    const stellar = await getCircleCapabilities("usdc-on-stellar");
    assert(stellar.length >= 3, "USDC on Stellar must expose seeded capabilities.");
    for (const entry of stellar) {
      assert.equal(entry.circleSlug, "usdc-on-stellar");
      assert.equal(entry.circleName, "USDC on Stellar");
      assert(["connected", "guide"].includes(entry.supportMode), "Only connected/guide modes exist.");
      assert(entry.sourceUrl.startsWith("https://"), "Every capability must carry an https source.");
      assert.deepEqual(Object.keys(entry).sort(), PUBLIC_KEYS, "Public loader must expose the exact key set.");
    }
    const stellarTypes = stellar.map((entry) => entry.capabilityType).sort();
    assert.deepEqual(stellarTypes, ["build", "receive", "redeem", "send", "supply"]);

    // No truthful IN_VICUS capability exists anywhere yet.
    for (const slug of ["usdc-on-stellar", "usdc-on-base", "usdc-on-ethereum", "usdc-on-solana"]) {
      const entries = await getCircleCapabilities(slug);
      assert(!entries.some((entry) => entry.supportMode === "in_vicus"), `${slug} must not claim in-Vicus execution.`);
    }

    // Per-ecosystem scoping: taxonomy differs, no cross-chain execution claims.
    const base = await getCircleCapabilities("usdc-on-base");
    const ethereum = await getCircleCapabilities("usdc-on-ethereum");
    const solana = await getCircleCapabilities("usdc-on-solana");
    assert.deepEqual(base.map((entry) => entry.capabilityType).sort(), ["build", "redeem", "transfer"]);
    assert.deepEqual(ethereum.map((entry) => entry.capabilityType).sort(), ["build", "redeem", "transfer"]);
    assert.deepEqual(solana.map((entry) => entry.capabilityType).sort(), ["build", "pay", "transfer"]);
    const allEntries = [...stellar, ...base, ...ethereum, ...solana];
    for (const entry of allEntries) {
      const text = `${entry.title} ${entry.shortDescription} ${entry.eligibilityNote ?? ""}`.toLowerCase();
      for (const forbidden of ["apy", "yield", "price", "market cap", "market-cap", "buy now", "profit"]) {
        assert(!text.includes(forbidden), `${entry.capabilityType} must not contain "${forbidden}".`);
      }
    }
    // Base capability does not claim Stellar execution; Solana Pay stays Solana-scoped.
    const solanaPay = solana.find((entry) => entry.capabilityType === "pay");
    assert(solanaPay?.destinationUrl === "https://docs.solanapay.com/");
    assert(!base.some((entry) => (entry.destinationUrl ?? "").includes("stellar")));

    // Source URLs preserved exactly.
    const stellarSend = await getCapabilityDetail("usdc-on-stellar", "send");
    assert.equal(
      stellarSend?.sourceUrl,
      "https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations",
    );
    assert.equal(stellarSend?.destinationUrl, "https://www.freighter.app/");

    // Unknown circle/type resolves to empty, never throws.
    assert.deepEqual(await getCircleCapabilities("no-such-circle"), []);
    assert.equal(await getCapabilityDetail("usdc-on-stellar", "nope"), null);
    assert.equal(await getCapabilityDetail("no-such-circle", "send"), null);

    // Inactive capabilities stay hidden everywhere.
    const [stellarCircle] = await database
      .select({ id: circles.id })
      .from(circles)
      .where(eq(circles.slug, "usdc-on-stellar"))
      .limit(1);
    assert(stellarCircle, "Seeded Stellar circle must exist.");
    const [probe] = await database
      .insert(assetCapabilities)
      .values({
        circleId: stellarCircle.id,
        capabilityType: "swap",
        title: "Swap probe",
        shortDescription: "Temporary inactive probe.",
        supportMode: "guide",
        ctaLabel: "Probe",
        destinationUrl: null,
        sourceUrl: "https://example.com/probe",
        eligibilityNote: null,
        sortOrder: 99,
        active: false,
      })
      .returning({ id: assetCapabilities.id });
    assert(probe, "Probe row must insert.");
    probeIds.push(probe.id);
    const afterInsert = await getCircleCapabilities("usdc-on-stellar");
    assert(!afterInsert.some((entry) => entry.capabilityType === "swap"), "Inactive capability must stay hidden.");
    assert.equal(await getCapabilityDetail("usdc-on-stellar", "swap"), null);

    // Space aggregation includes hosted Circles only.
    const [circleOrg] = await database
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "circle"))
      .limit(1);
    assert(circleOrg, "Seeded Circle Space must exist.");
    const groups = await getSpaceCapabilities(circleOrg.id);
    assert.equal(groups.length, 4, "All four hosted USDC Circles must aggregate.");
    for (const group of groups) {
      assert(group.capabilities.length > 0);
      for (const entry of group.capabilities) {
        assert.deepEqual(Object.keys(entry).sort(), PUBLIC_KEYS);
      }
    }
    assert.deepEqual(await getSpaceCapabilities("00000000-0000-0000-0000-000000000000"), []);
    assert.deepEqual(await getSpaceCapabilities("not-a-uuid"), []);

    console.log("Utility verification passed", {
      correctCircle: true,
      modesValidated: true,
      sourceRequired: true,
      inactiveHidden: true,
      stellarScoped: true,
      baseScoped: true,
      ethereumScoped: true,
      solanaScoped: true,
      noMarketClaims: true,
      exactPublicKeys: true,
      spaceScoped: true,
      sourcesPreserved: true,
    });
  } finally {
    await cleanup(probeIds);
  }
}

verify().catch((error) => {
  console.error("Utility verification failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
