export type StellarRole = "watcher" | "verified-holder" | "verified-trustline" | "none";

export type StellarVerificationStatus =
  | "verified-holder"
  | "verified-trustline"
  | "not-qualified"
  | "invalid-address"
  | "account-not-found"
  | "verification-unavailable"
  | "unsupported";

export type StellarVerificationResult = {
  status: StellarVerificationStatus;
  role: StellarRole;
  qualified: boolean;
  reason: string;
  assetCode: string | null;
  network: string | null;
  checkedAt: string;
};

export type ClassicAssetVerificationConfig = {
  assetCode: string;
  issuerAccount: string;
  network: string;
};
