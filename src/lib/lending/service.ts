import "server-only";
import {
  LENDING_CHAIN,
  LENDING_CHAIN_ID,
  LENDING_COLLATERAL_CODE,
  LENDING_COLLATERAL_CONTRACT,
  LENDING_COLLATERAL_DECIMALS,
  LENDING_COLLATERAL_SLUG,
  LENDING_IRM,
  LENDING_LOAN_CODE,
  LENDING_LOAN_CONTRACT,
  LENDING_LOAN_DECIMALS,
  LENDING_LTV_BPS,
  LENDING_MARKET_ID,
  LENDING_MARKET_URL,
  LENDING_MORPHO,
  LENDING_ORACLE,
  LENDING_PROTOCOL,
  MORPHO_API_URL,
} from "@/lib/lending/config";

/**
 * Lending V1 service — live reads over ONE pinned Morpho market.
 * No execution, no calldata, no signing: Vicus reads market state and the
 * borrower's position, then routes the user to the exact protocol flow.
 * The Morpho deployment is the source of truth for every number returned.
 */

export type LendingMarketState = {
  protocol: string;
  chain: string;
  marketId: string;
  morpho: string;
  collateralCode: string;
  collateralContract: string;
  loanCode: string;
  loanContract: string;
  ltvBps: number;
  oracle: string;
  irm: string;
  liquidityAssets: string | null;
  liquidityAssetsUsd: number | null;
  borrowAssets: string | null;
  borrowAssetsUsd: number | null;
  utilization: number | null;
  marketUrl: string;
};

export type LendingPositionState = {
  collateralRaw: string;
  collateralDisplay: string;
  borrowAssetsRaw: string;
  borrowAssetsDisplay: string;
  /** Protocol-reported health factor — present only when Morpho reports it. */
  healthFactor: number | null;
};

export class LendingError extends Error {
  constructor(
    public readonly code: "invalid-request" | "unavailable" | "unsupported-asset",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export type MorphoFetch = (query: string) => Promise<unknown>;

async function defaultMorphoFetch(query: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(MORPHO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => null)) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function formatUnits(raw: string, decimals: number): string | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  try {
    const value = BigInt(raw.trim());
    if (value < BigInt(0)) return null;
    const base = BigInt(10) ** BigInt(decimals);
    return `${(value / base).toString()}.${(value % base).toString().padStart(decimals, "0")}`;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Live state for the pinned market. Null when the deployment cannot be read. */
export async function getLendingMarketState(fetch?: MorphoFetch): Promise<LendingMarketState | null> {
  const run = fetch ?? defaultMorphoFetch;
  let payload: unknown;
  try {
    payload = await run(
      `{ markets(where:{collateralAssetAddress_in:["${LENDING_COLLATERAL_CONTRACT}"]}) { items { marketId lltv chain { id } morphoBlue { address } oracle { address } irmAddress loanAsset { address } collateralAsset { address } state { liquidityAssets liquidityAssetsUsd borrowAssets borrowAssetsUsd utilization } } } }`,
    );
  } catch {
    return null;
  }
  const items = asRecord(asRecord(payload)?.data)?.markets;
  const list = Array.isArray(asRecord(items)?.items) ? (asRecord(items)!.items as unknown[]) : [];
  const row = list.map(asRecord).find((entry) => {
    const chainId = asRecord(asRecord(entry)?.chain)?.id;
    return entry?.marketId === LENDING_MARKET_ID && (chainId === LENDING_CHAIN_ID || chainId === String(LENDING_CHAIN_ID));
  });
  if (!row) return null;
  const state = asRecord(row.state) ?? {};
  const morpho = asRecord(row.morphoBlue)?.address;
  const oracle = asRecord(row.oracle)?.address;
  if (morpho !== LENDING_MORPHO || oracle !== LENDING_ORACLE) return null;
  return {
    protocol: LENDING_PROTOCOL,
    chain: LENDING_CHAIN,
    marketId: LENDING_MARKET_ID,
    morpho: LENDING_MORPHO,
    collateralCode: LENDING_COLLATERAL_CODE,
    collateralContract: LENDING_COLLATERAL_CONTRACT,
    loanCode: LENDING_LOAN_CODE,
    loanContract: LENDING_LOAN_CONTRACT,
    ltvBps: LENDING_LTV_BPS,
    oracle: LENDING_ORACLE,
    irm: typeof row.irmAddress === "string" ? row.irmAddress : LENDING_IRM,
    liquidityAssets: typeof state.liquidityAssets === "number" ? String(state.liquidityAssets) : null,
    liquidityAssetsUsd: typeof state.liquidityAssetsUsd === "number" ? state.liquidityAssetsUsd : null,
    borrowAssets: typeof state.borrowAssets === "number" ? String(state.borrowAssets) : null,
    borrowAssetsUsd: typeof state.borrowAssetsUsd === "number" ? state.borrowAssetsUsd : null,
    utilization: typeof state.utilization === "number" ? state.utilization : null,
    marketUrl: LENDING_MARKET_URL,
  };
}

/**
 * Borrower position in the pinned market. Null when the wallet holds no
 * position there (or the read fails) — never a fabricated zero-debt claim.
 */
export async function getLendingPosition(
  borrower: string,
  fetch?: MorphoFetch,
): Promise<LendingPositionState | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(borrower.trim())) {
    throw new LendingError("invalid-request", "That wallet address is not valid.", 400);
  }
  const run = fetch ?? defaultMorphoFetch;
  let payload: unknown;
  try {
    payload = await run(
      `{ marketPositions(where:{marketUniqueKey_in:["${LENDING_MARKET_ID}"], chainId_in:[${LENDING_CHAIN_ID}], userAddress_in:["${borrower.trim().toLowerCase()}"]}, first: 1) { items { healthFactor state { collateral borrowAssets } } } }`,
    );
  } catch {
    return null;
  }
  const items = asRecord(asRecord(payload)?.data)?.marketPositions;
  const list = Array.isArray(asRecord(items)?.items) ? (asRecord(items)!.items as unknown[]) : [];
  const row = asRecord(list[0]);
  const state = asRecord(row?.state);
  const collateral = state?.collateral === null || state?.collateral === undefined ? null : String(state.collateral);
  const borrowAssets = state?.borrowAssets === null || state?.borrowAssets === undefined ? null : String(state.borrowAssets);
  if (!collateral || !borrowAssets) return null;
  const collateralDisplay = formatUnits(collateral, LENDING_COLLATERAL_DECIMALS);
  const borrowDisplay = formatUnits(borrowAssets, LENDING_LOAN_DECIMALS);
  if (!collateralDisplay || !borrowDisplay) return null;
  if (collateralDisplay.startsWith("0.") && borrowDisplay.startsWith("0.")) return null;
  return {
    collateralRaw: collateral,
    collateralDisplay,
    borrowAssetsRaw: borrowAssets,
    borrowAssetsDisplay: borrowDisplay,
    healthFactor: typeof row?.healthFactor === "number" ? row.healthFactor : null,
  };
}

export { LENDING_COLLATERAL_SLUG };
