import "server-only";
import { getCircleCapabilities, supportModeBadge, type AssetCapability } from "@/lib/utility/service";
import { getSendableAsset } from "@/lib/send/service";
import { getExecutionGate } from "@/lib/asset-access/service";
import { ROUTER_TARGET_ASSET } from "@/lib/asset-access/config";
import { LENDING_COLLATERAL_SLUG, LENDING_LOAN_CODE, LENDING_MARKET_URL, LENDING_PROTOCOL } from "@/lib/lending/config";
import { SWAP_TARGET_ASSET, SWAP_TARGET_SLUG, getSwapTarget, isSwapTargetSlug } from "@/lib/external-utility/config";
import {
  ACTION_DISPLAY_ORDER,
  isKnownActionKind,
  type ActionExecutionMode,
  type ActionKind,
  type ActionState,
  type ResolvedAssetAction,
} from "@/lib/asset-actions/config";

/**
 * Executable-action adapter interface. Existing systems register here
 * conceptually — SendAdapter, CrossChainAccessAdapter (CCTP MOVE),
 * AssetAcquisitionAdapter (AAPLc router). Future LendingAdapter, SwapAdapter
 * and RedeemAdapter plug into this registry without touching the resolver,
 * the seed, or the Circle UI. Nothing here is rewritten; the systems of
 * record stay in their own services.
 */
export type AssetActionAdapter = {
  kind: ActionKind;
  supports(circleSlug: string): boolean;
  href(circleSlug: string): string;
  permissioned(circleSlug: string): boolean;
};

const sendAdapter: AssetActionAdapter = {
  kind: "send",
  supports: (circleSlug) => getSendableAsset(circleSlug) !== null,
  href: (circleSlug) => `/send?asset=${circleSlug}`,
  permissioned: (circleSlug) => getSendableAsset(circleSlug)?.permissioned === true,
};

const STELLAR_USDC_SLUG = "usdc-on-stellar";

const moveAdapter: AssetActionAdapter = {
  kind: "move",
  // CCTP MOVE is Stellar-source native USDC only — never any other asset.
  supports: (circleSlug) => circleSlug === STELLAR_USDC_SLUG,
  href: () => "/access",
  permissioned: () => false,
};

const acquireAdapter: AssetActionAdapter = {
  kind: "access",
  supports: (circleSlug) => circleSlug === ROUTER_TARGET_ASSET.slug || isSwapTargetSlug(circleSlug),
  href: (circleSlug) => `/acquire/${circleSlug}`,
  permissioned: () => true,
};

const swapUtilityAdapter: AssetActionAdapter = {
  kind: "swap",
  supports: (circleSlug) => isSwapTargetSlug(circleSlug),
  href: (circleSlug) => `/swap/${circleSlug}`,
  permissioned: () => true,
};

const exitAdapter: AssetActionAdapter = {
  kind: "exit",
  supports: (circleSlug) => circleSlug === SWAP_TARGET_SLUG,
  href: () => `/exit/${SWAP_TARGET_SLUG}`,
  permissioned: () => true,
};

const borrowAdapter: AssetActionAdapter = {
  kind: "borrow",
  // Lending V1: exactly one verified market (AAPLc collateral on Morpho).
  // Siblings never inherit this — support is pinned to the winning slug.
  supports: (circleSlug) => circleSlug === LENDING_COLLATERAL_SLUG,
  href: () => LENDING_MARKET_URL,
  permissioned: () => false,
};

export const ACTION_ADAPTERS: readonly AssetActionAdapter[] = [sendAdapter, moveAdapter, acquireAdapter, swapUtilityAdapter, exitAdapter, borrowAdapter];

function executionModeFor(capability: AssetCapability): ActionExecutionMode {
  if (capability.supportMode === "in_vicus") return "vicus";
  if (capability.supportMode === "guide") return "guide";
  // Issuer access/redemption flows reached through the issuer's own page are
  // official by definition — the source URL is the issuer.
  if (capability.capabilityType === "access" || capability.capabilityType === "redeem") return "official";
  return "connected";
}

function stateFor(capability: AssetCapability, mode: ActionExecutionMode): { state: ActionState; label: string } {
  // Eligibility-gated issuer flows are permissioned, never "available".
  if (mode === "official" && capability.eligibilityNote) {
    return { state: "permissioned", label: "Permissioned · Official flow" };
  }
  if (capability.supportMode === "in_vicus") return { state: "available", label: supportModeBadge.in_vicus };
  if (capability.supportMode === "connected") return { state: "available", label: supportModeBadge.connected };
  return { state: "available", label: supportModeBadge.guide };
}

function hrefFor(circleSlug: string, capability: AssetCapability, mode: ActionExecutionMode): { href: string; external: boolean } {
  if (mode === "vicus" && capability.destinationUrl?.startsWith("/")) {
    return { href: capability.destinationUrl, external: false };
  }
  if (capability.destinationUrl) return { href: capability.destinationUrl, external: true };
  // Guide rows without a destination resolve to the existing per-capability
  // detail page, which always renders source + boundary copy.
  return { href: `/circles/${circleSlug}/use/${capability.capabilityType}`, external: false };
}

/**
 * Resolve every action Vicus can truthfully offer for a Circle: source-backed
 * capability rows first, then live Vicus execution overlays. Overlays win on
 * kind collision (real execution supersedes generic guidance), so an asset
 * never shows two SENDs and Vicus links appear only where execution exists.
 */
export async function resolveAssetActions(
  circleSlug: string,
  network: string,
): Promise<ResolvedAssetAction[]> {
  const capabilities = await getCircleCapabilities(circleSlug);
  const seen = new Set<string>();
  const resolved: ResolvedAssetAction[] = [];

  const overlayKinds = new Set<ActionKind>();
  for (const adapter of ACTION_ADAPTERS) {
    if (!adapter.supports(circleSlug)) continue;
    overlayKinds.add(adapter.kind);
    if (adapter.kind === "send") {
      const permissioned = adapter.permissioned(circleSlug);
      resolved.push({
        kind: "send",
        title: "Send",
        description: permissioned
          ? "Send to a person you know. Transfers need an issuer-authorized recipient wallet."
          : "Send to a person you know on Stellar Mainnet.",
        state: permissioned ? "permissioned" : "available",
        stateLabel: permissioned ? "Permissioned" : "Stellar Mainnet",
        executionMode: "vicus",
        href: adapter.href(circleSlug),
        external: false,
        sourceUrl: "https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations",
        eligibilityNote: permissioned ? "Recipient wallets must be authorized by the issuer." : null,
        network,
        live: true,
      });
    } else if (adapter.kind === "move") {
      resolved.push({
        kind: "move",
        title: "Move across networks",
        description: "Move native USDC from Stellar to supported networks with Circle CCTP.",
        state: "available",
        stateLabel: "Native USDC via Circle CCTP",
        executionMode: "vicus",
        href: adapter.href(circleSlug),
        external: false,
        sourceUrl: "https://developers.circle.com/cctp",
        eligibilityNote: null,
        network,
        live: true,
      });
    } else if (adapter.kind === "access") {
      const swapTarget = getSwapTarget(circleSlug);
      if (swapTarget) {
        // Executable Jupiter acquisition: Solana USDC funds the registry
        // target through live routing. Stellar USDC stays gated (acquire page).
        resolved.push({
          kind: "access",
          title: `Access ${swapTarget.code}`,
          description: "Fund with Solana USDC through live Jupiter routing. Your wallet signs; Vicus verifies.",
          state: "available",
          stateLabel: "Solana USDC · Jupiter",
          executionMode: "connected",
          href: adapter.href(circleSlug),
          external: false,
          sourceUrl: swapTarget.verificationSourceUrl,
          eligibilityNote: swapTarget.eligibilityNote,
          network,
          live: true,
        });
      } else {
      const gate = getExecutionGate();
      resolved.push({
        kind: "access",
        title: `Access with Stellar USDC`,
        description: gate.enabled
          ? "Plan the Stellar USDC route to this asset."
          : "Plan the Stellar USDC route. Acquisition unlocks after venue liquidity and Mainnet review.",
        state: gate.enabled ? "available" : "permissioned",
        stateLabel: gate.enabled ? "Stellar USDC route" : "Route planner · Execution gated",
        executionMode: "vicus",
        href: adapter.href(circleSlug),
        external: false,
        sourceUrl: ROUTER_TARGET_ASSET.verificationSourceUrl,
        eligibilityNote: ROUTER_TARGET_ASSET.eligibilityNote,
        network,
        live: gate.enabled,
      });
      }
    } else if (adapter.kind === "swap") {
      const swapTarget = getSwapTarget(circleSlug) ?? SWAP_TARGET_ASSET;
      resolved.push({
        kind: "swap",
        title: "Swap",
        description: `Swap Solana USDC for ${swapTarget.code} with live Jupiter routing. Funded from your connected Solana wallet.`,
        state: "available",
        stateLabel: "Jupiter · Solana",
        executionMode: "connected",
        href: adapter.href(circleSlug),
        external: false,
        sourceUrl: swapTarget.verificationSourceUrl,
        eligibilityNote: swapTarget.eligibilityNote,
        network,
        live: true,
      });
    } else if (adapter.kind === "exit") {
      resolved.push({
        kind: "exit",
        title: "Exit",
        description: `Exit ${SWAP_TARGET_ASSET.code} to Solana USDC with live Jupiter routing. Wallet signs; Vicus verifies.`,
        state: "available",
        stateLabel: "Jupiter · Solana",
        executionMode: "connected",
        href: adapter.href(circleSlug),
        external: false,
        sourceUrl: SWAP_TARGET_ASSET.verificationSourceUrl,
        eligibilityNote: SWAP_TARGET_ASSET.eligibilityNote,
        network,
        live: true,
      });
    } else if (adapter.kind === "borrow") {
      // Lending V1 (CONNECTED): post AAPLc as collateral on the verified
      // Morpho market and borrow USDC in the exact protocol flow. Vicus
      // reads market state but never builds or signs Morpho transactions.
      resolved.push({
        kind: "borrow",
        title: "Borrow against",
        description: `Post ${ROUTER_TARGET_ASSET.code} as collateral on ${LENDING_PROTOCOL} and borrow ${LENDING_LOAN_CODE} in the verified market flow.`,
        state: "available",
        stateLabel: `${LENDING_PROTOCOL} · Base`,
        executionMode: "connected",
        href: adapter.href(circleSlug),
        external: true,
        sourceUrl: "https://docs.morpho.org/",
        eligibilityNote: ROUTER_TARGET_ASSET.eligibilityNote,
        network,
        live: true,
      });
    }
    seen.add(adapter.kind);
  }

  for (const capability of capabilities) {
    if (!isKnownActionKind(capability.capabilityType)) continue;
    // Live Vicus execution supersedes generic guidance on the same kind.
    if (overlayKinds.has(capability.capabilityType)) continue;
    if (seen.has(capability.capabilityType)) continue;
    seen.add(capability.capabilityType);
    const kind = capability.capabilityType;
    const mode = executionModeFor(capability);
    const { state, label } = stateFor(capability, mode);
    const { href, external } = hrefFor(circleSlug, capability, mode);
    resolved.push({
      kind,
      title: capability.title,
      description: capability.shortDescription,
      state,
      stateLabel: label,
      executionMode: mode,
      href,
      external,
      sourceUrl: capability.sourceUrl,
      eligibilityNote: capability.eligibilityNote,
      network,
      live: mode === "vicus",
    });
  }

  const order = new Map(ACTION_DISPLAY_ORDER.map((kind, index) => [kind, index]));
  return resolved.sort(
    (a, b) => (order.get(a.kind) ?? ACTION_DISPLAY_ORDER.length) - (order.get(b.kind) ?? ACTION_DISPLAY_ORDER.length),
  );
}
