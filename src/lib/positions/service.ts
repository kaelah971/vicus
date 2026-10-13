import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import { assets, circles } from "@/db/schema";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import {
  SWAP_SOURCE_DECIMALS,
  SWAP_SOURCE_MINT,
  SWAP_TARGET_DECIMALS,
  SWAP_TARGET_MINT,
} from "@/lib/external-utility/config";
import {
  formatSubunits,
  getSolanaTokenBalance,
  type SolanaBalanceTransport,
} from "@/lib/external-utility/service";
import {
  ROUTER_BASE_RPC_URL,
  ROUTER_BASE_USDC,
  ROUTER_TARGET_ASSET,
} from "@/lib/asset-access/config";
import { createMainnetHorizon, type SendHorizon } from "@/lib/send/service";
import {
  LENDING_COLLATERAL_SLUG,
  LENDING_LOAN_CODE,
  LENDING_MARKET_ID,
  LENDING_MARKET_URL,
  LENDING_PROTOCOL,
} from "@/lib/lending/config";
import { getLendingPosition, type MorphoFetch } from "@/lib/lending/service";

/**
 * Position Center V1 — current onchain holdings, nothing inferred.
 * A position exists only when a live chain read shows a positive balance
 * for an exact registry match (code+issuer / mint / contract). Watchlists,
 * past swaps, sends, and orders never imply ownership. Read-only: balances
 * are never written to the database. No prices, P&L, or risk metrics exist
 * in this model — future lending adapters can extend the Position type
 * without touching these readers.
 */

export type WalletSource = "vicus-stellar" | "connected-solana" | "connected-base";

export type PositionAction = {
  kind: string;
  title: string;
  state: string;
  stateLabel: string;
  href: string;
};

export type LendingPosition = {
  protocol: string;
  marketId: string;
  collateralCode: string;
  collateralDisplay: string;
  borrowedCode: string;
  borrowedDisplay: string;
  /** Protocol-reported health factor — present only when reported. */
  healthFactor: number | null;
  marketUrl: string;
};

export type Position = {
  assetSlug: string;
  code: string;
  network: string;
  assetClass: string;
  assetClassLabel: string;
  issuer: string;
  /** Exact onchain balance string in display units — never a float. */
  balance: string;
  decimals: number;
  walletSource: WalletSource;
  verificationSource: string;
  openHref: string;
  actions: PositionAction[];
  /** Populated only from live protocol state — never invented. */
  lendingPosition?: LendingPosition;
};

export type PositionResult = {
  positions: Position[];
  /** True when at least one registry read failed — the list may be partial. */
  partial: boolean;
};

export class PositionsError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "invalid-request" | "unavailable",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Stellar decimal string (≤7 places) → stroop-like integer, or null. */
function stellarToUnits(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(value.trim());
  if (!match) return null;
  try {
    return BigInt(match[1]!) * BigInt(10000000) + BigInt((match[2] ?? "").padEnd(7, "0"));
  } catch {
    return null;
  }
}

// Mirror of scripts/seed-external-assets.ts (seeds cannot import server-only
// modules). Sources of truth: Jupiter curated search + Base Mainnet reads.
const TSLAX_MINT = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const TSLAX_DECIMALS = 8;
const NVDAC_CONTRACT = "0xb20000000000000000000078ee7ce2fE4908108C";
const NVDAC_DECIMALS = 8;
const BASE_USDC_DECIMALS = 6;

type SolanaRegistryEntry = {
  slug: string;
  code: string;
  assetClass: string;
  mint: string;
  decimals: number;
  network: string;
  verificationSource: string;
};

const SOLANA_REGISTRY: readonly SolanaRegistryEntry[] = [
  { slug: "aaplx-on-solana", code: "AAPLx", assetClass: "equity_fund", mint: SWAP_TARGET_MINT, decimals: SWAP_TARGET_DECIMALS, network: "Solana", verificationSource: "https://docs.xstocks.fi/docs" },
  { slug: "tslax-on-solana", code: "TSLAx", assetClass: "equity_fund", mint: TSLAX_MINT, decimals: TSLAX_DECIMALS, network: "Solana", verificationSource: "https://docs.xstocks.fi/docs" },
  { slug: "usdc-on-solana", code: "USDC", assetClass: "stablecoin", mint: SWAP_SOURCE_MINT, decimals: SWAP_SOURCE_DECIMALS, network: "Solana", verificationSource: "https://www.circle.com/multi-chain-usdc/solana" },
];

type BaseRegistryEntry = {
  slug: string;
  code: string;
  assetClass: string;
  contract: string;
  decimals: number;
  network: string;
  verificationSource: string;
};

const BASE_REGISTRY: readonly BaseRegistryEntry[] = [
  { slug: "aaplc-on-base", code: "AAPLc", assetClass: "equity_fund", contract: ROUTER_TARGET_ASSET.contractAddress, decimals: ROUTER_TARGET_ASSET.decimals, network: "Base", verificationSource: "https://www.base.org/stocks" },
  { slug: "nvdac-on-base", code: "NVDAc", assetClass: "equity_fund", contract: NVDAC_CONTRACT, decimals: NVDAC_DECIMALS, network: "Base", verificationSource: "https://www.base.org/stocks" },
  { slug: "usdc-on-base", code: "USDC", assetClass: "stablecoin", contract: ROUTER_BASE_USDC, decimals: BASE_USDC_DECIMALS, network: "Base", verificationSource: "https://www.circle.com/multi-chain-usdc/base" },
];

async function actionsFor(slug: string, network: string): Promise<PositionAction[]> {
  const resolved = await resolveAssetActions(slug, network);
  return resolved.map((action) => ({
    kind: action.kind,
    title: action.title,
    state: action.state,
    stateLabel: action.stateLabel,
    href: action.href,
  }));
}

function sortPositions(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => a.code.localeCompare(b.code) || a.assetSlug.localeCompare(b.assetSlug));
}

/**
 * Stellar holdings for the authenticated Vicus wallet. One Horizon account
 * read; registry comes from the DB assets table (exact code+issuer); only
 * positive balances become positions. A 404/empty account is zero holdings,
 * not an error; any other outage is a truthful unavailable error.
 */
export async function getStellarPositions(
  stellarPublicKey: string,
  horizon?: Pick<SendHorizon, "getAccount">,
): Promise<PositionResult> {
  const wallet = typeof stellarPublicKey === "string" ? stellarPublicKey.trim() : "";
  if (!STELLAR_KEY_RE.test(wallet)) {
    throw new PositionsError("invalid-request", "That Stellar wallet address is not valid.", 400);
  }
  try {
    const reader = horizon ?? createMainnetHorizon();
    let account;
    try {
      account = await reader.getAccount(wallet);
    } catch {
      throw new PositionsError("unavailable", "Stellar Horizon is unreachable. Balances could not be read — nothing was assumed.", 503);
    }
    if (!account) return { positions: [], partial: false };
    const database = getDatabase();
    const rows = await database
      .select({
        slug: circles.slug,
        category: circles.category,
        name: circles.name,
        code: assets.code,
        issuer: assets.issuer,
        stellarAssetCode: assets.stellarAssetCode,
        stellarIssuerAccount: assets.stellarIssuerAccount,
        verificationSourceUrl: assets.verificationSourceUrl,
      })
      .from(assets)
      .innerJoin(circles, eq(circles.assetId, assets.id))
      .where(and(isNotNull(assets.stellarAssetCode), isNotNull(assets.stellarIssuerAccount)));
    const registry = new Map(rows.map((row) => [`${row.stellarAssetCode}|${row.stellarIssuerAccount}`, row]));
    const positions: Position[] = [];
    for (const entry of account.balances) {
      if (!entry.assetCode || !entry.assetIssuer) continue;
      const match = registry.get(`${entry.assetCode}|${entry.assetIssuer}`);
      if (!match) continue;
      const units = stellarToUnits(entry.balance);
      if (units === null || units <= BigInt(0)) continue;
      positions.push({
        assetSlug: match.slug,
        code: match.code,
        network: "Stellar",
        assetClass: match.category,
        assetClassLabel: match.category,
        issuer: match.issuer ?? match.code,
        balance: entry.balance,
        decimals: 7,
        walletSource: "vicus-stellar",
        verificationSource: match.verificationSourceUrl ?? "",
        openHref: `/circles/${match.slug}`,
        actions: await actionsFor(match.slug, "Stellar"),
      });
    }
    return { positions: sortPositions(positions), partial: false };
  } catch (error) {
    if (error instanceof PositionsError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("read stellar positions");
  }
}

/**
 * Solana holdings for an explicitly connected execution wallet. One token
 * balance read per known mint; any failed read marks the result partial
 * rather than silently dropping the asset.
 */
export async function getSolanaPositions(
  wallet: string,
  transport?: SolanaBalanceTransport,
): Promise<PositionResult> {
  const address = typeof wallet === "string" ? wallet.trim() : "";
  if (!BASE58_RE.test(address)) {
    throw new PositionsError("invalid-request", "That Solana wallet address is not valid.", 400);
  }
  const positions: Position[] = [];
  let partial = false;
  for (const entry of SOLANA_REGISTRY) {
    let raw: string | null;
    try {
      raw = await getSolanaTokenBalance(address, entry.mint, transport);
    } catch {
      raw = null;
    }
    if (raw === null) {
      partial = true;
      continue;
    }
    let units: bigint;
    try {
      units = BigInt(raw);
    } catch {
      partial = true;
      continue;
    }
    if (units <= BigInt(0)) continue;
    positions.push({
      assetSlug: entry.slug,
      code: entry.code,
      network: entry.network,
      assetClass: entry.assetClass,
      assetClassLabel: entry.assetClass,
      issuer: entry.code === "USDC" ? "Circle" : "Backed (xStocks)",
      balance: formatSubunits(raw, entry.decimals),
      decimals: entry.decimals,
      walletSource: "connected-solana",
      verificationSource: entry.verificationSource,
      openHref: `/circles/${entry.slug}`,
      actions: await actionsFor(entry.slug, "Solana"),
    });
  }
  return { positions: sortPositions(positions), partial };
}

export type BaseBalanceTransport = {
  ethCall(to: string, data: string): Promise<string | null>;
};

function balanceOfCalldata(owner: string): string {
  return `0x70a08231${"0".repeat(24)}${owner.slice(2).toLowerCase()}`;
}

async function defaultBaseCall(to: string, data: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(ROUTER_BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { result?: unknown } | null;
    return typeof payload?.result === "string" ? payload.result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function formatEvmUnits(raw: string, decimals: number): string | null {
  const match = /^0x[0-9a-fA-F]+$/.exec(raw.trim());
  if (!match) return null;
  try {
    const value = BigInt(raw);
    if (value <= BigInt(0)) return null;
    const base = BigInt(10) ** BigInt(decimals);
    return `${(value / base).toString()}.${(value % base).toString().padStart(decimals, "0")}`;
  } catch {
    return null;
  }
}

/**
 * Base holdings for an explicitly connected execution wallet. One balanceOf
 * call per known contract; failed reads mark the result partial.
 */
export async function getBasePositions(
  wallet: string,
  transport?: BaseBalanceTransport,
  morphoFetch?: MorphoFetch,
): Promise<PositionResult> {
  const address = typeof wallet === "string" ? wallet.trim() : "";
  if (!EVM_ADDRESS_RE.test(address)) {
    throw new PositionsError("invalid-request", "That Base wallet address is not valid.", 400);
  }
  const call = transport?.ethCall ?? defaultBaseCall;
  const positions: Position[] = [];
  let partial = false;
  for (const entry of BASE_REGISTRY) {
    let raw: string | null;
    try {
      raw = await call(entry.contract, balanceOfCalldata(address));
    } catch {
      raw = null;
    }
    if (raw === null) {
      partial = true;
      continue;
    }
    const display = formatEvmUnits(raw, entry.decimals);
    if (!display) continue;
    const position: Position = {
      assetSlug: entry.slug,
      code: entry.code,
      network: entry.network,
      assetClass: entry.assetClass,
      assetClassLabel: entry.assetClass,
      issuer: entry.code === "USDC" ? "Circle" : "Coinbase",
      balance: display,
      decimals: entry.decimals,
      walletSource: "connected-base",
      verificationSource: entry.verificationSource,
      openHref: `/circles/${entry.slug}`,
      actions: await actionsFor(entry.slug, "Base"),
    };
    // Lending V1: attach live Morpho state for the winning collateral only.
    // Anything unreadable is omitted — never a zero-debt claim.
    if (entry.slug === LENDING_COLLATERAL_SLUG) {
      try {
        const state = await getLendingPosition(address, morphoFetch);
        if (state) {
          position.lendingPosition = {
            protocol: LENDING_PROTOCOL,
            marketId: LENDING_MARKET_ID,
            collateralCode: entry.code,
            collateralDisplay: state.collateralDisplay,
            borrowedCode: LENDING_LOAN_CODE,
            borrowedDisplay: state.borrowAssetsDisplay,
            healthFactor: state.healthFactor,
            marketUrl: LENDING_MARKET_URL,
          };
        }
      } catch {
        /* protocol read failed — position stays spot-only */
      }
    }
    positions.push(position);
  }
  return { positions: sortPositions(positions), partial };
}
