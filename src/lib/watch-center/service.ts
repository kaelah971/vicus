import "server-only";
import { listCircles } from "@/lib/data/circles";
import { listWatchedCircleIds } from "@/lib/data/watch";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import {
  listMyAccessOrders,
  type AccessOrderView,
} from "@/lib/asset-access/service";
import { listMyAccessTransfers, type AccessTransferView } from "@/lib/access/service";
import {
  listMyExitOrders,
  listMyUtilityOrders,
  type ExitOrderView,
  type UtilityOrderView,
} from "@/lib/external-utility/service";
import { listMySendTransfers, type SendTransferView } from "@/lib/send/service";

/**
 * Watch Center V1 — read-only operational home. Aggregates real,
 * owner-scoped records (watches, swaps, exits, access orders, CCTP
 * transfers, sends) into a normalized activity model. No new table, no
 * balances, no P&L, no risk metrics — watching is not owning.
 */

export type WatchStateGroup = "needs-attention" | "active" | "completed";

export type WatchActivity = {
  id: string;
  kind: "swap" | "exit" | "access-order" | "cctp-transfer" | "send";
  title: string;
  asset: string;
  network: string;
  status: string;
  stateGroup: WatchStateGroup;
  /** Machine-readable next step, or null when there is nothing to do. */
  actionRequired: string | null;
  retryable: boolean;
  /** Canonical existing route, or null when no continuation exists. */
  href: string | null;
  /** Human-readable status line. Never financial data. */
  detail: string;
  createdAt: string;
  updatedAt: string;
};

export type WatchedAssetAction = {
  kind: string;
  title: string;
  state: string;
  stateLabel: string;
  href: string;
};

export type WatchedAsset = {
  slug: string;
  name: string;
  code: string;
  assetClass: string;
  assetClassLabel: string;
  ecosystem: string;
  network: string;
  issuer: string;
  summary: string;
  openHref: string;
  actions: WatchedAssetAction[];
};

export type WatchCenter = {
  watching: WatchedAsset[];
  needsAttention: WatchActivity[];
  active: WatchActivity[];
  completed: WatchActivity[];
  counts: { watching: number; needsAttention: number; active: number; completed: number };
};

export class WatchCenterError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "unavailable",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function requireUserId(userId: string | null | undefined): string {
  if (!userId || !UUID_RE.test(userId)) {
    throw new WatchCenterError("unauthenticated", "Sign in to open Watch Center.", 401);
  }
  return userId;
}

function baseActivity(
  entry: Partial<WatchActivity> & Pick<WatchActivity, "id" | "kind" | "title" | "createdAt" | "updatedAt">,
): WatchActivity {
  return {
    asset: "",
    network: "",
    status: "",
    stateGroup: "active",
    actionRequired: null,
    retryable: false,
    href: null,
    detail: "",
    ...entry,
  };
}

function swapActivity(order: UtilityOrderView): WatchActivity {
  const href = `/swap/${order.targetSlug}`;
  if (order.status === "confirmed") {
    return baseActivity({
      id: `swap:${order.id}`, kind: "swap", title: "AAPLx acquisition",
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: "completed", detail: `Acquired ${order.targetAmount ?? ""} ${order.targetCode} with Solana USDC.`.trim(),
      href, createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "ready") {
    return baseActivity({
      id: `swap:${order.id}`, kind: "swap", title: "AAPLx acquisition",
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: "needs-attention", actionRequired: "sign-with-wallet", retryable: true,
      href, detail: "Quote ready — waiting for your signature.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "submitted") {
    const proven = order.failureReason !== "verification-failed";
    return baseActivity({
      id: `swap:${order.id}`, kind: "swap", title: "AAPLx acquisition",
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: proven ? "active" : "needs-attention",
      actionRequired: proven ? "wait-confirmation" : "review-and-retry",
      retryable: true, href,
      detail: proven ? "Submitted — waiting for onchain confirmation." : "Signature did not prove the route — review and retry.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  const needsQuote = order.status === "draft" || order.failureReason === "quote-unavailable";
  return baseActivity({
    id: `swap:${order.id}`, kind: "swap", title: "AAPLx acquisition",
    asset: order.targetCode, network: order.destinationNetwork, status: order.status,
    stateGroup: needsQuote ? "needs-attention" : "active",
    actionRequired: order.status === "draft" ? "request-quote" : needsQuote ? "refresh-quote" : "wait-for-price",
    retryable: true, href,
    detail: needsQuote ? "No live price yet — refresh the quote." : "Waiting for a live price.",
    createdAt: order.createdAt, updatedAt: order.updatedAt,
  });
}

function exitActivity(order: ExitOrderView): WatchActivity {
  const href = `/exit/aaplx-on-solana`;
  if (order.status === "confirmed") {
    return baseActivity({
      id: `exit:${order.id}`, kind: "exit", title: "AAPLx exit",
      asset: "AAPLx", network: order.destinationNetwork, status: order.status,
      stateGroup: "completed", detail: "Completed to Solana USDC. Return to Stellar is not available yet — funds stay in your Solana wallet.", href,
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "ready") {
    return baseActivity({
      id: `exit:${order.id}`, kind: "exit", title: "AAPLx exit",
      asset: "AAPLx", network: order.destinationNetwork, status: order.status,
      stateGroup: "needs-attention", actionRequired: "sign-with-wallet", retryable: true,
      href, detail: "Exit ready — waiting for your signature.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "submitted") {
    const proven = order.failureReason !== "verification-failed";
    return baseActivity({
      id: `exit:${order.id}`, kind: "exit", title: "AAPLx exit",
      asset: "AAPLx", network: order.destinationNetwork, status: order.status,
      stateGroup: proven ? "active" : "needs-attention",
      actionRequired: proven ? "wait-confirmation" : "review-and-retry",
      retryable: true, href,
      detail: proven ? "Submitted — waiting for onchain confirmation." : "Signature did not prove the exit — review and retry.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  const needsQuote = order.status === "draft" || order.failureReason === "quote-unavailable";
  return baseActivity({
    id: `exit:${order.id}`, kind: "exit", title: "AAPLx exit",
    asset: "AAPLx", network: order.destinationNetwork, status: order.status,
    stateGroup: needsQuote ? "needs-attention" : "active",
    actionRequired: needsQuote ? "refresh-quote" : "wait-for-price",
    retryable: true, href,
    detail: needsQuote ? "No live exit price yet — refresh the quote." : "Waiting for a live exit price.",
    createdAt: order.createdAt, updatedAt: order.updatedAt,
  });
}

function accessOrderActivity(order: AccessOrderView): WatchActivity {
  const gated = !order.executionEnabled;
  const href = gated ? null : `/acquire/${order.targetSlug}`;
  if (order.status === "completed") {
    return baseActivity({
      id: `access-order:${order.id}`, kind: "access-order", title: `${order.targetCode} access`,
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: "completed", detail: "Access completed.", href: `/acquire/${order.targetSlug}`,
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "destination_funded") {
    return baseActivity({
      id: `access-order:${order.id}`, kind: "access-order", title: `${order.targetCode} access`,
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: "needs-attention",
      actionRequired: gated ? "unavailable-gated" : "continue-acquisition",
      retryable: false, href,
      detail: gated
        ? "Destination funded — acquisition unavailable (no venue liquidity yet)."
        : "Destination funded — continue the acquisition.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "failed") {
    return baseActivity({
      id: `access-order:${order.id}`, kind: "access-order", title: `${order.targetCode} access`,
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: "needs-attention", actionRequired: "review-and-retry", retryable: true,
      href, detail: order.lastError ?? "The access order failed — review and retry.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  if (order.status === "approval_required" || order.status === "ready_to_swap") {
    return baseActivity({
      id: `access-order:${order.id}`, kind: "access-order", title: `${order.targetCode} access`,
      asset: order.targetCode, network: order.destinationNetwork, status: order.status,
      stateGroup: "needs-attention",
      actionRequired: order.status === "approval_required" ? "approve-spend" : "sign-with-wallet",
      retryable: true, href,
      detail: order.status === "approval_required" ? "Waiting for token approval." : "Ready — waiting for your signature.",
      createdAt: order.createdAt, updatedAt: order.updatedAt,
    });
  }
  return baseActivity({
    id: `access-order:${order.id}`, kind: "access-order", title: `${order.targetCode} access`,
    asset: order.targetCode, network: order.destinationNetwork, status: order.status,
    stateGroup: "active", actionRequired: "wait-for-route", retryable: true, href,
    detail: "Route in progress.",
    createdAt: order.createdAt, updatedAt: order.updatedAt,
  });
}

function cctpActivity(transfer: AccessTransferView): WatchActivity {
  const testnet = transfer.environment === "testnet" ? " (Testnet)" : "";
  if (transfer.status === "completed") {
    return baseActivity({
      id: `cctp:${transfer.id}`, kind: "cctp-transfer",
      title: `USDC cross-chain${testnet}`,
      asset: transfer.asset, network: transfer.destinationNetwork, status: transfer.status,
      stateGroup: "completed", detail: `Delivered to ${transfer.destinationLabel}${testnet}.`, href: "/access",
      createdAt: transfer.createdAt, updatedAt: transfer.updatedAt,
    });
  }
  if (transfer.status === "failed") {
    return baseActivity({
      id: `cctp:${transfer.id}`, kind: "cctp-transfer",
      title: `USDC cross-chain${testnet}`,
      asset: transfer.asset, network: transfer.destinationNetwork, status: transfer.status,
      stateGroup: "needs-attention", actionRequired: "review-and-retry", retryable: transfer.retryable,
      href: "/access", detail: transfer.lastError ?? "The transfer failed — review and retry.",
      createdAt: transfer.createdAt, updatedAt: transfer.updatedAt,
    });
  }
  if (transfer.status === "draft" || transfer.status === "approving" || transfer.status === "burn_pending") {
    return baseActivity({
      id: `cctp:${transfer.id}`, kind: "cctp-transfer",
      title: `USDC cross-chain${testnet}`,
      asset: transfer.asset, network: transfer.destinationNetwork, status: transfer.status,
      stateGroup: "needs-attention", actionRequired: "sign-with-wallet", retryable: true,
      href: "/access", detail: "Ready — waiting for your burn signature.",
      createdAt: transfer.createdAt, updatedAt: transfer.updatedAt,
    });
  }
  const stage =
    transfer.status === "attesting" ? "Waiting for Circle attestation." : "Forwarding to the destination.";
  return baseActivity({
    id: `cctp:${transfer.id}`, kind: "cctp-transfer",
    title: `USDC cross-chain${testnet}`,
    asset: transfer.asset, network: transfer.destinationNetwork, status: transfer.status,
    stateGroup: "active", actionRequired: "wait-for-delivery", retryable: true,
    href: "/access", detail: stage,
    createdAt: transfer.createdAt, updatedAt: transfer.updatedAt,
  });
}

function sendActivity(transfer: SendTransferView): WatchActivity {
  const who = transfer.destinationHandle ? `@${transfer.destinationHandle}` : "recipient";
  if (transfer.status === "confirmed") {
    return baseActivity({
      id: `send:${transfer.id}`, kind: "send",
      title: `${transfer.assetCode} → ${who}`,
      asset: transfer.assetCode, network: transfer.network, status: transfer.status,
      stateGroup: "completed", detail: "Transfer confirmed.", href: "/send",
      createdAt: transfer.createdAt, updatedAt: transfer.confirmedAt ?? transfer.createdAt,
    });
  }
  if (transfer.status === "failed") {
    return baseActivity({
      id: `send:${transfer.id}`, kind: "send",
      title: `${transfer.assetCode} → ${who}`,
      asset: transfer.assetCode, network: transfer.network, status: transfer.status,
      stateGroup: "needs-attention", actionRequired: "review-and-retry", retryable: true,
      href: "/send", detail: transfer.lastError ?? "The transfer failed — review and retry.",
      createdAt: transfer.createdAt, updatedAt: transfer.createdAt,
    });
  }
  if (transfer.status === "submitted") {
    return baseActivity({
      id: `send:${transfer.id}`, kind: "send",
      title: `${transfer.assetCode} → ${who}`,
      asset: transfer.assetCode, network: transfer.network, status: transfer.status,
      stateGroup: "active", actionRequired: "wait-confirmation", retryable: true,
      href: "/send", detail: "Submitted — waiting for confirmation.",
      createdAt: transfer.createdAt, updatedAt: transfer.createdAt,
    });
  }
  return baseActivity({
    id: `send:${transfer.id}`, kind: "send",
    title: `${transfer.assetCode} → ${who}`,
    asset: transfer.assetCode, network: transfer.network, status: transfer.status,
    stateGroup: "needs-attention", actionRequired: "continue-send", retryable: true,
    href: "/send", detail: "Draft — continue the send.",
    createdAt: transfer.createdAt, updatedAt: transfer.createdAt,
  });
}

function sortActivities(items: WatchActivity[]): WatchActivity[] {
  return [...items].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

/** Operational home: watches + normalized owner activity. Read-only. */
export async function getWatchCenter(userId: string | null | undefined): Promise<WatchCenter> {
  const owner = requireUserId(userId);
  const [watchedIds, swaps, exits, accessOrders, cctp, sends] = await Promise.all([
    listWatchedCircleIds(owner),
    listMyUtilityOrders(owner),
    listMyExitOrders(owner),
    listMyAccessOrders(owner),
    listMyAccessTransfers(owner),
    listMySendTransfers(owner),
  ]);

  const watching: WatchedAsset[] = [];
  // Resolve watched circles through the public loader (no raw rows).
  const all = await listCircles(owner);
  const byId = new Map(all.map((circle) => [circle.id, circle]));
  for (const circleId of watchedIds.slice(0, 25)) {
    const record = byId.get(circleId);
    if (!record || record.state === "education") continue;
    const actions = await resolveAssetActions(record.slug, record.network);
    watching.push({
      slug: record.slug,
      name: record.name,
      code: record.code,
      assetClass: record.category,
      assetClassLabel: record.assetClassLabel ?? record.category,
      ecosystem: record.ecosystem,
      network: record.network,
      issuer: record.issuerSource,
      summary: record.summary,
      openHref: `/circles/${record.slug}`,
      actions: actions.slice(0, 3).map((action) => ({
        kind: action.kind,
        title: action.title,
        state: action.state,
        stateLabel: action.stateLabel,
        href: action.href,
      })),
    });
  }
  watching.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

  const activities: WatchActivity[] = [
    ...swaps.map(swapActivity),
    ...exits.map(exitActivity),
    ...accessOrders.map(accessOrderActivity),
    ...cctp.map(cctpActivity),
    ...sends.map(sendActivity),
  ];
  const needsAttention = sortActivities(activities.filter((a) => a.stateGroup === "needs-attention")).slice(0, 25);
  const active = sortActivities(activities.filter((a) => a.stateGroup === "active")).slice(0, 25);
  const completed = sortActivities(activities.filter((a) => a.stateGroup === "completed")).slice(0, 20);

  return {
    watching,
    needsAttention,
    active,
    completed,
    counts: {
      watching: watching.length,
      needsAttention: needsAttention.length,
      active: active.length,
      completed: completed.length,
    },
  };
}
