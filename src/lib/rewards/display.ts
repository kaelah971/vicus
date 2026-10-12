import "server-only";

import { getRewardNetworkConfig } from "@/lib/rewards/config-core";

/** Human label for the network XLM rewards settle on, so reward surfaces never hide it. */
export function rewardNetworkLabel(): string | null {
  try {
    return getRewardNetworkConfig().network === "public" ? "Stellar Mainnet" : "Stellar Testnet";
  } catch {
    return null;
  }
}
