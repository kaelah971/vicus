/**
 * P4.2 Unified receipt model — canonical contract over EXISTING flows.
 *
 * Pure additive layer: no I/O, no storage, no behavior change. Each adapter
 * translates one flow's durable record into a CanonicalReceipt without
 * rewriting history — the original `flowStatus` is always preserved.
 *
 * Truth rules (binding):
 * - Prepared is not signed; signed is not submitted; submitted is not settled.
 * - A quote is not a transaction; a source-leg success never proves the
 *   destination leg; a submitted claim never proves payout.
 * - `settled` requires a transaction reference; otherwise the stage is
 *   `unknown`, never success. Missing evidence never becomes success.
 * - Explorer links are built ONLY for allowlisted networks with a
 *   non-empty reference. Anything else yields null, never a guess.
 * - Adapters receive owner-scoped rows and emit no user identifiers.
 */

export const RECEIPT_FLOWS = [
  "send",
  "reward",
  "campaign",
  "access",
  "swap",
  "crosschain",
] as const;

export type ReceiptFlow = (typeof RECEIPT_FLOWS)[number];

export const RECEIPT_STAGES = [
  "initiated",
  "prepared",
  "signed",
  "submitted",
  "settled",
  "failed",
  "unknown",
] as const;

export type ReceiptStage = (typeof RECEIPT_STAGES)[number];

export type ReceiptLeg = {
  /** Human leg label, e.g. "Source burn" or "Destination delivery". */
  label: string;
  network: string;
  txHash: string | null;
  explorerUrl: string | null;
  /** True only when this leg carries its own transaction reference. */
  settled: boolean;
};

export type CanonicalReceipt = {
  /** Stable identifier of the source record (transfer/order/claim id). */
  id: string;
  flow: ReceiptFlow;
  /** Original flow status, verbatim — never rewritten. */
  flowStatus: string;
  stage: ReceiptStage;
  asset: {
    code: string;
    issuer: string | null;
    network: string;
  };
  sourceNetwork: string;
  destinationNetwork: string | null;
  /** Primary transaction reference, when the flow recorded one. */
  txHash: string | null;
  /** Per-leg evidence. Single-leg flows carry exactly one leg. */
  legs: ReceiptLeg[];
  ledger: number | null;
  /** Primary explorer link, allowlisted networks only. */
  explorerUrl: string | null;
  timestamps: {
    createdAt: string | null;
    submittedAt: string | null;
    settledAt: string | null;
  };
  failure: {
    code: string | null;
    message: string | null;
  };
  /** Abbreviated account hint (e.g. "GABC…WXYZ"). Never a full key. */
  walletHint: string | null;
  recovery: {
    retryable: boolean | null;
    /** Idempotency anchor: the source record id. */
    dedupeKey: string | null;
    note: string | null;
  };
};

const EXPLORER_TX_BASE: Record<string, string> = {
  // Mirrors the per-flow constants (SEND_EXPLORER_TX, CAMPAIGN_EXPLORER_TX,
  // SOLANA_EXPLORER_TX, ROUTER_BASE_EXPLORER_TX); centralized, not replaced.
  stellar_mainnet: "https://stellar.expert/explorer/public/tx/",
  public: "https://stellar.expert/explorer/public/tx/",
  stellar_testnet: "https://stellar.expert/explorer/testnet/tx/",
  testnet: "https://stellar.expert/explorer/testnet/tx/",
  solana: "https://explorer.solana.com/tx/",
  base: "https://basescan.org/tx/",
};

/** Explorer link for allowlisted networks only; null otherwise — never a guess. */
export function explorerTxUrl(network: string | null | undefined, hash: string | null | undefined): string | null {
  const base = network ? EXPLORER_TX_BASE[network.trim().toLowerCase()] : undefined;
  const ref = typeof hash === "string" ? hash.trim() : "";
  if (!base || !ref) return null;
  if (!/^[A-Za-z0-9]+$/.test(ref)) return null;
  return `${base}${ref}`;
}

/** Abbreviated account hint. Full keys never leave owner-scoped views. */
export function abbreviateAccount(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 10) return null;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Normalize DB timestamps (Date|string|null) to ISO or null. Invalid → null, never now. */
export function toIso(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? value.toISOString() : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanHash(value: unknown): string | null {
  const text = cleanText(value);
  if (!text || !/^[A-Za-z0-9]+$/.test(text)) return null;
  return text;
}

function makeLeg(label: string, network: string, txHash: string | null): ReceiptLeg {
  return {
    label,
    network,
    txHash,
    explorerUrl: explorerTxUrl(network, txHash),
    settled: txHash !== null,
  };
}

type BaseRow = {
  id: string;
  status: string;
};

function baseReceipt(flow: ReceiptFlow, row: BaseRow): Omit<
  CanonicalReceipt,
  "asset" | "sourceNetwork" | "destinationNetwork" | "txHash" | "legs" | "ledger" | "explorerUrl" | "timestamps" | "failure" | "walletHint" | "recovery"
> & { stage: ReceiptStage } {
  return {
    id: row.id,
    flow,
    flowStatus: row.status,
    stage: "unknown",
  };
}

/** Settled claims require a reference; otherwise the stage stays unknown. */
function requireReference(stage: ReceiptStage, txHash: string | null, note: string): { stage: ReceiptStage; note: string | null } {
  if (stage === "settled" && !txHash) return { stage: "unknown", note };
  return { stage, note: null };
}

// ---------------------------------------------------------------------------
// Flow adapters. Each maps its flow's persisted vocabulary to the canonical
// stages; unrecognized statuses fall through to `unknown` with the original
// preserved in `flowStatus`. No history is reclassified.
// ---------------------------------------------------------------------------

export type SendReceiptRow = BaseRow & {
  network: string;
  assetCode: string;
  assetIssuer?: string | null;
  transactionHash?: string | null;
  ledger?: number | null;
  destinationAddress?: string | null;
  failureReason?: string | null;
  lastError?: string | null;
  createdAt?: string | Date | null;
  confirmedAt?: string | Date | null;
};

/** asset_transfers: draft → prepared → submitted → confirmed | failed. */
export function sendReceipt(row: SendReceiptRow): CanonicalReceipt {
  const txHash = cleanHash(row.transactionHash);
  let stage: ReceiptStage = "unknown";
  if (row.status === "draft") stage = "initiated";
  else if (row.status === "prepared") stage = "prepared";
  else if (row.status === "submitted") stage = "submitted";
  else if (row.status === "confirmed") stage = "settled";
  else if (row.status === "failed") stage = "failed";
  const checked = requireReference(stage, txHash, "Confirmed without a recorded transaction hash.");
  return {
    ...baseReceipt("send", row),
    ...checked,
    asset: { code: row.assetCode, issuer: row.assetIssuer ?? null, network: row.network },
    sourceNetwork: row.network,
    destinationNetwork: null,
    txHash,
    legs: [makeLeg("Stellar payment", row.network, txHash)],
    ledger: typeof row.ledger === "number" ? row.ledger : null,
    explorerUrl: explorerTxUrl(row.network, txHash),
    timestamps: { createdAt: toIso(row.createdAt), submittedAt: null, settledAt: toIso(row.confirmedAt) },
    failure: { code: cleanText(row.failureReason), message: cleanText(row.lastError) },
    walletHint: abbreviateAccount(row.destinationAddress),
    recovery: { retryable: null, dedupeKey: row.id, note: checked.note },
  };
}

export type RewardReceiptRow = BaseRow & {
  network: string;
  asset: string;
  destinationPublicKey?: string | null;
  transactionHash?: string | null;
  ledger?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt?: string | Date | null;
  submittedAt?: string | Date | null;
  confirmedAt?: string | Date | null;
};

/** reward_claims: claimable → submitted → confirmed | failed. Expired is unknown, not failure. */
export function rewardReceipt(row: RewardReceiptRow): CanonicalReceipt {
  const txHash = cleanHash(row.transactionHash);
  let stage: ReceiptStage = "unknown";
  if (row.status === "claimable") stage = "initiated";
  else if (row.status === "submitted") stage = "submitted";
  else if (row.status === "confirmed") stage = "settled";
  else if (row.status === "failed") stage = "failed";
  const checked = requireReference(stage, txHash, "Confirmed without a recorded transaction hash.");
  const expiredNote = row.status === "expired" ? "Reward expired before settlement." : checked.note;
  return {
    ...baseReceipt("reward", row),
    stage: checked.stage,
    asset: { code: row.asset, issuer: null, network: row.network },
    sourceNetwork: row.network,
    destinationNetwork: null,
    txHash,
    legs: [makeLeg("Reward payout", row.network, txHash)],
    ledger: typeof row.ledger === "number" ? row.ledger : null,
    explorerUrl: explorerTxUrl(row.network, txHash),
    timestamps: { createdAt: toIso(row.createdAt), submittedAt: toIso(row.submittedAt), settledAt: toIso(row.confirmedAt) },
    failure: { code: cleanText(row.failureCode), message: cleanText(row.failureMessage) },
    walletHint: abbreviateAccount(row.destinationPublicKey),
    recovery: { retryable: null, dedupeKey: row.id, note: expiredNote },
  };
}

export type CampaignReceiptRow = BaseRow & {
  rewardAsset: string;
  rewardNetwork: string;
  rewardAmount?: string | null;
  destinationPublicKey?: string | null;
  payoutTxHash?: string | null;
  payoutLedger?: number | null;
  lastError?: string | null;
  createdAt?: string | Date | null;
  paidAt?: string | Date | null;
};

/** campaign_completions: reserved → paid | failed. A payout claim is not a payout. */
export function campaignReceipt(row: CampaignReceiptRow): CanonicalReceipt {
  const txHash = cleanHash(row.payoutTxHash);
  let stage: ReceiptStage = "unknown";
  if (row.status === "reserved") stage = "prepared";
  else if (row.status === "paid") stage = "settled";
  else if (row.status === "failed") stage = "failed";
  const checked = requireReference(stage, txHash, "Marked paid without a recorded payout hash.");
  return {
    ...baseReceipt("campaign", row),
    ...checked,
    asset: { code: row.rewardAsset, issuer: null, network: row.rewardNetwork },
    sourceNetwork: row.rewardNetwork,
    destinationNetwork: null,
    txHash,
    legs: [makeLeg("Campaign payout", row.rewardNetwork, txHash)],
    ledger: typeof row.payoutLedger === "number" ? row.payoutLedger : null,
    explorerUrl: explorerTxUrl(row.rewardNetwork, txHash),
    timestamps: { createdAt: toIso(row.createdAt), submittedAt: null, settledAt: toIso(row.paidAt) },
    failure: { code: null, message: cleanText(row.lastError) },
    walletHint: abbreviateAccount(row.destinationPublicKey),
    recovery: { retryable: null, dedupeKey: row.id, note: checked.note },
  };
}

export type AccessReceiptRow = BaseRow & {
  sourceNetwork: string;
  destinationNetwork: string;
  venue?: string | null;
  approvalHash?: string | null;
  swapHash?: string | null;
  targetAmount?: string | null;
  destinationUsdcAmount?: string | null;
  executionWallet?: string | null;
  failureReason?: string | null;
  lastError?: string | null;
  createdAt?: string | Date | null;
  completedAt?: string | Date | null;
};

/**
 * asset_access_orders: a quote is not a transaction (draft/routing/quoting
 * stay initiated); an approval signature is `signed` only before any swap;
 * `completed` settles only with a recorded swap result.
 */
export function accessReceipt(row: AccessReceiptRow): CanonicalReceipt {
  const swapHash = cleanHash(row.swapHash);
  const approvalHash = cleanHash(row.approvalHash);
  let stage: ReceiptStage = "unknown";
  if (row.status === "draft" || row.status === "routing" || row.status === "quoting") stage = "initiated";
  else if (row.status === "approval_required" || row.status === "ready_to_swap" || row.status === "bridging") stage = "prepared";
  else if (row.status === "swapping" || row.status === "destination_funded") stage = "submitted";
  else if (row.status === "completed") stage = "settled";
  else if (row.status === "failed") stage = "failed";
  if (approvalHash && !swapHash && stage === "initiated") stage = "signed";
  if (swapHash && (stage === "initiated" || stage === "prepared")) stage = "submitted";
  const settledEvidence = cleanText(row.targetAmount) ?? cleanText(row.destinationUsdcAmount);
  const checked =
    stage === "settled" && (!swapHash || !settledEvidence)
      ? { stage: "unknown" as ReceiptStage, note: "Marked completed without a recorded swap result." }
      : { stage, note: null as string | null };
  return {
    ...baseReceipt("access", row),
    ...checked,
    asset: { code: "USDC", issuer: null, network: row.sourceNetwork },
    sourceNetwork: row.sourceNetwork,
    destinationNetwork: row.destinationNetwork,
    txHash: swapHash,
    legs: [
      makeLeg("Stellar funding route", row.sourceNetwork, null),
      makeLeg(`Acquisition swap${row.venue ? ` (${row.venue})` : ""}`, row.destinationNetwork, swapHash),
    ],
    ledger: null,
    explorerUrl: explorerTxUrl(row.destinationNetwork, swapHash),
    timestamps: { createdAt: toIso(row.createdAt), submittedAt: null, settledAt: toIso(row.completedAt) },
    failure: { code: cleanText(row.failureReason), message: cleanText(row.lastError) },
    walletHint: abbreviateAccount(row.executionWallet),
    recovery: { retryable: null, dedupeKey: row.id, note: checked.note },
  };
}

export type SwapReceiptRow = BaseRow & {
  actionKind: string;
  sourceNetwork?: string | null;
  destinationNetwork: string;
  venue?: string | null;
  swapSignature?: string | null;
  targetAmount?: string | null;
  executionWallet?: string | null;
  failureReason?: string | null;
  lastError?: string | null;
  createdAt?: string | Date | null;
  completedAt?: string | Date | null;
};

/** external_utility_orders (swap/exit): signature means submitted, never settled by itself. */
export function swapReceipt(row: SwapReceiptRow): CanonicalReceipt {
  const txHash = cleanHash(row.swapSignature);
  let stage: ReceiptStage = "unknown";
  if (row.status === "draft" || row.status === "quoting") stage = "initiated";
  else if (row.status === "ready") stage = "prepared";
  else if (row.status === "submitted") stage = "submitted";
  else if (row.status === "confirmed") stage = "settled";
  else if (row.status === "failed") stage = "failed";
  const checked = requireReference(stage, txHash, "Marked confirmed without a recorded swap signature.");
  return {
    ...baseReceipt("swap", row),
    ...checked,
    asset: { code: row.actionKind, issuer: null, network: row.destinationNetwork },
    sourceNetwork: row.sourceNetwork ?? row.destinationNetwork,
    destinationNetwork: row.destinationNetwork,
    txHash,
    legs: [makeLeg(`${row.actionKind} swap${row.venue ? ` (${row.venue})` : ""}`, row.destinationNetwork, txHash)],
    ledger: null,
    explorerUrl: explorerTxUrl(row.destinationNetwork, txHash),
    timestamps: { createdAt: toIso(row.createdAt), submittedAt: null, settledAt: toIso(row.completedAt) },
    failure: { code: cleanText(row.failureReason), message: cleanText(row.lastError) },
    walletHint: abbreviateAccount(row.executionWallet),
    recovery: { retryable: null, dedupeKey: row.id, note: checked.note },
  };
}

export type CrosschainReceiptRow = BaseRow & {
  sourceNetwork: string;
  destinationNetwork: string;
  asset?: string | null;
  sourceTxHash?: string | null;
  destinationTxHash?: string | null;
  retryable?: boolean | null;
  lastError?: string | null;
  createdAt?: string | Date | null;
  completedAt?: string | Date | null;
};

/**
 * crosschain_transfers: source-leg success never proves destination
 * completion. `completed` settles only with a destination reference;
 * legs stay independently verifiable.
 */
export function crosschainReceipt(row: CrosschainReceiptRow): CanonicalReceipt {
  const sourceTx = cleanHash(row.sourceTxHash);
  const destTx = cleanHash(row.destinationTxHash);
  let stage: ReceiptStage = "unknown";
  if (row.status === "draft") stage = "initiated";
  else if (row.status === "approving" || row.status === "burn_pending") stage = "prepared";
  else if (row.status === "burned" || row.status === "attesting" || row.status === "forwarding") stage = "submitted";
  else if (row.status === "completed") stage = "settled";
  else if (row.status === "failed") stage = "failed";
  const checked =
    stage === "settled" && !destTx
      ? { stage: "unknown" as ReceiptStage, note: "Marked completed without a destination transaction reference." }
      : { stage, note: null as string | null };
  return {
    ...baseReceipt("crosschain", row),
    ...checked,
    asset: { code: row.asset ?? "USDC", issuer: null, network: row.sourceNetwork },
    sourceNetwork: row.sourceNetwork,
    destinationNetwork: row.destinationNetwork,
    txHash: destTx ?? sourceTx,
    legs: [
      makeLeg("Source burn", row.sourceNetwork, sourceTx),
      makeLeg("Destination delivery", row.destinationNetwork, destTx),
    ],
    ledger: null,
    explorerUrl: explorerTxUrl(row.destinationNetwork, destTx) ?? explorerTxUrl(row.sourceNetwork, sourceTx),
    timestamps: { createdAt: toIso(row.createdAt), submittedAt: null, settledAt: toIso(row.completedAt) },
    failure: { code: null, message: cleanText(row.lastError) },
    walletHint: null,
    recovery: { retryable: row.retryable ?? null, dedupeKey: row.id, note: checked.note },
  };
}
