import "server-only";
import { NotFoundError, StrKey } from "@stellar/stellar-sdk";
import { getStellarMainnetServer } from "@/lib/stellar/client";
import { createClassicStellarAsset } from "@/lib/stellar/assets";
import type {
  ClassicAssetVerificationConfig,
  StellarRole,
  StellarVerificationResult,
} from "@/lib/stellar/types";

function checkedAt(): string {
  return new Date().toISOString();
}

function roleForStatus(status: StellarVerificationResult["status"]): StellarRole {
  if (status === "verified-holder" || status === "verified-trustline") {
    return status;
  }

  return "none";
}

function result(
  config: Pick<ClassicAssetVerificationConfig, "assetCode" | "network">,
  status: StellarVerificationResult["status"],
  qualified: boolean,
  reason: string,
): StellarVerificationResult {
  return {
    status,
    role: roleForStatus(status),
    qualified,
    reason,
    assetCode: config.assetCode,
    network: config.network,
    checkedAt: checkedAt(),
  };
}

function isValidPublicAddress(address: string): boolean {
  return address.startsWith("G") && StrKey.isValidEd25519PublicKey(address);
}

function isPositiveAmount(amount: string | undefined): boolean {
  if (!amount || !/^\d+(?:\.\d+)?$/.test(amount)) {
    return false;
  }

  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) > 0 || fraction.replace(/0/g, "").length > 0;
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }

  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }

  const response = error.response;
  return (
    typeof response === "object" &&
    response !== null &&
    "status" in response &&
    response.status === 404
  );
}

export async function verifyClassicAssetRole(
  address: string,
  config: ClassicAssetVerificationConfig,
): Promise<StellarVerificationResult> {
  const normalizedAddress = address.trim();
  const baseConfig = { assetCode: config.assetCode, network: config.network };

  if (!isValidPublicAddress(normalizedAddress)) {
    return result(
      baseConfig,
      "invalid-address",
      false,
      "Enter a valid Stellar public address beginning with G.",
    );
  }

  let canonicalAsset;
  try {
    canonicalAsset = createClassicStellarAsset(config);
  } catch {
    return result(
      baseConfig,
      "unsupported",
      false,
      "This asset is not configured for a live role check.",
    );
  }

  try {
    const server = getStellarMainnetServer();
    const account = await server.accounts().accountId(normalizedAddress).call();
    const matchingBalance = account.balances.find(
      (balance) =>
        balance.asset_type !== "native" &&
        "asset_code" in balance &&
        "asset_issuer" in balance &&
        balance.asset_code === canonicalAsset.code &&
        balance.asset_issuer === canonicalAsset.issuer,
    );

    if (!matchingBalance) {
      return result(
        baseConfig,
        "not-qualified",
        false,
        `This account does not have a ${canonicalAsset.code} trustline on Stellar.`,
      );
    }

    if ("balance" in matchingBalance && isPositiveAmount(matchingBalance.balance)) {
      return result(
        baseConfig,
        "verified-holder",
        true,
        `This account has a positive ${canonicalAsset.code} balance on Stellar.`,
      );
    }

    return result(
      baseConfig,
      "verified-trustline",
      true,
      `This account has a ${canonicalAsset.code} trustline, but no positive balance was found.`,
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return result(
        baseConfig,
        "account-not-found",
        false,
        "No Stellar account was found for this address.",
      );
    }

    return result(
      baseConfig,
      "verification-unavailable",
      false,
      "The Stellar network could not be reached. Try again later.",
    );
  }
}

export function unsupportedVerificationResult(
  assetCode: string | null,
  network: string | null,
): StellarVerificationResult {
  return {
    status: "unsupported",
    role: "none",
    qualified: false,
    reason: "This asset is not configured for a live role check.",
    assetCode,
    network,
    checkedAt: checkedAt(),
  };
}
