import "server-only";
import { RewardConfigurationError } from "@/lib/rewards/errors";
import {
  assertMainnetRewardsEnabled,
  compareXlmAmounts,
  getRewardNetworkConfig,
  normalizeXlmAmount,
} from "@/lib/rewards/config-core";
import type { RewardNetworkConfig } from "@/lib/rewards/config-core";

export type RewardSettlementConfig = RewardNetworkConfig & {
  distributorSecret: string;
  maxXlm: string;
};

export {
  assertMainnetRewardsEnabled,
  compareXlmAmounts,
  getRewardNetworkConfig,
  isMainnetRewardsEnabled,
  normalizeXlmAmount,
} from "@/lib/rewards/config-core";
export type { RewardNetworkConfig } from "@/lib/rewards/config-core";

export function getRewardSettlementConfig(environment: NodeJS.ProcessEnv = process.env): RewardSettlementConfig {
  const networkConfig = getRewardNetworkConfig(environment);
  assertMainnetRewardsEnabled(environment);

  const distributorSecret = environment.VICUS_REWARD_DISTRIBUTOR_SECRET?.trim();
  if (!distributorSecret) {
    throw new RewardConfigurationError(
      "distributor_not_configured",
      "A dedicated Vicus reward distributor is not configured.",
    );
  }

  const maxXlm = normalizeXlmAmount(environment.VICUS_REWARD_MAX_XLM?.trim() || "1");
  if (compareXlmAmounts(maxXlm, "0") <= 0) {
    throw new RewardConfigurationError("invalid-max-amount", "The configured XLM limit must be positive.");
  }

  return { ...networkConfig, distributorSecret, maxXlm };
}
