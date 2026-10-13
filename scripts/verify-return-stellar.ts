import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import { ACCESS_SOURCE_NETWORK } from "../src/lib/access/config";
import { createAccessTransfer } from "../src/lib/access/service";
import { getReturnRoutes,
  requireExecutableReturnRoute,
  resolveReturnRoute,
  ReturnRouteError,
} from "../src/lib/return-stellar/routes";

config({ path: ".env.local" });
config({ path: ".env" });

async function expectReturnError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ReturnRouteError, "expected ReturnRouteError");
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected return error ${code}`);
}

async function main() {
  // 1. Route config pins the canonical Stellar destination.
  const routes = getReturnRoutes();
  assert.equal(routes.length, 3, "solana + base + ethereum return legs modeled");
  for (const route of routes) {
    assert.equal(route.destinationNetwork, "stellar");
    assert.equal(route.destinationAsset, "USDC");
    assert.equal(route.destinationIssuer, "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "canonical Stellar USDC issuer");
    assert.equal(route.adapter, "cctp-reverse");
    assert.equal(route.executable, false, `${route.id}: gated`);
    assert.ok((route.reasonUnavailable ?? "").length > 20, `${route.id}: documented reason`);
    assert.ok(route.requirements.includes("session-wallet-destination"), `${route.id}: authenticated destination required`);
    assert.ok(route.requirements.includes("stellar-usdc-trustline"), `${route.id}: trustline readiness required`);
    assert.equal(route.href, null, `${route.id}: no continuation route invented`);
  }
  const solana = routes.find((r) => r.sourceNetwork === "solana")!;
  assert.equal(solana.sourceMint, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "canonical Solana USDC only");

  // 2. Exact matching; anything else is unsupported.
  assert.equal(resolveReturnRoute({ sourceNetwork: "solana", sourceAsset: "USDC" })?.id, "solana-usdc-to-stellar");
  assert.equal(resolveReturnRoute({ sourceNetwork: "base", sourceAsset: "USDC" })?.id, "base-usdc-to-stellar");
  assert.equal(resolveReturnRoute({ sourceNetwork: "solana", sourceAsset: "AAPLx" }), null, "the stock itself never crosses");
  assert.equal(resolveReturnRoute({ sourceNetwork: "solana", sourceAsset: "SOL" }), null);
  assert.equal(resolveReturnRoute({ sourceNetwork: "stellar", sourceAsset: "USDC" }), null);
  assert.equal(resolveReturnRoute({}), null);

  // 3. No executable return exists — every path reports honestly.
  await expectReturnError((async () => requireExecutableReturnRoute({ sourceNetwork: "solana", sourceAsset: "USDC" }))(), "execution-disabled");
  await expectReturnError((async () => requireExecutableReturnRoute({ sourceNetwork: "base", sourceAsset: "USDC" }))(), "execution-disabled");
  await expectReturnError((async () => requireExecutableReturnRoute({ sourceNetwork: "doge", sourceAsset: "USDC" }))(), "unsupported-route");

  // 4. Existing CCTP stack accepts no Stellar destination and no Solana source.
  assert.equal(ACCESS_SOURCE_NETWORK, "stellar_testnet", "Access stays Stellar-source");
  try {
    await createAccessTransfer("00000000-0000-0000-0000-000000000001", {
      destinationNetwork: "stellar",
      destinationAddress: "0x1111111111111111111111111111111111111111",
      amount: "5",
      sourceWallet: `G${"A".repeat(55)}`,
    });
    assert.fail("stellar destination must be rejected");
  } catch (error) {
    assert.ok(error instanceof Error && "code" in error && (error as { code: string }).code === "unsupported-destination", "stellar destination rejected");
  }

  // 5. No claim that AAPLx itself crosses chains — engine or Watch.
  const aaplx = await resolveAssetActions("aaplx-on-solana", "Solana");
  for (const action of aaplx) {
    assert.ok(!/stellar/i.test(`${action.title} ${action.description}`), `exit stays Solana-side: ${action.kind}`);
  }
  const borrow = await resolveAssetActions("aaplc-on-base", "Base");
  assert.ok(!borrow.some((a) => a.kind === "move"), "no fake cross-chain move on AAPLc");

  // 6. Partial completion stays truthful: no return path invents custody.
  // (Behavioral proof: every return route is non-executable, so a completed
  // exit can only ever mean Solana-side USDC ownership.)
  assert.ok(routes.every((r) => !r.executable), "completed exits imply Solana USDC, nothing more");

  // 7. Watch Center keeps the partial-completion truth on exit receipts.
  const watchText = readFileSync(join(__dirname, "..", "src", "lib", "watch-center", "service.ts"), "utf8");
  assert.ok(watchText.includes("Return to Stellar is not available yet"), "exit receipts state the boundary");

  console.log("return-stellar:verified — GATED with documented reasons");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
