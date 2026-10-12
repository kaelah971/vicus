import "server-only";
import { Networks } from "@stellar/stellar-sdk";

export const LAB_NETWORK = "stellar_testnet" as const;
export const LAB_NETWORK_LABEL = "Stellar Testnet";
export const LAB_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const LAB_FRIENDBOT_URL = "https://friendbot.stellar.org";
export const LAB_NETWORK_PASSPHRASE = Networks.TESTNET;
export const LAB_EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";

export const LAB_ASSET_CLASSES = [
  "stablecoin",
  "treasury_fund",
  "commodity",
  "private_credit",
  "real_estate",
  "other_financial",
] as const;

export const LAB_RUN_STATUSES = [
  "draft",
  "trustline_pending",
  "trustline_confirmed",
  "issuing",
  "issued",
] as const;

export type LabConfigurationErrorCode = "lab_not_configured" | "lab_misconfigured";

export class LabConfigurationError extends Error {
  constructor(
    public readonly code: LabConfigurationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type LabIssuerConfig = {
  issuerSecret: string;
  issuerPublicKey: string;
};

/**
 * The Lab issuer is Testnet-only by construction: the passphrase, Horizon
 * URL, and explorer links are constants, and there is no Mainnet code path.
 * A missing secret fails closed — never faked, never logged.
 */
export async function getLabIssuerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<LabIssuerConfig> {
  const issuerSecret = environment.STELLAR_LAB_ISSUER_SECRET?.trim();
  if (!issuerSecret) {
    throw new LabConfigurationError(
      "lab_not_configured",
      "Tokenization Lab is temporarily unavailable.",
    );
  }
  try {
    const { Keypair } = await import("@stellar/stellar-sdk");
    const issuerPublicKey = Keypair.fromSecret(issuerSecret).publicKey();
    return { issuerSecret, issuerPublicKey };
  } catch {
    throw new LabConfigurationError(
      "lab_misconfigured",
      "Tokenization Lab is temporarily unavailable.",
    );
  }
}

export function isLabAssetClass(value: unknown): boolean {
  return typeof value === "string" && (LAB_ASSET_CLASSES as readonly string[]).includes(value);
}

/** Stellar credit asset codes: 1-12 alphanumeric characters. */
export function normalizeLabAssetCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return /^[A-Za-z0-9]{1,12}$/.test(code) ? code : null;
}

export function isLabPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value);
}
