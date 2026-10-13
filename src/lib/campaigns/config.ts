import "server-only";

/**
 * Project-Funded Activation Campaigns V1 — real Stellar USDC rewards for
 * real verified tokenized-asset actions.
 *
 * Reward network decision: STELLAR TESTNET USDC only. The payout signer is
 * hardcoded to the Testnet passphrase in settlement.ts — Mainnet cannot be
 * reached by changing an env flag; it needs a separately reviewed code
 * decision. Every surface labels the network explicitly.
 *
 * Reward asset: Testnet USDC issued by
 * GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5,
 * triple-verified: dominant StellarExpert testnet supply/trades, Circle's
 * CCTP quickstart SAC, and local SAC derivation from (code, issuer) which
 * reproduces the verified SAC CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
 * exactly. Stellar USDC uses 7 decimals — all accounting is integer
 * base-unit (BigInt) math, never floats.
 */

export const CAMPAIGN_REWARD_NETWORK = "stellar_testnet" as const;
export const CAMPAIGN_REWARD_NETWORK_LABEL = "Stellar Testnet" as const;
export const CAMPAIGN_REWARD_ASSET = "USDC" as const;
export const CAMPAIGN_REWARD_DECIMALS = 7 as const;
export const CAMPAIGN_REWARD_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const CAMPAIGN_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const CAMPAIGN_EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";

export const CAMPAIGN_TARGET_ACTIONS = ["send", "swap", "exit", "mission"] as const;
export type CampaignTargetAction = (typeof CAMPAIGN_TARGET_ACTIONS)[number];

export const CAMPAIGN_STATUSES = [
  "draft",
  "awaiting_funding",
  "funded",
  "active",
  "paused",
  "exhausted",
  "completed",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const COMPLETION_STATUSES = ["reserved", "paid", "failed"] as const;

export function isCampaignTargetAction(value: unknown): value is CampaignTargetAction {
  return typeof value === "string" && (CAMPAIGN_TARGET_ACTIONS as readonly string[]).includes(value);
}

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

/** 7-decimal USDC amount string → integer base units, or null. */
export function usdcToBaseUnits(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(text);
  if (!match) return null;
  try {
    const units = BigInt(match[1]!) * BigInt(10000000) + BigInt((match[2] ?? "").padEnd(7, "0"));
    return units > BigInt(0) ? units : null;
  } catch {
    return null;
  }
}

export function baseUnitsToUsdc(units: bigint): string {
  const whole = units / BigInt(10000000);
  const fraction = (units % BigInt(10000000)).toString().padStart(7, "0");
  return `${whole.toString()}.${fraction}`;
}

/** Numeric(24,7) column text → base units. */
export function numericToBaseUnits(value: string | null): bigint {
  if (!value) return BigInt(0);
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10000000) + BigInt(fraction.padEnd(7, "0").slice(0, 7));
}
