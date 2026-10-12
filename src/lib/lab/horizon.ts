import "server-only";
import { LAB_FRIENDBOT_URL, LAB_HORIZON_URL } from "@/lib/lab/config";

export type LabBalance = {
  assetCode: string | null;
  assetIssuer: string | null;
};

export type LabAccount = {
  sequence: string;
  balances: LabBalance[];
};

export type LabTransaction = {
  hash: string;
  successful: boolean;
  sourceAccount: string;
  ledger: number | null;
};

export type LabOperation = {
  type: string;
  sourceAccount: string | null;
  assetCode: string | null;
  assetIssuer: string | null;
};

export type LabIssuanceMatch = {
  hash: string;
  ledger: number | null;
};

export type LabHorizon = {
  getAccount(address: string): Promise<LabAccount | null>;
  getTransaction(hash: string): Promise<LabTransaction | null>;
  getTransactionOperations(hash: string): Promise<LabOperation[]>;
  submitTransaction(signedXdr: string): Promise<LabTransaction>;
  findIssuerPayment(
    issuer: string,
    match: { destination: string; assetCode: string; amount: string },
  ): Promise<LabIssuanceMatch | null>;
  fundViaFriendbot(address: string): Promise<"funded" | "already-funded">;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(`Testnet Horizon responded with status ${response.status}.`);
      (error as { status?: number; body?: string }).status = response.status;
      (error as { body?: string }).body = body;
      throw error;
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function toOperation(record: unknown, txSource: string): LabOperation {
  if (!isRecord(record)) return { type: "", sourceAccount: null, assetCode: null, assetIssuer: null };
  return {
    type: typeof record.type === "string" ? record.type : "",
    sourceAccount:
      typeof record.source_account === "string" ? record.source_account : txSource,
    assetCode: typeof record.asset_code === "string" ? record.asset_code : null,
    assetIssuer: typeof record.asset_issuer === "string" ? record.asset_issuer : null,
  };
}

export function createTestnetHorizon(): LabHorizon {
  return {
    async getAccount(address: string) {
      const data = await fetchJson(`${LAB_HORIZON_URL}/accounts/${address}`);
      if (!isRecord(data) || typeof data.sequence !== "string" || !Array.isArray(data.balances)) {
        return null;
      }
      return {
        sequence: data.sequence,
        balances: data.balances
          .filter(isRecord)
          .map((entry) => ({
            assetCode: typeof entry.asset_code === "string" ? entry.asset_code : null,
            assetIssuer: typeof entry.asset_issuer === "string" ? entry.asset_issuer : null,
          })),
      };
    },

    async getTransaction(hash: string) {
      const data = await fetchJson(`${LAB_HORIZON_URL}/transactions/${hash}`);
      if (!isRecord(data) || typeof data.hash !== "string") return null;
      return {
        hash: data.hash,
        successful: data.successful === true,
        sourceAccount: typeof data.source_account === "string" ? data.source_account : "",
        ledger: typeof data.ledger === "number" ? data.ledger : null,
      };
    },

    async getTransactionOperations(hash: string) {
      const data = await fetchJson(
        `${LAB_HORIZON_URL}/transactions/${hash}/operations?limit=100&order=asc`,
      );
      if (!isRecord(data) || !Array.isArray(data.records)) return [];
      const tx = await fetchJson(`${LAB_HORIZON_URL}/transactions/${hash}`);
      const txSource = isRecord(tx) && typeof tx.source_account === "string" ? tx.source_account : "";
      return data.records.map((record) => toOperation(record, txSource));
    },

    async submitTransaction(signedXdr: string) {
      const data = await fetchJson(`${LAB_HORIZON_URL}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ tx: signedXdr }).toString(),
      });
      if (!isRecord(data) || typeof data.hash !== "string") {
        throw new Error("Testnet did not return a transaction hash.");
      }
      return {
        hash: data.hash,
        successful: data.successful !== false,
        sourceAccount: typeof data.source_account === "string" ? data.source_account : "",
        ledger: typeof data.ledger === "number" ? data.ledger : null,
      };
    },

    async findIssuerPayment(issuer, match) {
      // Retry/crash recovery: scan recent issuer payments for the exact
      // destination + asset + amount before attempting a fresh issuance.
      const data = await fetchJson(
        `${LAB_HORIZON_URL}/accounts/${issuer}/payments?limit=200&order=desc`,
      );
      if (!isRecord(data) || !Array.isArray(data.records)) return null;
      for (const record of data.records.filter(isRecord)) {
        if (record.type !== "payment") continue;
        if (
          record.to === match.destination &&
          record.asset_code === match.assetCode &&
          record.asset_issuer === issuer &&
          typeof record.amount === "string" &&
          record.amount === match.amount &&
          record.transaction_successful !== false &&
          isRecord(record._links) &&
          isRecord(record._links.transaction)
        ) {
          const href =
            typeof record._links.transaction === "object" &&
            record._links.transaction !== null &&
            "href" in record._links.transaction
              ? String((record._links.transaction as { href: unknown }).href)
              : "";
          const hash = href.split("/").pop() ?? "";
          if (/^[0-9a-f]{64}$/.test(hash)) {
            return { hash, ledger: null };
          }
        }
      }
      return null;
    },

    async fundViaFriendbot(address: string) {
      try {
        await fetchJson(`${LAB_FRIENDBOT_URL}?addr=${address}`);
        return "funded";
      } catch (error) {
        const status = (error as { status?: number }).status;
        const body = String((error as { body?: string }).body ?? "");
        if (status === 400 && /already|exists/i.test(body)) return "already-funded";
        throw error;
      }
    },
  };
}
