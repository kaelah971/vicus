/** Client-safe intent vocabulary for utility discovery (no server imports). */

export type UtilityIntent =
  | "access"
  | "send"
  | "borrow"
  | "earn"
  | "redeem"
  | "exit"
  | "rewards"
  | "use";

export const UTILITY_INTENTS: readonly { key: UtilityIntent | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "access", label: "Access" },
  { key: "send", label: "Send" },
  { key: "borrow", label: "Borrow" },
  { key: "earn", label: "Earn" },
  { key: "redeem", label: "Redeem" },
  { key: "exit", label: "Exit" },
  { key: "rewards", label: "Rewards" },
  { key: "use", label: "Other uses" },
];
