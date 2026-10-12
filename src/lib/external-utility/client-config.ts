/**
 * Client-safe mirror of the server-owned swap route. Values only — every
 * protocol decision (mints, venue, slippage, recipient) is enforced
 * server-side in src/lib/external-utility. Kept literal with the source of
 * truth noted per constant.
 */

export const SWAP_RPC_URL = "https://api.mainnet-beta.solana.com"; // cf. SOLANA_RPC_URL
export const SWAP_EXPLORER_TX = "https://explorer.solana.com/tx/"; // cf. SOLANA_EXPLORER_TX
export const SWAP_TARGET_CODE = "AAPLx"; // cf. SWAP_TARGET_CODE
export const SWAP_SOURCE_CODE = "USDC"; // cf. SWAP_SOURCE_CODE
export const SWAP_TARGET_DECIMALS = 8; // cf. SWAP_TARGET_DECIMALS
export const SWAP_SLUG = "aaplx-on-solana"; // cf. SWAP_TARGET_SLUG
export const ACCESS_SOURCE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // cf. SWAP_SOURCE_MINT
export const ACCESS_SOURCE_CODE = "USDC"; // cf. SWAP_SOURCE_CODE
export const ACCESS_SOURCE_DECIMALS = 6; // cf. SWAP_SOURCE_DECIMALS
