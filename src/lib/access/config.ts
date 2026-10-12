import "server-only";

/**
 * Vicus Access — Stellar-first native USDC movement via Circle CCTP V2.
 *
 * Source-verified against CURRENT official docs (October 2026):
 * - Circle CCTP: developers.circle.com/cctp/
 *   (supported blockchains + domains, Stellar contracts, forwarding service,
 *   Stellar↔Arc quickstart with Stellar Testnet addresses)
 * - Stellar: developers.stellar.org/docs/tokens/cross-chain-transfers
 *   (points at Circle docs as the maintained source of truth)
 *
 * Product principle: STELLAR = HOME. The user starts on Stellar/Freighter and
 * gets controlled access outward. No wrapped USDC, no custody, no invented
 * config — every address/domain below was read from the official docs above.
 */

export const ACCESS_SOURCE_NETWORK = "stellar_testnet" as const;
export const ACCESS_SOURCE_LABEL = "Stellar Testnet";
export const ACCESS_ASSET = "USDC" as const;
export const ACCESS_ENVIRONMENT = "testnet" as const;

/** Circle CCTP domain for Stellar (source). Standard transfers only. */
export const ACCESS_STELLAR_DOMAIN = 27;

/**
 * Stellar Testnet CCTP contracts + USDC SAC, from the official
 * "Transfer USDC between Stellar and Arc" quickstart (Stellar→Arc tab).
 */
export const ACCESS_TESTNET = {
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  tokenMessengerMinter: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
  usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  /** Circle attestation (Iris) API for testnet routes. */
  irisBaseUrl: "https://iris-api-sandbox.circle.com",
  /** Circle fee-estimate API base (same host family as Iris). */
  feeBaseUrl: "https://iris-api-sandbox.circle.com",
  stellarExplorerTx: "https://stellar.expert/explorer/testnet/tx/",
} as const;

/**
 * Mainnet CCTP contracts, from the official "CCTP Stellar contracts and
 * interfaces" reference. DEFINED BUT EXPLICITLY DISABLED: Vicus V1 runs
 * testnet routes only. Mainnet goes live only after manual verification flips
 * ACCESS_MAINNET_ENABLED with a reviewed config change — never by env flag.
 */
export const ACCESS_MAINNET = {
  tokenMessengerMinter: "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL",
  messageTransmitter: "CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV",
  cctpForwarder: "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T",
  irisBaseUrl: "https://iris-api.circle.com",
} as const;

export const ACCESS_MAINNET_ENABLED = false as const;

/** Stellar-source transfers only support Standard finality (threshold 2000). */
export const ACCESS_FINALITY_THRESHOLD = 2000;

/**
 * Forwarding hook (Circle Forwarding Service, version 0 single-hook format):
 * magic "cctp-forward" + version 0 + empty Circle data length. Lets Circle
 * submit the destination mint so the user signs only on Stellar.
 */
export const ACCESS_FORWARD_HOOK_V0 =
  "0x636374702d666f72776172640000000000000000000000000000000000000000";

/** Forwarding service fee for non-HyperCore routes (USDC). From official docs. */
export const ACCESS_FORWARD_SERVICE_FEE_USDC = "0.05";

export type AccessDestinationKey = "base" | "ethereum" | "solana";

export type AccessDestinationConfig = {
  key: AccessDestinationKey;
  label: string;
  /** Circle CCTP domain identifier. */
  domain: number;
  /** True only when execution requirements are fully verified. */
  executable: boolean;
  /** Shown instead of the send form when executable is false. */
  unavailableReason: string | null;
  /** Circle Forwarding Service supports this chain as a destination. */
  forwardingSupported: boolean;
  explorerTx: string;
};

export const ACCESS_DESTINATIONS: Record<AccessDestinationKey, AccessDestinationConfig> = {
  base: {
    key: "base",
    label: "Base",
    domain: 6,
    executable: true,
    unavailableReason: null,
    forwardingSupported: true,
    explorerTx: "https://sepolia.basescan.org/tx/",
  },
  ethereum: {
    key: "ethereum",
    label: "Ethereum",
    domain: 0,
    executable: true,
    unavailableReason: null,
    forwardingSupported: true,
    explorerTx: "https://sepolia.etherscan.io/tx/",
  },
  solana: {
    key: "solana",
    label: "Solana",
    domain: 5,
    executable: false,
    unavailableReason:
      "Solana needs an Associated Token Account as the mint recipient, with optional ATA creation encoded in the forwarding hook. That path is not verified yet, so Solana stays preview-only until it is.",
    forwardingSupported: true,
    explorerTx: "https://explorer.solana.com/tx/",
  },
};

export const ACCESS_DESTINATION_KEYS = ["base", "ethereum", "solana"] as const;

export function isAccessDestinationKey(value: unknown): value is AccessDestinationKey {
  return value === "base" || value === "ethereum" || value === "solana";
}

export function getAccessDestination(key: AccessDestinationKey): AccessDestinationConfig {
  return ACCESS_DESTINATIONS[key];
}

/** Safe subset exposed to the browser. No secrets, no server-only config. */
export function getPublicAccessConfig() {
  return {
    sourceNetwork: ACCESS_SOURCE_NETWORK,
    sourceLabel: ACCESS_SOURCE_LABEL,
    homeLabel: "Stellar",
    asset: ACCESS_ASSET,
    environment: ACCESS_ENVIRONMENT,
    mainnetEnabled: ACCESS_MAINNET_ENABLED,
    stellarDomain: ACCESS_STELLAR_DOMAIN,
    finalityThreshold: ACCESS_FINALITY_THRESHOLD,
    protocolNote: "Native USDC via Circle CCTP",
    destinations: ACCESS_DESTINATION_KEYS.map((key) => {
      const destination = ACCESS_DESTINATIONS[key];
      return {
        key: destination.key,
        label: destination.label,
        domain: destination.domain,
        executable: destination.executable,
        unavailableReason: destination.unavailableReason,
        forwardingSupported: destination.forwardingSupported,
        explorerTx: destination.explorerTx,
      };
    }),
  };
}
