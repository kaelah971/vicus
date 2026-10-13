import "server-only";

/**
 * External Non-Stablecoin Utility V1 — AAPLx (Apple xStock by Backed) on Solana.
 *
 * Source-verified configuration (October 2026):
 * - Asset: AAPLx Solana mint XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp,
 *   found via Jupiter's curated token search (Backed metadata domain,
 *   36,221 holders, ~$52.6M mcap, ~$637K liquidity) and cross-checked
 *   live against Solana Mainnet (Token-2022 owner, 8 decimals, matching
 *   mint/freeze authorities). Look-alike AAPLX mints with ~$15 liquidity
 *   exist — only the exact mint below ever executes.
 * - Issuer/program: xStocks by Backed — permissionless transfers, 1:1
 *   backing, self-custody, non-US only (docs.xstocks.fi/docs).
 * - Venue: Jupiter routing on Solana (docs.jup.ag tokenized-stocks: xStocks
 *   trade on Jupiter Spot like any Solana token). Live 25-USDC quote
 *   verified (0.073 AAPLx, 0% impact) plus keyless swap-transaction build.
 * - Source: canonical Solana USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 *   (6 decimals, confirmed via the same Jupiter search).
 *
 * Funding honesty: the swap spends Solana USDC from the user's connected
 * Solana wallet. Vicus makes NO Stellar→Solana bridge claim (Access Solana
 * stays preview-only). Slippage is server-owned (50 bps); quotes older than
 * 60 seconds must refresh before preparing.
 */

export const SWAP_TARGET_SLUG = "aaplx-on-solana" as const;
export const SWAP_ACTION_KIND = "swap" as const;
export const SWAP_VENUE = "jupiter" as const;
export const SWAP_NETWORK = "solana" as const;

export const SWAP_TARGET_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
export const SWAP_TARGET_CODE = "AAPLx";
export const SWAP_TARGET_DECIMALS = 8;
export const SWAP_TARGET_ISSUER = "Backed (xStocks)";

export const SWAP_SOURCE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SWAP_SOURCE_CODE = "USDC";
export const SWAP_SOURCE_DECIMALS = 6;

export const SWAP_SLIPPAGE_BPS = 50;
export const SWAP_QUOTE_TTL_MS = 60_000;

export const JUPITER_LITE_BASE = "https://lite-api.jup.ag";
export const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
export const SOLANA_EXPLORER_TX = "https://explorer.solana.com/tx/";

export const SWAP_OFFICIAL_URL = "https://xstocks.fi/";
export const SWAP_DOCS_URL = "https://docs.xstocks.fi/docs";
export const SWAP_VENUE_URL = "https://jup.ag/";

export const SWAP_ELIGIBILITY_COPY =
  "xStocks are not available in the United States, to US persons, or in other restricted jurisdictions. By continuing you confirm you are eligible under the issuer and venue terms. Vicus does not verify eligibility.";

/**
 * Broader Access V1 — TSLAx (Tesla xStock by Backed) on Solana.
 * Source-verified (October 2026): mint XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB
 * via Jupiter's curated token search (exact symbol TSLAx, "Tesla xStock",
 * 8 decimals, Backed metadata domain, Token-2022 program, ~229k supply)
 * with pump/meme look-alikes excluded; live 25-USDC quote verified
 * (0.066 TSLAx, ~0% impact) the same day. Same issuer, venue, slippage,
 * and eligibility policy as AAPLx — one shared adapter, config-driven.
 */
export const TSLAX_SLUG = "tslax-on-solana" as const;
export const TSLAX_MINT = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
export const TSLAX_CODE = "TSLAx";
export const TSLAX_DECIMALS = 8;
export const TSLAX_ISSUER = "Backed (xStocks)";

/**
 * Exit V1 — reverse executable route: AAPLx → Jupiter → Solana USDC.
 * Same verified mints, venue, slippage, and TTL as the entry swap;
 * only the direction flips. Server owns mints; wallet signs; server
 * verifies token deltas. Finishes at "Exited to Solana USDC" — no
 * Return-to-Stellar claim.
 */
export const EXIT_ACTION_KIND = "exit" as const;
export const EXIT_SOURCE_MINT = SWAP_TARGET_MINT;
export const EXIT_SOURCE_CODE = SWAP_TARGET_CODE;
export const EXIT_SOURCE_DECIMALS = SWAP_TARGET_DECIMALS;
export const EXIT_TARGET_MINT = SWAP_SOURCE_MINT;
export const EXIT_TARGET_CODE = SWAP_SOURCE_CODE;
export const EXIT_TARGET_DECIMALS = SWAP_SOURCE_DECIMALS;

export type SwapTargetAsset = {
  slug: string;
  code: string;
  label: string;
  assetClass: string;
  issuer: string;
  network: string;
  ecosystem: string;
  mint: string;
  decimals: number;
  officialUrl: string;
  verificationSourceUrl: string;
  representation: string;
  eligibilityNote: string;
};

export const SWAP_TARGET_ASSET: SwapTargetAsset = {
  slug: SWAP_TARGET_SLUG,
  code: SWAP_TARGET_CODE,
  label: "AAPLx",
  assetClass: "equity_fund",
  issuer: SWAP_TARGET_ISSUER,
  network: "Solana",
  ecosystem: "solana",
  mint: SWAP_TARGET_MINT,
  decimals: SWAP_TARGET_DECIMALS,
  officialUrl: SWAP_OFFICIAL_URL,
  verificationSourceUrl: SWAP_DOCS_URL,
  representation:
    "An xStock by Backed tracking Apple: 1:1 backed by the underlying share, permissionless onchain transfers, self-custody, fractional by design.",
  eligibilityNote:
    "Not available in the United States, to US persons, or in other restricted jurisdictions. Vicus performs no eligibility verification.",
};

export const TSLAX_TARGET_ASSET: SwapTargetAsset = {
  slug: TSLAX_SLUG,
  code: TSLAX_CODE,
  label: "TSLAx",
  assetClass: "equity_fund",
  issuer: TSLAX_ISSUER,
  network: "Solana",
  ecosystem: "solana",
  mint: TSLAX_MINT,
  decimals: TSLAX_DECIMALS,
  officialUrl: SWAP_OFFICIAL_URL,
  verificationSourceUrl: SWAP_DOCS_URL,
  representation:
    "A Tesla xStock by Backed tracking Tesla: 1:1 backed by the underlying share, permissionless onchain transfers, self-custody, fractional by design.",
  eligibilityNote:
    "Not available in the United States, to US persons, or in other restricted jurisdictions. Vicus performs no eligibility verification.",
};

/**
 * Executable Jupiter acquisition targets. One shared adapter serves every
 * entry; each pins its exact mint, decimals, and identity server-side.
 * Clients choose only the slug + amount — never mints, venues, or policy.
 */
export const SWAP_TARGETS: Record<string, SwapTargetAsset> = {
  [SWAP_TARGET_SLUG]: SWAP_TARGET_ASSET,
  [TSLAX_SLUG]: TSLAX_TARGET_ASSET,
};

export function isSwapTargetSlug(value: unknown): boolean {
  return typeof value === "string" && value in SWAP_TARGETS;
}

export function getSwapTarget(slug: string): SwapTargetAsset | null {
  return SWAP_TARGETS[slug] ?? null;
}

export function getSwapTargetByMint(mint: string): SwapTargetAsset | null {
  return Object.values(SWAP_TARGETS).find((target) => target.mint === mint) ?? null;
}
