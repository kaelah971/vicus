import "server-only";
import { isAssetCircle, listCircles } from "@/lib/data/circles";
import { UTILITY_INTENTS, type UtilityIntent } from "@/lib/utility-discovery/intents";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import { compareCompassOrder, eligibilityForSheetAction } from "@/lib/asset-actions/eligibility";
import { listLiveCampaigns } from "@/lib/campaigns/service";
import { getStellarPositions } from "@/lib/positions/service";

/**
 * Earn / Use Discovery V1 — verified utility across the asset universe.
 * Every opportunity derives from the Action Engine, lifecycle-backed
 * capabilities already inside engine output, or live campaigns. Nothing is
 * invented: no APYs, no TVL, no "best" labels. Stellar leads; connected
 * ecosystems extend below. Holding personalization is a private boolean —
 * never a balance.
 */

export type { UtilityIntent };
export { UTILITY_INTENTS };

export type UtilityOpportunity = {
  id: string;
  assetSlug: string;
  assetCode: string;
  assetName: string;
  assetClassLabel: string;
  issuer: string;
  network: string;
  ecosystem: string;
  kind: string;
  intent: UtilityIntent;
  title: string;
  description: string;
  executionMode: string;
  state: string;
  stateLabel: string;
  href: string;
  sourceUrl: string;
  eligibilityNote: string | null;
  eligibilityState: "available" | "unavailable" | "unknown";
  eligibilityExplanation: string | null;
  eligibilityNextStep: { label: string; href: string } | null;
  eligibilityAlternative: { title: string; href: string; why: string } | null;
  /** Private holding flag — true only for the signed-in owner's assets. */
  held: boolean;
  campaign: {
    rewardAsset: string;
    rewardPerCompletion: string | null;
    status: string;
  } | null;
};

export type UtilityDiscovery = {
  stellar: UtilityOpportunity[];
  beyond: UtilityOpportunity[];
  counts: { stellar: number; beyond: number };
};

function intentForKind(kind: string): UtilityIntent {
  switch (kind) {
    case "access":
    case "swap":
      return "access";
    case "send":
    case "transfer":
    case "move":
      return "send";
    case "borrow":
    case "collateral":
      return "borrow";
    case "earn":
    case "supply":
      return "earn";
    case "redeem":
      return "redeem";
    case "exit":
    case "cash_out":
      return "exit";
    case "campaign-reward":
      return "rewards";
    default:
      return "use";
  }
}

export function modeLabel(executionMode: string, state: string): string {
  if (state === "available" && executionMode === "vicus") return "LIVE IN VICUS";
  if (executionMode === "connected") return "CONNECTED";
  if (executionMode === "official") return "OFFICIAL";
  if (state === "permissioned") return "PERMISSIONED";
  return state.toUpperCase();
}

export async function getUtilityDiscovery(
  userId?: string | null,
  sessionStellarWallet?: string | null,
): Promise<UtilityDiscovery> {
  const circles = (await listCircles(userId ?? null)).filter(isAssetCircle);

  let heldSlugs = new Set<string>();
  if (userId && sessionStellarWallet && /^G[A-Z2-7]{55}$/.test(sessionStellarWallet)) {
    try {
      const { positions } = await getStellarPositions(sessionStellarWallet);
      heldSlugs = new Set(positions.map((position) => position.assetSlug));
    } catch {
      heldSlugs = new Set();
    }
  }

  const [engineLists, liveCampaigns] = await Promise.all([
    Promise.all(
      circles.map((circle) => resolveAssetActions(circle.slug, circle.network).catch(() => [])),
    ),
    listLiveCampaigns().catch(() => []),
  ]);
  const campaignsBySlug = new Map<string, typeof liveCampaigns>();
  for (const campaign of liveCampaigns) {
    const list = campaignsBySlug.get(campaign.circleSlug) ?? [];
    list.push(campaign);
    campaignsBySlug.set(campaign.circleSlug, list);
  }

  const stellar: UtilityOpportunity[] = [];
  const beyond: UtilityOpportunity[] = [];
  const viewerSession = { signedIn: !!userId, walletPublicKey: sessionStellarWallet ?? null };
  circles.forEach((circle, index) => {
    const actions = engineLists[index] ?? [];
    const bucket = circle.ecosystem === "stellar" ? stellar : beyond;
    for (const action of actions) {
      // Engine truth only: every row below is a resolved action or a live
      // campaign. Gated states render with their real labels, never hidden.
      // P2.1 Compass: one deterministic eligibility annotation per action.
      const eligibility = eligibilityForSheetAction(
        {
          assetSlug: circle.slug,
          kind: action.kind,
          state: action.state,
          executionMode: action.executionMode,
          network: action.network,
          eligibilityNote: action.eligibilityNote,
          href: action.href,
          siblings: actions.map((sibling) => ({
            kind: sibling.kind,
            title: sibling.title,
            state: sibling.state,
            executionMode: sibling.executionMode,
            href: sibling.href,
          })),
        },
        viewerSession,
      );
      bucket.push({
        id: `${circle.slug}:${action.kind}`,
        assetSlug: circle.slug,
        assetCode: circle.code,
        assetName: circle.name,
        assetClassLabel: circle.assetClassLabel ?? circle.category,
        issuer: circle.issuerSource,
        network: action.network,
        ecosystem: circle.ecosystem,
        kind: action.kind,
        intent: intentForKind(action.kind),
        title: `${circle.code} — ${action.title}`,
        description: action.description,
        executionMode: action.executionMode,
        state: action.state,
        stateLabel: `${modeLabel(action.executionMode, action.state)} · ${action.stateLabel}`,
        href: action.href,
        sourceUrl: action.sourceUrl,
        eligibilityNote: action.eligibilityNote,
        eligibilityState: eligibility.state,
        eligibilityExplanation: eligibility.explanation,
        eligibilityNextStep: eligibility.nextAction,
        eligibilityAlternative: eligibility.alternative
          ? {
              title: eligibility.alternative.title,
              href: eligibility.alternative.href,
              why: eligibility.alternative.whySupported,
            }
          : null,
        held: heldSlugs.has(circle.slug),
        campaign: null,
      });
    }
    for (const campaign of campaignsBySlug.get(circle.slug) ?? []) {
      bucket.push({
        id: `${circle.slug}:campaign:${campaign.id}`,
        assetSlug: circle.slug,
        assetCode: circle.code,
        assetName: circle.name,
        assetClassLabel: circle.assetClassLabel ?? circle.category,
        issuer: circle.issuerSource,
        network: circle.network,
        ecosystem: circle.ecosystem,
        kind: "campaign-reward",
        intent: "rewards",
        title: `${circle.code} — Verified action reward`,
        description: `${campaign.objective} — earn ${campaign.rewardPerCompletion ?? "?"} ${campaign.rewardAsset} after verified completion. Funded on Stellar.`,
        executionMode: "vicus",
        state: campaign.status === "active" ? "available" : "permissioned",
        stateLabel: campaign.status === "active" ? "LIVE IN VICUS · Active campaign" : `${campaign.status} campaign`,
        href: `/campaigns/${campaign.id}`,
        sourceUrl: "",
        eligibilityNote: null,
        eligibilityState: "unknown",
        eligibilityExplanation:
          "Unknown until you open the campaign — rewards pay only after verified completion of its mission. Nothing is pre-approved.",
        eligibilityNextStep: null,
        eligibilityAlternative: null,
        held: heldSlugs.has(circle.slug),
        campaign: {
          rewardAsset: campaign.rewardAsset,
          rewardPerCompletion: campaign.rewardPerCompletion,
          status: campaign.status,
        },
      });
    }
  });

  // P2.3 Compass ordering: verdict rank first (available → unknown →
  // unavailable), then asset slug, then kind. Deterministic and stable;
  // session-driven state changes reorder honestly. `held` is intentionally
  // NOT a rank input — holdings never imply action eligibility.
  const sortBucket = (items: UtilityOpportunity[]) =>
    [...items].sort((a, b) =>
      compareCompassOrder(
        { eligibilityState: a.eligibilityState, assetSlug: a.assetSlug, kind: a.kind },
        { eligibilityState: b.eligibilityState, assetSlug: b.assetSlug, kind: b.kind },
      ),
    );
  const stellarSorted = sortBucket(stellar);
  const beyondSorted = sortBucket(beyond);
  return {
    stellar: stellarSorted,
    beyond: beyondSorted,
    counts: { stellar: stellarSorted.length, beyond: beyondSorted.length },
  };
}
