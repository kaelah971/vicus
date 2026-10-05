import "server-only";
import { Horizon } from "@stellar/stellar-sdk";

const STELLAR_MAINNET_HORIZON_URL = "https://horizon.stellar.org";
const HORIZON_TIMEOUT_MS = 10_000;

let horizonServer: Horizon.Server | null = null;

export function getStellarMainnetServer(): Horizon.Server {
  if (!horizonServer) {
    horizonServer = new Horizon.Server(STELLAR_MAINNET_HORIZON_URL);
    horizonServer.httpClient.defaults.timeout = HORIZON_TIMEOUT_MS;
  }

  return horizonServer;
}
