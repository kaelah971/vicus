import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import {
  LENDING_CHAIN,
  LENDING_COLLATERAL_CODE,
  LENDING_COLLATERAL_CONTRACT,
  LENDING_COLLATERAL_SLUG,
  LENDING_LOAN_CODE,
  LENDING_LOAN_CONTRACT,
  LENDING_LTV_BPS,
  LENDING_MARKET_ID,
  LENDING_MORPHO,
  LENDING_PROTOCOL,
} from "../src/lib/lending/config";
import {
  getLendingMarketState,
  getLendingPosition,
} from "../src/lib/lending/service";
import { getBasePositions } from "../src/lib/positions/service";

config({ path: ".env.local" });
config({ path: ".env" });

// Pinned deployment facts (verified live, October 2026).
const EXPECTED_MARKET = {
  marketId: "0x26d61964fa3ab7dbaf904661c1c20de82a96ade9c4702a3f7346f15d0b55edf2",
  morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  loan: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

function mockMarket(overrides: Record<string, unknown> = {}) {
  return async () => ({
    data: {
      markets: {
        items: [
          {
            marketId: EXPECTED_MARKET.marketId,
            lltv: "625000000000000000",
            chain: { id: 8453 },
            morphoBlue: { address: EXPECTED_MARKET.morpho },
            oracle: { address: "0x66B97bad8053BA427316a4a3CDbB7Fe7A852ABA0" },
            irmAddress: "0x46415998764C29aB2a25CbeA6254146D50D22687",
            loanAsset: { address: EXPECTED_MARKET.loan },
            collateralAsset: { address: LENDING_COLLATERAL_CONTRACT },
            state: { liquidityAssets: 486, liquidityAssetsUsd: 486.86, borrowAssets: 15, borrowAssetsUsd: 15.0, utilization: 0.03 },
            ...overrides,
          },
        ],
      },
    },
  });
}

function mockPosition(collateral: string | null, borrowAssets: string | null, healthFactor: number | null = 1.85) {
  return async () => ({
    data: {
      marketPositions: {
        items:
          collateral === null
            ? []
            : [{ healthFactor, state: { collateral, borrowAssets } }],
      },
    },
  });
}

async function main() {
  // 1. Config pins the exact verified deployment.
  assert.equal(LENDING_COLLATERAL_SLUG, "aaplc-on-base");
  assert.equal(LENDING_COLLATERAL_CODE, "AAPLc");
  assert.equal(LENDING_COLLATERAL_CONTRACT, "0xb200000000000000000000C2e324d24d7eEcd1fb");
  assert.equal(LENDING_LOAN_CODE, "USDC");
  assert.equal(LENDING_LOAN_CONTRACT, EXPECTED_MARKET.loan);
  assert.equal(LENDING_MARKET_ID, EXPECTED_MARKET.marketId);
  assert.equal(LENDING_MORPHO, EXPECTED_MARKET.morpho);
  assert.equal(LENDING_PROTOCOL, "Morpho Blue");
  assert.equal(LENDING_CHAIN, "Base");
  assert.equal(LENDING_LTV_BPS, 6250);

  // 2. Market state reads the deployment; morpho/oracle mismatch refuses.
  const state = await getLendingMarketState(mockMarket());
  assert.ok(state, "market state resolves");
  assert.equal(state!.marketId, EXPECTED_MARKET.marketId);
  assert.equal(state!.ltvBps, 6250);
  assert.equal(state!.loanCode, "USDC");
  assert.equal(state!.liquidityAssetsUsd, 486.86, "live liquidity flows through");
  assert.ok(state!.marketUrl.includes(EXPECTED_MARKET.marketId), "exact market link");
  assert.equal(await getLendingMarketState(mockMarket({ morphoBlue: { address: "0x0000000000000000000000000000000000000001" } })), null, "wrong morpho refused");
  assert.equal(await getLendingMarketState(async () => null), null, "outage reads as null");
  await assert.rejects(getLendingPosition("nope"), "bad wallet rejected");

  // 3. Positions come only from protocol state — never invented.
  const held = await getLendingPosition("0x1111111111111111111111111111111111111111", mockPosition("25000000", "10000000"));
  assert.ok(held, "position resolves");
  assert.equal(held!.collateralDisplay, "0.25000000", "exact 8-decimal collateral");
  assert.equal(held!.borrowAssetsDisplay, "10.000000", "exact 6-decimal debt");
  assert.equal(held!.healthFactor, 1.85, "protocol health flows through");
  assert.equal(await getLendingPosition("0x1111111111111111111111111111111111111111", mockPosition(null, null)), null, "no position reads as null");
  assert.equal(await getLendingPosition("0x1111111111111111111111111111111111111111", mockPosition("0", "0")), null, "empty reads as null");

  // 4. Engine parity: borrow on the winner only, nowhere else.
  const aaplc = await resolveAssetActions("aaplc-on-base", "Base");
  const borrow = aaplc.find((a) => a.kind === "borrow");
  assert.ok(borrow, "AAPLc borrow resolves");
  assert.equal(borrow!.executionMode, "connected", "connected mode, honestly");
  assert.equal(borrow!.state, "available");
  assert.ok(borrow!.href.includes(EXPECTED_MARKET.marketId), "exact market route");
  for (const slug of ["nvdac-on-base", "aaplx-on-solana", "tslax-on-solana", "benji-on-stellar"]) {
    const actions = await resolveAssetActions(slug, "test");
    assert.ok(!actions.some((a) => a.kind === "borrow" || a.kind === "collateral"), `${slug}: no inherited lending`);
  }

  // 5. Position Center attaches protocol state only for the winner.
  const EVM = "0x2222222222222222222222222222222222222222";
  const AAPLC = "0xb200000000000000000000C2e324d24d7eEcd1fb";
  const withLending = await getBasePositions(
    EVM,
    {
      async ethCall(to: string) {
        if (to.toLowerCase() === AAPLC.toLowerCase()) return `0x${BigInt("100000000").toString(16)}`;
        return "0x0";
      },
    },
    mockPosition("50000000", "2000000", 2.1),
  );
  const aaplcPosition = withLending.positions.find((p) => p.assetSlug === "aaplc-on-base");
  assert.ok(aaplcPosition?.lendingPosition, "protocol state attached");
  assert.equal(aaplcPosition!.lendingPosition!.borrowedDisplay, "2.000000");
  assert.equal(aaplcPosition!.lendingPosition!.healthFactor, 2.1);
  const withoutLending = await getBasePositions(
    EVM,
    {
      async ethCall(to: string) {
        if (to.toLowerCase() === AAPLC.toLowerCase()) return `0x${BigInt("100000000").toString(16)}`;
        return "0x0";
      },
    },
    mockPosition(null, null),
  );
  assert.ok(!withoutLending.positions.find((p) => p.assetSlug === "aaplc-on-base")?.lendingPosition, "unreadable protocol state omitted, never zero-debt");

  // 6. No fabrication surface: no APY, no invented risk, no execution.
  const serviceText = (await import("node:fs")).readFileSync("src/lib/lending/service.ts", "utf8");
  assert.ok(!/apy|projected|guaranteed|signTransaction|prepareBorrow|submit/i.test(serviceText), "no yield claims, no execution");
  assert.ok(!/privateKey|seed/i.test(serviceText), "no secrets");

  console.log("lending:verified — AAPLc × Morpho Blue Base");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
