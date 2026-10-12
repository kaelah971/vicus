import "server-only";

/**
 * Vicus Asset Access Router V1 — Stellar USDC → Base tokenized stock.
 *
 * Source-verified configuration (October 2026):
 * - Target: AAPLc contract 0xb200000000000000000000C2e324d24d7eEcd1fb,
 *   corroborated by Ophis (built from Base docs), KyberSwap, TwentyPad,
 *   tokenized.so, and Binance Wallet; live onchain (decimals 8, symbol
 *   AAPLc read directly from Base Mainnet). Program: base.org/stocks
 *   (Coinbase-issued B20, 1:1 custody, eligible non-US only).
 * - Base canonical USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, from
 *   Circle's official multi-chain page (verified live onchain).
 * - Venue: Aerodrome V2 Router 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
 *   + PoolFactory 0x420DD381b31aEf6683db6B902084cB0FFECe40Da, from the
 *   official aerodrome-finance/contracts README deployment table; swap
 *   interface read from the repo's Router.sol/IRouter.sol.
 *
 * EXECUTION REALITY (verified live against Base Mainnet, Oct 2026):
 * - The Aerodrome V2 USDC/AAPLc pool
 *   (0x6b74fc52dd84beb8d2d1be16732749dee70c45e7) exists but holds dust
 *   (~$0.005) — live quotes revert. No Slipstream CL pool exists at any
 *   standard tick spacing. No WETH/AAPLc V2 pool exists.
 * - Vicus Access CCTP is TESTNET ONLY, so no Mainnet Base USDC can be
 *   funded through Vicus today.
 * Consequence: acquisition execution stays DISABLED with explicit reasons
 * (ACQUISITION_ENABLED = false). Quotes remain REAL (live onchain reads);
 * nothing is invented. Flip only with fresh liquidity + reviewed Mainnet
 * CCTP in a later slice — never an env flag.
 */

export const ROUTER_SOURCE_NETWORK = "stellar_testnet" as const;
export const ROUTER_SOURCE_ASSET = "USDC" as const;
export const ROUTER_DESTINATION_NETWORK = "base" as const;
export const ROUTER_BASE_CHAIN_ID = 8453;

export const ROUTER_BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const ROUTER_BASE_USDC_DECIMALS = 6;

export const ROUTER_VENUE = "aerodrome" as const;
export const ROUTER_VENUE_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
export const ROUTER_VENUE_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
export const ROUTER_VENUE_POOL = "0x6b74fc52dd84beb8d2d1be16732749dee70c45e7";
export const ROUTER_BASE_RPC_URL = "https://base.publicnode.com";
export const ROUTER_BASE_EXPLORER_TX = "https://basescan.org/tx/";

/** Production acquisition stays off until liquidity + Mainnet CCTP exist. */
export const ACQUISITION_ENABLED = false as const;

export const ACQUISITION_DISABLED_REASONS = [
  "No executable USDC → AAPLc liquidity on the verified venue right now.",
  "Vicus Access CCTP is Testnet-only, so Mainnet Base USDC cannot be funded through Vicus yet.",
] as const;

export type RouterTargetAsset = {
  slug: string;
  code: string;
  label: string;
  assetClass: string;
  issuer: string;
  network: string;
  ecosystem: string;
  /** Exact officially verified contract. Only this address ever executes. */
  contractAddress: string;
  decimals: number;
  officialUrl: string;
  verificationSourceUrl: string;
  representation: string;
  eligibilityNote: string;
  executable: boolean;
  unavailableReason: string | null;
};

export const ROUTER_TARGET_ASSET: RouterTargetAsset = {
  slug: "aaplc-on-base",
  code: "AAPLc",
  label: "AAPLc",
  assetClass: "equity_fund",
  issuer: "Coinbase",
  network: "Base",
  ecosystem: "base",
  contractAddress: "0xb200000000000000000000C2e324d24d7eEcd1fb",
  decimals: 8,
  officialUrl: "https://www.base.org/stocks",
  verificationSourceUrl: "https://www.base.org/stocks",
  representation:
    "A B20 token issued by Coinbase representing a beneficial claim on a real Apple share held in regulated, bankruptcy-remote custody.",
  eligibilityNote:
    "Available only to persons in eligible jurisdictions outside the US. Vicus performs no eligibility verification — confirm you are eligible under the issuer and venue terms before proceeding.",
  executable: false,
  unavailableReason:
    "Acquisition is not executable yet: the verified venue pool has no real liquidity and Vicus cannot fund Mainnet Base USDC today.",
};

export const ROUTER_ELIGIBILITY_COPY =
  "Coinbase tokenized stocks are available only to persons in eligible jurisdictions outside the US. By continuing you confirm you are eligible under the issuer and venue terms.";
