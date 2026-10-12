import "server-only";

/**
 * Asset Action Engine V1 — canonical action vocabulary.
 *
 * Vicus is where tokenized assets become usable. Every real asset exposes
 * ONLY the actions actually supported for it; anything unverified is absent,
 * never faked. Source-backed rows live in asset_capabilities (sourceUrl is
 * NOT NULL by schema); Vicus execution overlays (Send / Access / Router)
 * come from live server policy, never client input.
 */

export const ACTION_KINDS = [
  "access",
  "send",
  "transfer",
  "swap",
  "pay",
  "move",
  "supply",
  "earn",
  "redeem",
  "exit",
  "borrow",
  "collateral",
  // Legacy capability rows keep resolving (passthrough, never executable).
  "receive",
  "build",
  "invest",
  "cash_out",
  "save",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_EXECUTION_MODES = ["vicus", "connected", "official", "guide"] as const;

export type ActionExecutionMode = (typeof ACTION_EXECUTION_MODES)[number];

export const ACTION_STATES = ["available", "permissioned", "coming_soon", "unavailable"] as const;

export type ActionState = (typeof ACTION_STATES)[number];

/** Canonical display order — asset-first, never USDC-first by construction. */
export const ACTION_DISPLAY_ORDER: readonly ActionKind[] = [
  "access",
  "send",
  "transfer",
  "swap",
  "pay",
  "move",
  "supply",
  "earn",
  "redeem",
  "exit",
  "borrow",
  "collateral",
  "receive",
  "build",
  "invest",
  "cash_out",
  "save",
];

export function isKnownActionKind(value: unknown): value is ActionKind {
  return typeof value === "string" && (ACTION_KINDS as readonly string[]).includes(value);
}

export type ResolvedAssetAction = {
  kind: ActionKind;
  title: string;
  description: string;
  state: ActionState;
  stateLabel: string;
  executionMode: ActionExecutionMode;
  /** Internal Vicus route for vicus mode; official/connected destination otherwise. */
  href: string;
  external: boolean;
  sourceUrl: string;
  eligibilityNote: string | null;
  network: string;
  live: boolean;
};
