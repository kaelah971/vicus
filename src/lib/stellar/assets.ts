import "server-only";
import { Asset } from "@stellar/stellar-sdk";
import type { ClassicAssetVerificationConfig } from "@/lib/stellar/types";

export function createClassicStellarAsset(config: ClassicAssetVerificationConfig): Asset {
  return new Asset(config.assetCode, config.issuerAccount);
}
