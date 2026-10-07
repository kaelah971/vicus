export const rewardStatuses = [
  "eligible",
  "claimable",
  "submitted",
  "confirmed",
  "failed",
  "expired",
] as const;

export type RewardStatus = (typeof rewardStatuses)[number];
export type RewardNetwork = "testnet" | "public";

export type RewardFailureCode =
  | "destination_not_ready"
  | "distributor_not_configured"
  | "mainnet_disabled"
  | "invalid_reward_amount"
  | "invalid_destination"
  | "source_not_ready"
  | "horizon_unavailable"
  | "transaction_rejected"
  | "recovery_required";

export type RewardStateView = {
  id: string | null;
  submissionId: string;
  missionId: string;
  missionTitle: string;
  circleName: string;
  asset: "XLM";
  amount: string;
  network: RewardNetwork;
  destinationPublicKey: string | null;
  status: RewardStatus;
  transactionHash: string | null;
  ledger: number | null;
  failureCode: RewardFailureCode | null;
  failureMessage: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  explorerUrl: string | null;
};

export type RewardReceiptView = RewardStateView & {
  id: string;
  destinationPublicKey: string;
};
