import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import { getSubjectDef } from "../src/lib/subjects/config";
import { compareRepresentations, getSubjectView } from "../src/lib/subjects/service";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(__dirname, "..");
const FAKE = /apy|\$\d|\btvl\b|\bvolume\b.*\d|best pick|top pick|guaranteed returns/i;

async function main() {
  // 1. Apple resolves exactly the two verified representations.
  const apple = await getSubjectView("apple");
  assert.deepEqual(apple.representations.map((r) => r.assetSlug).sort(), ["aaplc-on-base", "aaplx-on-solana"]);
  assert.equal(apple.hasStellarRepresentation, false, "no fake Stellar Apple");
  const aaplx = apple.representations.find((r) => r.assetSlug === "aaplx-on-solana")!;
  const aaplc = apple.representations.find((r) => r.assetSlug === "aaplc-on-base")!;
  assert.equal(aaplx.contractOrMint, "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", "exact AAPLx mint");
  assert.equal(aaplc.contractOrMint, "0xb200000000000000000000C2e324d24d7eEcd1fb", "exact AAPLc contract");
  assert.ok(aaplx.issuer.includes("Backed") && aaplc.issuer.includes("Coinbase"), "distinct issuers explicit");

  // 2. Representation actions equal live engine output — never static claims.
  for (const rep of apple.representations) {
    const engine = await resolveAssetActions(rep.assetSlug, rep.network);
    assert.deepEqual(
      rep.actions.map((a) => `${a.kind}:${a.state}`),
      engine.map((a) => `${a.kind}:${a.state}`),
      `${rep.assetSlug}: engine parity`,
    );
  }
  assert.ok(aaplx.availableKinds.includes("swap") && aaplx.availableKinds.includes("exit"), "AAPLx exit visible");
  assert.ok(aaplc.availableKinds.includes("borrow"), "AAPLc borrow visible");
  assert.ok(!aaplc.availableKinds.includes("access"), "gated acquisition stays gated");

  // 3. Compare derives every row from shared truth.
  const compared = await compareRepresentations("aaplx-on-solana", "aaplc-on-base");
  const byField = new Map(compared.rows.map((row) => [row.field, row.values]));
  assert.equal(byField.get("Network")!.join("|"), "Solana|Base");
  assert.ok((byField.get("Contract / mint")![0] ?? "").length > 20, "exact identifiers compared");
  assert.ok((byField.get("Access")![0] ?? "").startsWith("Executable"), "AAPLx access executable");
  assert.ok((byField.get("Access")![1] ?? "").startsWith("Gated"), "AAPLc access gated with reason");
  assert.ok(!(byField.get("Access")![1] ?? "").includes("undefined"), "no undefined copy");
  const blob = JSON.stringify(compared.rows);
  assert.ok(!FAKE.test(blob), "no scores, prices, TVL, or winners");
  await assert.rejects(compareRepresentations("aaplx-on-solana", "aaplx-on-solana"), "same-asset compare rejected");
  await assert.rejects(compareRepresentations("aaplx-on-solana", "no-such-asset"), "unknown asset rejected");

  // 4. Stellar issuer groupings contain only real registry members.
  const wisdomtree = await getSubjectView("wisdomtree");
  assert.deepEqual(
    wisdomtree.representations.map((r) => r.assetSlug).sort(),
    ["spxux-on-stellar", "techx-on-stellar", "tipsx-on-stellar", "wtgxx-on-stellar", "wtsyx-on-stellar"],
    "WisdomTree grouping exact",
  );
  assert.ok(wisdomtree.representations.every((r) => r.ecosystem === "stellar"), "Stellar-native hero set");
  assert.ok(wisdomtree.representations.every((r) => r.issuer.includes("WisdomTree")), "issuer match enforced");
  const franklin = await getSubjectView("franklin-templeton");
  assert.deepEqual(franklin.representations.map((r) => r.assetSlug), ["benji-on-stellar"], "BENJI grouping exact");
  await assert.rejects(getSubjectView("no-such-subject"), "unknown subject rejected");

  // 5. Stellar-native comparison over genuinely comparable funds.
  const funds = await compareRepresentations("benji-on-stellar", "wtgxx-on-stellar");
  const fundFields = new Map(funds.rows.map((row) => [row.field, row.values]));
  assert.ok((fundFields.get("Asset class") ?? []).length === 2, "mandates shown side by side, not merged");
  assert.ok(!/same mandate|equivalent|identical/i.test(JSON.stringify(funds.rows)), "no false equivalence");

  // 6. Unknown identifiers are never fabricated.
  assert.ok(getSubjectDef("apple")!.representations.length === 2, "config lists two");
  const serviceText = readFileSync(join(ROOT, "src/lib/subjects/service.ts"), "utf8");
  assert.ok(serviceText.includes("Not published in Vicus source set"), "explicit unknown marker");

  // 7. Compare UI stacks rows — no wide-table dependency.
  const comparePage = readFileSync(join(ROOT, "src/app/compare/page.tsx"), "utf8");
  assert.ok(!/<table/.test(comparePage), "stacked sections, mobile-safe");
  assert.ok(!FAKE.test(comparePage), "no fabrication in compare copy");

  console.log("representations:verified — apple, issuers, compare");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
