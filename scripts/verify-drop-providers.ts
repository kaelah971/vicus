import { strict as assert } from "node:assert";
import {
  authorizeAssetDrop,
  DROP_REJECTION_COPY,
  PROVIDER_ALLOWLIST,
  type AuthorizedProvider,
} from "../src/lib/drops/providers";
import { CAMPAIGN_REWARD_ISSUER } from "../src/lib/campaigns/config";

/**
 * P6.4 provider-allowlist tests. Fixtures prove POLICY behavior only —
 * they can never establish a real approved provider. Existing XLM and
 * Testnet-USDC settlement paths are regression-covered by drops:verify
 * (both now flow through the gate).
 */

const NOW = Date.parse("2026-10-17T00:00:00.000Z");
const FUTURE = "2027-10-17T00:00:00.000Z";
const PAST = "2026-10-01T00:00:00.000Z";

const BENJI = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";

function fixtureProvider(overrides: Partial<AuthorizedProvider> = {}): AuthorizedProvider {
  return {
    id: "fixture Franklin distribution",
    name: "Fixture Distributor",
    sourceUrl: "https://example.com/fixture-provider",
    assetCode: "BENJI",
    assetIssuer: BENJI,
    network: "stellar_mainnet",
    operation: "promotional-distribution",
    eligibility: "KYC holders in eligible jurisdictions",
    expiresAt: FUTURE,
    evidenceRef: "fixture-agreement-001",
    status: "active",
    ...overrides,
  };
}

async function main() {
  // 1. Production allowlist is empty — no approved provider exists.
  assert.equal(PROVIDER_ALLOWLIST.length, 0, "zero connected providers (truthful)");

  // 2. Existing flows pass the gate unchanged.
  assert.deepEqual(
    authorizeAssetDrop({ assetCode: "XLM", assetIssuer: null, network: "testnet" }, [], NOW),
    { ok: true, assetClass: "native_xlm", provider: null },
    "XLM testnet rewards unaffected",
  );
  assert.deepEqual(
    authorizeAssetDrop({ assetCode: "XLM", assetIssuer: null, network: "public" }, [], NOW),
    { ok: true, assetClass: "native_xlm", provider: null },
    "XLM class holds on either network (Mainnet flag still governs separately)",
  );
  assert.deepEqual(
    authorizeAssetDrop({ assetCode: "USDC", assetIssuer: CAMPAIGN_REWARD_ISSUER, network: "stellar_testnet" }, [], NOW),
    { ok: true, assetClass: "testnet_usdc", provider: null },
    "pinned Testnet USDC campaigns unaffected",
  );

  // 3. Restricted assets fail closed with no provider.
  for (const request of [
    { assetCode: "BENJI", assetIssuer: BENJI, network: "stellar_mainnet" },
    { assetCode: "AAPLx", assetIssuer: "Backed", network: "solana" },
    { assetCode: "AAPLc", assetIssuer: "Coinbase", network: "base" },
    { assetCode: "USDC", assetIssuer: CAMPAIGN_REWARD_ISSUER, network: "stellar_mainnet" },
  ]) {
    const verdict = authorizeAssetDrop({ ...request, recipientEligibility: "eligible" }, [], NOW);
    assert.equal(verdict.ok, false, `${request.assetCode}/${request.network} rejected`);
    assert.equal(
      (verdict as { reason: string }).reason,
      "provider-not-allowlisted",
      `${request.assetCode}: explicit reason, never silent`,
    );
  }

  // 4. Fixture approval passes only when EVERYTHING matches.
  const good = authorizeAssetDrop(
    { assetCode: "BENJI", assetIssuer: BENJI, network: "stellar_mainnet", providerId: "fixture Franklin distribution", recipientEligibility: "eligible" },
    [fixtureProvider()],
    NOW,
  );
  assert.equal(good.ok, true, "fully-evidenced fixture passes policy");
  assert.equal((good as { provider: AuthorizedProvider }).provider.id, "fixture Franklin distribution", "provider pinned");

  // 5. Forged / mismatched / stale approvals rejected with exact reasons.
  const cases: Array<[string, Partial<AuthorizedProvider>, Record<string, string>, string]> = [
    ["forged provider id", {}, { providerId: "backed-official-real" }, "provider-not-allowlisted"],
    ["wrong issuer", { assetIssuer: "GFAKE" }, {}, "issuer-mismatch"],
    ["wrong asset", { assetCode: "WTGXX" }, {}, "asset-mismatch"],
    ["wrong network", { network: "stellar_testnet" }, {}, "network-mismatch"],
    ["expired approval", { expiresAt: PAST }, {}, "approval-expired"],
    ["revoked provider", { status: "revoked" }, {}, "provider-revoked"],
    ["empty evidence", { evidenceRef: "  " }, {}, "evidence-invalid"],
    ["ineligible recipient", {}, { recipientEligibility: "ineligible" }, "recipient-ineligible"],
    ["unknown recipient", {}, {}, "recipient-unknown"],
  ];
  for (const [label, providerPatch, requestPatch, reason] of cases) {
    const provider = fixtureProvider(providerPatch);
    const verdict = authorizeAssetDrop(
      {
        assetCode: "BENJI", assetIssuer: BENJI, network: "stellar_mainnet",
        providerId: "fixture Franklin distribution", ...requestPatch,
      } as never,
      [provider],
      NOW,
    );
    assert.equal(verdict.ok, false, `${label}: rejected`);
    assert.equal((verdict as { reason: string }).reason, reason, `${label}: exact reason ${reason}`);
  }

  // 6. No env flag, form input, or client claim can authorize.
  process.env.VICUS_FAKE_PROVIDER = "true";
  process.env.VICUS_ENABLE_STOCK_DROPS = "true";
  const spoofed = authorizeAssetDrop(
    { assetCode: "AAPLx", assetIssuer: "Backed", network: "solana", providerId: "env-authorized", recipientEligibility: "eligible" },
    [],
    NOW,
  );
  assert.equal(spoofed.ok, false, "env flags authorize nothing");
  delete process.env.VICUS_FAKE_PROVIDER;
  delete process.env.VICUS_ENABLE_STOCK_DROPS;

  // 7. Every rejection reason has user-facing copy (supported states stay understandable).
  for (const reason of [
    "provider-not-allowlisted", "approval-missing", "approval-expired", "provider-revoked",
    "asset-mismatch", "issuer-mismatch", "network-mismatch",
    "recipient-ineligible", "recipient-unknown", "evidence-invalid",
  ] as const) {
    assert.ok(DROP_REJECTION_COPY[reason]?.length > 10, `copy for ${reason}`);
  }

  console.log("drop-providers:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
