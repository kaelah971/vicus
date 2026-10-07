import { Networks } from "@stellar/stellar-sdk";
import { RewardConfigurationError } from "@/lib/rewards/errors";
import type { RewardNetwork } from "@/lib/rewards/types";

export type RewardNetworkConfig = {
  network: RewardNetwork;
  label: string;
  horizonUrl: string;
  networkPassphrase: string;
  explorerBaseUrl: string;
};

const NETWORK_CONFIG: Record<RewardNetwork, RewardNetworkConfig> = {
  testnet: {
    network: "testnet",
    label: "Stellar Testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    explorerBaseUrl: "https://horizon-testnet.stellar.org/transactions",
  },
  public: {
    network: "public",
    label: "Stellar Public Network",
    horizonUrl: "https://horizon.stellar.org",
    networkPassphrase: Networks.PUBLIC,
    explorerBaseUrl: "https://horizon.stellar.org/transactions",
  },
};

export function normalizeXlmAmount(value: string): string {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(normalized)) {
    throw new RewardConfigurationError("invalid-max-amount", "The configured XLM limit is invalid.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${trimmedWhole}.${trimmedFraction}` : trimmedWhole;
}

export function compareXlmAmounts(left: string, right: string): number {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return {
      whole: BigInt(whole),
      fraction: BigInt((fraction + "0000000").slice(0, 7)),
    };
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a.whole !== b.whole) return a.whole > b.whole ? 1 : -1;
  if (a.fraction === b.fraction) return 0;
  return a.fraction > b.fraction ? 1 : -1;
}

export function getRewardNetworkConfig(environment: NodeJS.ProcessEnv = process.env): RewardNetworkConfig {
  const network = (environment.VICUS_REWARD_NETWORK?.trim().toLowerCase() || "testnet") as RewardNetwork;
  const config = NETWORK_CONFIG[network];
  if (!config) {
    throw new RewardConfigurationError("invalid-network", "Vicus rewards support Testnet or the Stellar public network.");
  }

  return config;
}

export function isMainnetRewardsEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.VICUS_ENABLE_MAINNET_REWARDS === "true";
}

export function assertMainnetRewardsEnabled(environment: NodeJS.ProcessEnv = process.env) {
  const network = getRewardNetworkConfig(environment);
  if (network.network === "public" && !isMainnetRewardsEnabled(environment)) {
    throw new RewardConfigurationError(
      "mainnet_disabled",
      "Stellar public-network rewards are disabled until VICUS_ENABLE_MAINNET_REWARDS=true.",
    );
  }
}

export function rewardExplorerUrl(network: RewardNetwork, transactionHash: string | null): string | null {
  if (!transactionHash) return null;
  return `${NETWORK_CONFIG[network].explorerBaseUrl}/${encodeURIComponent(transactionHash)}`;
}
