import "server-only";

/**
 * Lending V1 — ONE verified market. AAPLc (Coinbase tokenized Apple stock)
 * on Base posted as collateral to borrow USDC on Morpho Blue.
 *
 * Source-verified (October 2026):
 * - Market 0x26d61964fa3ab7dbaf904661c1c20de82a96ade9c4702a3f7346f15d0b55edf2
 *   on Base Morpho Blue (0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb, owner()
 *   reads live), found via the public Morpho GraphQL API filtering on the
 *   exact AAPLc contract: LLTV 62.5%, USDC loan asset, live liquidity and
 *   low utilization at discovery. Oracle 0x66B97bad8053BA427316a4a3CDbB7Fe7A852ABA0,
 *   IRM 0x46415998764C29aB2a25CbeA6254146D50D22687 (AdaptiveCurveIrm family).
 * - Collateral AAPLc 0xb200000000000000000000C2e324d24d7eEcd1fb (matches the
 *   Vicus AAPLc registry, read live: symbol NVDAc... AAPLc, decimals 8).
 * - Loan asset canonical Base USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.
 *
 * Execution mode is CONNECTED: Vicus reads live market state, exposes the
 * exact Borrow/Collateralize route, and links the exact Morpho market flow.
 * Vicus does not build, sign, or submit Morpho transactions.
 */

export const LENDING_PROTOCOL = "Morpho Blue" as const;
export const LENDING_CHAIN = "Base" as const;
export const LENDING_CHAIN_ID = 8453;
export const LENDING_MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
export const LENDING_MARKET_ID =
  "0x26d61964fa3ab7dbaf904661c1c20de82a96ade9c4702a3f7346f15d0b55edf2";
export const LENDING_LTV_BPS = 6250;
export const LENDING_ORACLE = "0x66B97bad8053BA427316a4a3CDbB7Fe7A852ABA0";
export const LENDING_IRM = "0x46415998764C29aB2a25CbeA6254146D50D22687";

export const LENDING_COLLATERAL_SLUG = "aaplc-on-base" as const;
export const LENDING_COLLATERAL_CODE = "AAPLc" as const;
export const LENDING_COLLATERAL_CONTRACT = "0xb200000000000000000000C2e324d24d7eEcd1fb";
export const LENDING_COLLATERAL_DECIMALS = 8;

export const LENDING_LOAN_CODE = "USDC" as const;
export const LENDING_LOAN_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LENDING_LOAN_DECIMALS = 6;

export const LENDING_MARKET_URL = `https://app.morpho.org/base/market/${LENDING_MARKET_ID}`;
export const LENDING_DOCS_URL = "https://docs.morpho.org/";
export const MORPHO_API_URL = "https://api.morpho.org/graphql";
