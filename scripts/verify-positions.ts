import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { resolveAssetActions } from "../src/lib/asset-actions/service";
import {
  PositionsError,
  getBasePositions,
  getSolanaPositions,
  getStellarPositions,
} from "../src/lib/positions/service";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(__dirname, "..");
const WALLET = `G${"A".repeat(55)}`;
const SOL = "7vL4zK9mQp2xRn8wYt5uHj3sDf6aGbVcXz1qWe4rT7";
const EVM = "0x1111111111111111111111111111111111111111";

const BENJI_ISSUER = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

function mockHorizon(balances: { assetCode: string | null; assetIssuer: string | null; balance: string }[]) {
  return {
    async getAccount() {
      return { sequence: "1", balances: balances.map((b) => ({ ...b, isAuthorized: true })) };
    },
  };
}

async function main() {
  // 1. Wallet validation is strict on every network.
  await assert.rejects(getStellarPositions("nope"), (e: unknown) => e instanceof PositionsError);
  await assert.rejects(getSolanaPositions("nope"), (e: unknown) => e instanceof PositionsError);
  await assert.rejects(getBasePositions("nope"), (e: unknown) => e instanceof PositionsError);

  // 2. Stellar exact matching: positive BENJI held; zero trustline ignored;
  // wrong-issuer lookalike ignored; native XLM ignored; unknown token ignored.
  const stellar = await getStellarPositions(
    WALLET,
    mockHorizon([
      { assetCode: "BENJI", assetIssuer: BENJI_ISSUER, balance: "12.5000000" },
      { assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "0.0000000" },
      { assetCode: "BENJI", assetIssuer: `G${"Z".repeat(55)}`.replace(/Z/g, "7"), balance: "99.0000000" },
      { assetCode: null, assetIssuer: null, balance: "50.0000000" },
      { assetCode: "SCAM", assetIssuer: BENJI_ISSUER, balance: "100.0000000" },
    ]),
  );
  assert.equal(stellar.positions.length, 1, "exactly one real holding");
  assert.equal(stellar.positions[0]!.code, "BENJI");
  assert.equal(stellar.positions[0]!.balance, "12.5000000", "exact decimal string, no float math");
  assert.equal(stellar.positions[0]!.walletSource, "vicus-stellar");
  assert.equal(stellar.partial, false);

  // 3. No inference: the reader only touches Horizon + the asset registry.
  const serviceText = readFileSync(join(ROOT, "src/lib/positions/service.ts"), "utf8");
  assert.ok(!/watchCircle|listWatched|externalUtilityOrders|assetTransfers|crosschainTransfers|missionSubmissions/.test(serviceText), "no history/watch imports");
  assert.ok(!serviceText.includes(".insert(") && !serviceText.includes(".values("), "no balance persistence");

  // 4. Outage is truthful, never a fake zero.
  await assert.rejects(
    getStellarPositions(WALLET, { async getAccount() { throw new Error("down"); } }),
    (e: unknown) => e instanceof PositionsError && (e as PositionsError).code === "unavailable",
  );
  const missing = await getStellarPositions(WALLET, { async getAccount() { return null; } });
  assert.equal(missing.positions.length, 0, "unknown account reads as empty");

  // 5. Solana known-mint matching; wrong/zero mints excluded.
  const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
  const solana = await getSolanaPositions(SOL, {
    async getTokenBalanceSubunits(_owner: string, mint: string) {
      if (mint === AAPLX) return "7317016";
      return "0";
    },
  });
  assert.equal(solana.positions.length, 1, "only the positive known mint");
  assert.equal(solana.positions[0]!.code, "AAPLx");
  assert.equal(solana.positions[0]!.balance, "0.07317016", "exact 8-decimal formatting");
  assert.equal(solana.positions[0]!.walletSource, "connected-solana");
  assert.equal(solana.partial, false);
  const solanaPartial = await getSolanaPositions(SOL, {
    async getTokenBalanceSubunits() {
      return null;
    },
  });
  assert.equal(solanaPartial.positions.length, 0);
  assert.equal(solanaPartial.partial, true, "failed reads flag partial");

  // 6. Base exact-contract matching with uint256 decoding.
  const AAPLC = "0xb200000000000000000000C2e324d24d7eEcd1fb";
  const base = await getBasePositions(EVM, {
    async ethCall(to: string) {
      if (to.toLowerCase() === AAPLC.toLowerCase()) return `0x${BigInt("150000000").toString(16)}`;
      return "0x0";
    },
  });
  assert.equal(base.positions.length, 1, "only the positive known contract");
  assert.equal(base.positions[0]!.code, "AAPLc");
  assert.equal(base.positions[0]!.balance, "1.50000000", "exact 8-decimal formatting");
  assert.equal(base.positions[0]!.walletSource, "connected-base");

  // 7. Action Engine parity on every position.
  for (const position of [...stellar.positions, ...solana.positions, ...base.positions]) {
    const engine = await resolveAssetActions(position.assetSlug, position.network);
    assert.deepEqual(
      position.actions.map((a) => a.kind),
      engine.map((a) => a.kind),
      `${position.assetSlug}: engine parity`,
    );
  }

  // 8. No fabrication anywhere in the payload.
  const payload = JSON.stringify({ stellar, solana, base });
  assert.ok(!/price|pnl|profit|health|liquidation|collateral|debt|apy|yield/i.test(payload), "no financial fabrication");
  assert.ok(!payload.includes(WALLET) && !payload.includes(SOL) && !payload.includes(EVM), "no wallet leakage in results");

  // 9. Deterministic ordering across repeat reads.
  const repeat = await getStellarPositions(
    WALLET,
    mockHorizon([
      { assetCode: "BENJI", assetIssuer: BENJI_ISSUER, balance: "1.0000000" },
      { assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "2.0000000" },
    ]),
  );
  assert.deepEqual(repeat.positions.map((p) => p.code), ["BENJI", "USDC"], "sorted by code");
  const repeat2 = await getStellarPositions(
    WALLET,
    mockHorizon([
      { assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "2.0000000" },
      { assetCode: "BENJI", assetIssuer: BENJI_ISSUER, balance: "1.0000000" },
    ]),
  );
  assert.deepEqual(repeat2, repeat, "order-independent");

  // 10. Routes: auth-gated, session-owned wallets, no public surface.
  for (const file of ["src/app/api/positions/stellar/route.ts", "src/app/api/positions/solana/route.ts", "src/app/api/positions/base/route.ts", "src/app/positions/page.tsx"]) {
    assert.ok(existsSync(join(ROOT, file)), `${file} exists`);
  }
  const stellarRoute = readFileSync(join(ROOT, "src/app/api/positions/stellar/route.ts"), "utf8");
  assert.ok(stellarRoute.includes("session.wallet.publicKey"), "stellar reads the session wallet");
  const page = readFileSync(join(ROOT, "src/app/positions/page.tsx"), "utf8");
  assert.ok(page.includes("session.wallet.publicKey"), "page reads the session wallet");

  console.log("positions:verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
