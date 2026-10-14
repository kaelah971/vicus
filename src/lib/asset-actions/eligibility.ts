import "server-only";
import type { ActionExecutionMode, ActionState } from "@/lib/asset-actions/config";

/**
 * P2.1 Action Compass — eligibility-context model.
 *
 * Pure, deterministic annotation over the EXISTING Action Engine. This module
 * performs no I/O: callers supply the resolved action, the wallet session,
 * and (optionally) a role-check result. It never invents balances, holdings,
 * approvals, or eligibility — anything unverifiable resolves to UNKNOWN,
 * and UNKNOWN never silently becomes AVAILABLE.
 */

export const ELIGIBILITY_STATES = ["available", "unavailable", "unknown"] as const;


export type EligibilityState = (typeof ELIGIBILITY_STATES)[number];

export type EligibilitySession = {
  /** Authenticated Vicus session exists (Stellar signed-message session). */
  signedIn: boolean;
  /** Linked Stellar public key, when signed in. Never a balance proof. */
  walletPublicKey: string | null;
} | null;

export type RoleCheckStatus =
  | "verified-holder"
  | "verified-trustline"
  | "not-qualified"
  | "invalid-address"
  | "account-not-found"
  | "verification-unavailable"
  | "unsupported"
  | "none";

export type EligibilityContext = {
  assetSlug: string;
  actionKind: string;
  actionState: ActionState;
  executionMode: ActionExecutionMode;
  /** Human network label from the resolved action (e.g. "Stellar Mainnet"). */
  network: string;
  /** Server-provided eligibility note from the capability row, if any. */
  eligibilityNote: string | null;
  /** Internal href for the action (may be relative or official URL). */
  href: string;
  session: EligibilitySession;
  /**
   * Result of a live Stellar role check for THIS asset/wallet, when the
   * caller performed one. Null means no check was run — never infer one.
   */
  roleStatus: RoleCheckStatus | null;
};

export type EligibilityNextAction = {
  label: string;
  href: string;
};

export type EligibilityVerdict = {
  actionKind: string;
  assetSlug: string;
  state: EligibilityState;
  explanation: string;
  /** Wallet/network the user needs, when applicable. Null for pure info. */
  requiresWallet: string | null;
  /** Verified role or capability restriction, when applicable. */
  restriction: string | null;
  nextAction: EligibilityNextAction | null;
};

const WALLET_GATED_VICUS_KINDS = new Set(["send", "move"]);

function requiresWalletFor(kind: string, executionMode: ActionExecutionMode): string | null {
  if (executionMode === "vicus" && (kind === "send" || kind === "move")) {
    return "Stellar Mainnet wallet (Freighter)";
  }
  if (kind === "swap" || kind === "exit") return "Solana wallet (Jupiter routing)";
  if (kind === "access") return "Solana wallet or Stellar USDC route";
  if (kind === "borrow") return "Base wallet (Morpho app)";
  return null;
}

function unavailable(
  ctx: EligibilityContext,
  explanation: string,
  restriction: string | null,
  nextAction: EligibilityVerdict["nextAction"],
): EligibilityVerdict {
  return {
    actionKind: ctx.actionKind,
    assetSlug: ctx.assetSlug,
    state: "unavailable",
    explanation,
    requiresWallet: requiresWalletFor(ctx.actionKind, ctx.executionMode),
    restriction,
    nextAction,
  };
}

function unknown(
  ctx: EligibilityContext,
  explanation: string,
  nextAction: EligibilityVerdict["nextAction"],
): EligibilityVerdict {
  return {
    actionKind: ctx.actionKind,
    assetSlug: ctx.assetSlug,
    state: "unknown",
    explanation,
    requiresWallet: requiresWalletFor(ctx.actionKind, ctx.executionMode),
    restriction: null,
    nextAction,
  };
}

/**
 * Deterministic eligibility annotation. No I/O, no fabrication:
 * every branch is derived from the resolved engine state plus the
 * caller-supplied session/role evidence.
 */
export function resolveEligibility(ctx: EligibilityContext): EligibilityVerdict {
  const signedIn = ctx.session?.signedIn === true;

  // Engine-unsupported actions can never become enabled here.
  if (ctx.actionState === "unavailable") {
    return unavailable(
      ctx,
      "Not supported for this asset. Vicus found no verified execution path, so there is nothing to enable.",
      null,
      { label: "Discover usable assets", href: "/discover" },
    );
  }

  // Not yet verified by the engine — stays explicitly unknown.
  if (ctx.actionState === "coming_soon") {
    return unknown(
      ctx,
      "Unknown — not yet verified for this asset. Vicus has not confirmed a real execution path, so availability is unknown.",
      { label: "How Vicus verifies actions", href: "/use" },
    );
  }

  // Permissioned issuer flows: restricted, never available.
  if (ctx.actionState === "permissioned") {
    const restriction =
      ctx.eligibilityNote ?? "Issuer authorization is required for this action.";
    const nextAction: EligibilityNextAction =
      ctx.executionMode === "official"
        ? { label: "Review official requirements", href: ctx.href }
        : { label: "Check eligibility details", href: `/circles/${ctx.assetSlug}` };
    return unavailable(
      ctx,
      `Restricted — ${restriction} Your wallet is not assumed to be authorized.`,
      restriction,
      nextAction,
    );
  }

  // Available engine state from here on. Wallet-gated Vicus execution
  // (Send / Move) needs a signed-in Stellar session to mean anything
  // personal; signed-out stays UNKNOWN, never AVAILABLE-by-default.
  if (ctx.executionMode === "vicus" && WALLET_GATED_VICUS_KINDS.has(ctx.actionKind)) {
    if (!signedIn) {
      return unknown(
        ctx,
        "Unknown for your account — connect a Stellar wallet to check this action for your account. The route itself is live; Vicus cannot confirm it for you while signed out.",
        { label: "Connect a wallet", href: "/profile/me" },
      );
    }
    // A live role check for THIS asset/wallet refines the verdict.
    // A missing check never upgrades or fabricates anything.
    if (ctx.roleStatus === "verified-holder" || ctx.roleStatus === "verified-trustline") {
      return {
        actionKind: ctx.actionKind,
        assetSlug: ctx.assetSlug,
        state: "available",
        explanation:
          "Available — your linked wallet holds the required Stellar trustline. Execution still needs your wallet signature and live onchain checks.",
        requiresWallet: requiresWalletFor(ctx.actionKind, ctx.executionMode),
        restriction: null,
        nextAction: { label: "Continue", href: ctx.href },
      };
    }
    if (
      ctx.roleStatus === "not-qualified" ||
      ctx.roleStatus === "account-not-found" ||
      ctx.roleStatus === "invalid-address"
    ) {
      const reason =
        ctx.roleStatus === "not-qualified"
          ? "no matching trustline was found on your linked wallet"
          : ctx.roleStatus === "account-not-found"
            ? "no Stellar account was found for the checked address"
            : "the checked address was not a valid Stellar address";
      return unavailable(
        ctx,
        `Unavailable for the checked wallet — ${reason}. The route stays live for qualified wallets.`,
        `Stellar role check: ${ctx.roleStatus}`,
        { label: "Check another wallet", href: `/circles/${ctx.assetSlug}` },
      );
    }
    if (ctx.roleStatus === "verification-unavailable") {
      return unknown(
        ctx,
        "Availability unknown — the Stellar network could not be reached for the live check. Try again later.",
        { label: "Retry the asset page", href: `/circles/${ctx.assetSlug}` },
      );
    }
    return {
      actionKind: ctx.actionKind,
      assetSlug: ctx.assetSlug,
      state: "available",
      explanation:
        "Available — the route is live. Your wallet signs at execution, and live onchain checks still apply; nothing about your holdings is assumed.",
      requiresWallet: requiresWalletFor(ctx.actionKind, ctx.executionMode),
      restriction: null,
      nextAction: { label: "Continue", href: ctx.href },
    };
  }

  // Connected-execution actions (Jupiter swaps/exits, Morpho borrow) run
  // through non-Stellar wallets. A Stellar session alone never proves
  // those wallets, so these stay UNKNOWN until a relevant wallet connects.
  if (ctx.executionMode === "connected") {
    return unknown(
      ctx,
      `Unknown until the relevant wallet connects — availability depends on your ${requiresWalletFor(ctx.actionKind, ctx.executionMode) ?? "execution wallet"}. Vicus routes this action but cannot check it without that wallet.`,
      { label: "Review the route", href: ctx.href },
    );
  }

  // Guide + official background flows carry no wallet requirement.
  return {
    actionKind: ctx.actionKind,
    assetSlug: ctx.assetSlug,
    state: "available",
    explanation:
      ctx.executionMode === "official"
        ? "Available as an official issuer flow. Requirements live with the issuer — Vicus does not execute this itself."
        : "Available as background guidance. No wallet needed to read this.",
    requiresWallet: null,
    restriction: ctx.eligibilityNote,
    nextAction: { label: "Continue", href: ctx.href },
  };
}

export type SheetEligibilityInput = {
  assetSlug: string;
  kind: string;
  state: ActionState;
  executionMode: ActionExecutionMode;
  network: string;
  eligibilityNote: string | null;
  href: string;
};

/**
 * Thin adapter for sheet/feed pipelines: builds the context from already
 * resolved engine data plus session presence, with no role check (callers
 * that run per-asset Horizon checks may pass roleStatus explicitly via
 * resolveEligibility instead).
 */
export function eligibilityForSheetAction(
  action: SheetEligibilityInput,
  session: EligibilitySession,
): Pick<EligibilityVerdict, "state" | "explanation"> {
  const verdict = resolveEligibility({
    assetSlug: action.assetSlug,
    actionKind: action.kind,
    actionState: action.state,
    executionMode: action.executionMode,
    network: action.network,
    eligibilityNote: action.eligibilityNote,
    href: action.href,
    session,
    roleStatus: null,
  });
  return { state: verdict.state, explanation: verdict.explanation };
}

export function eligibilityStateLabel(state: EligibilityState): string {
  if (state === "available") return "Available";
  if (state === "unavailable") return "Unavailable";
  return "Unknown";
}
