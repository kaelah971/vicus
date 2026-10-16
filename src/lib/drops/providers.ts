import "server-only";
import { CAMPAIGN_REWARD_ASSET, CAMPAIGN_REWARD_ISSUER } from "@/lib/campaigns/config";

/**
 * P6.4 — Provider authorization policy for asset drops. Fail-closed by
 * construction: the only distributions Vicus can settle are native XLM
 * mission rewards and pinned Stellar Testnet USDC campaign payouts, both
 * enforced by their existing settlement modules. Anything else — any
 * tokenized asset, any other network — requires an allowlisted provider
 * with complete, unexpired issuer authorization evidence. The allowlist
 * below is EMPTY because no such provider exists; entries can only be
 * added by reviewed code, never by form input, env flags, or client
 * claims. Fixtures may exercise this policy in tests — they can never
 * establish a real approved provider.
 */

export const DROP_ASSET_CLASSES = ["native_xlm", "testnet_usdc", "restricted"] as const;

export type DropAssetClass = (typeof DROP_ASSET_CLASSES)[number];

export type DropAuthorizationRequest = {
  /** "native" for XLM, else the Stellar classic asset code. */
  assetCode: string;
  /** Issuer account/contract, or null for native assets. */
  assetIssuer: string | null;
  /** Canonical network id, e.g. "stellar_testnet", "stellar_mainnet", "solana", "base". */
  network: string;
  /** Allowlist provider id claimed, if any. Client-supplied values are untrusted input. */
  providerId?: string | null;
  /** Recipient eligibility as resolved server-side — never client-supplied. */
  recipientEligibility?: "eligible" | "ineligible" | "unknown";
};

export type AuthorizedProvider = {
  /** Stable allowlist id (code constant, not user input). */
  id: string;
  /** Human provider name. */
  name: string;
  /** Official provider source URL. */
  sourceUrl: string;
  /** Exact asset code covered by the issuer approval. */
  assetCode: string;
  /** Exact issuer identity covered. */
  assetIssuer: string;
  /** Exact network covered. */
  network: string;
  /** What the issuer permits, e.g. "promotional-distribution". */
  operation: string;
  /** Recipient rules summary (jurisdictions, KYC, caps). */
  eligibility: string;
  /** ISO-8601 approval expiry; past expiry always fails. */
  expiresAt: string;
  /** Evidence reference (agreement id, letter URL, registry entry). */
  evidenceRef: string;
  /** A provider removed from the list (or never added) settles nothing. */
  status: "active" | "revoked";
};

export type DropAuthorizationVerdict =
  | { ok: true; assetClass: Exclude<DropAssetClass, "restricted">; provider: null }
  | { ok: true; assetClass: "restricted"; provider: AuthorizedProvider }
  | { ok: false; assetClass: "restricted"; reason: DropRejectionReason };

export type DropRejectionReason =
  | "provider-not-allowlisted"
  | "approval-missing"
  | "approval-expired"
  | "provider-revoked"
  | "asset-mismatch"
  | "issuer-mismatch"
  | "network-mismatch"
  | "recipient-ineligible"
  | "recipient-unknown"
  | "evidence-invalid";

export const DROP_REJECTION_COPY: Record<DropRejectionReason, string> = {
  "provider-not-allowlisted": "Requires an authorized provider — none connected for this asset.",
  "approval-missing": "Issuer approval missing — distribution stays disabled.",
  "approval-expired": "Issuer approval expired — distribution stays disabled.",
  "provider-revoked": "Provider authorization revoked — distribution stays disabled.",
  "asset-mismatch": "Asset does not match the issuer approval.",
  "issuer-mismatch": "Issuer does not match the approval.",
  "network-mismatch": "Network does not match the approval.",
  "recipient-ineligible": "Recipient does not meet the issuer eligibility requirements.",
  "recipient-unknown": "Recipient eligibility unknown — never treated as eligible.",
  "evidence-invalid": "Authorization evidence invalid.",
};

/** Pinned Testnet USDC identity (single source: the campaign settlement module). */
const PINNED_TESTNET_USDC = {
  assetCode: CAMPAIGN_REWARD_ASSET,
  assetIssuer: CAMPAIGN_REWARD_ISSUER,
  network: "stellar_testnet",
};

function isPinnedTestnetUsdc(request: DropAuthorizationRequest): boolean {
  return (
    request.assetCode === PINNED_TESTNET_USDC.assetCode &&
    request.assetIssuer === PINNED_TESTNET_USDC.assetIssuer &&
    request.network === PINNED_TESTNET_USDC.network
  );
}

function isNativeXlm(request: DropAuthorizationRequest, network: string): boolean {
  return request.assetCode === "XLM" && request.assetIssuer === null && request.network === network;
}

function validateProviderApproval(
  provider: AuthorizedProvider,
  request: DropAuthorizationRequest,
  now: number,
): DropRejectionReason | null {
  if (provider.status !== "active") return "provider-revoked";
  if (!provider.evidenceRef.trim() || !provider.sourceUrl.trim()) return "evidence-invalid";
  if (Number.isNaN(Date.parse(provider.expiresAt)) || Date.parse(provider.expiresAt) <= now) return "approval-expired";
  if (provider.assetCode !== request.assetCode) return "asset-mismatch";
  if (provider.assetIssuer !== request.assetIssuer) return "issuer-mismatch";
  if (provider.network !== request.network) return "network-mismatch";
  if (request.recipientEligibility === "ineligible") return "recipient-ineligible";
  if (request.recipientEligibility !== "eligible") return "recipient-unknown";
  return null;
}

/**
 * Authorize a proposed distribution. Existing XLM/Testnet-USDC settlement
 * paths call this with their pinned identities; any restricted asset
 * requires a matching active allowlist entry AND server-resolved
 * eligibility. Unknown is never eligible. No approval can arrive via
 * client input — only entries in the code-constant allowlist count.
 */
export function authorizeAssetDrop(
  request: DropAuthorizationRequest,
  providers: readonly AuthorizedProvider[] = PROVIDER_ALLOWLIST,
  now: number = Date.now(),
): DropAuthorizationVerdict {
  if (isNativeXlm(request, request.network)) {
    return { ok: true, assetClass: "native_xlm", provider: null };
  }
  if (isPinnedTestnetUsdc(request)) {
    return { ok: true, assetClass: "testnet_usdc", provider: null };
  }
  const providerId = (request.providerId ?? "").trim();
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider) {
    return { ok: false, assetClass: "restricted", reason: "provider-not-allowlisted" };
  }
  const failure = validateProviderApproval(provider, request, now);
  if (failure) {
    return { ok: false, assetClass: "restricted", reason: failure };
  }
  return { ok: true, assetClass: "restricted", provider };
}

/**
 * The allowlist. EMPTY — no issuer-approved tokenized-asset distribution
 * provider has been established. Adding one requires documented issuer
 * authorization evidence plus separately authorized integration work.
 */
export const PROVIDER_ALLOWLIST: readonly AuthorizedProvider[] = [];
