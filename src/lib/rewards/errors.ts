import type { RewardFailureCode } from "@/lib/rewards/types";

export type RewardActionCode =
  | "unauthenticated"
  | "invalid-submission"
  | "not-found"
  | "forbidden"
  | "not-eligible"
  | "wallet-mismatch"
  | "reward-configuration-unavailable"
  | "reward-unavailable";

export class RewardActionError extends Error {
  constructor(
    public readonly code: RewardActionCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "RewardActionError";
  }
}

export class RewardConfigurationError extends Error {
  constructor(
    public readonly code: RewardFailureCode | "invalid-network" | "invalid-max-amount",
    message: string,
  ) {
    super(message);
    this.name = "RewardConfigurationError";
  }
}

export class RewardSettlementError extends Error {
  constructor(
    public readonly code: RewardFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "RewardSettlementError";
  }
}
