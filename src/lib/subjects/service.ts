import "server-only";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import { assets, circles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSubjectDef, getSubjectForAsset, type SubjectDef } from "@/lib/subjects/config";
import { getCircleLifecycle } from "@/lib/lifecycle/service";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import type { ResolvedAssetAction } from "@/lib/asset-actions/config";

/**
 * Subject read model. Every field below comes from shared loaders — the
 * asset registry, lifecycle, and the Action Engine — so Compare and subject
 * pages can never disagree with asset pages. Unknown identifiers resolve to
 * an explicit "not published" marker, never a fabrication.
 */

export type RepresentationView = {
  assetSlug: string;
  code: string;
  name: string;
  network: string;
  ecosystem: string;
  issuer: string;
  assetClass: string;
  assetClassLabel: string;
  contractOrMint: string | null;
  eligibilityNote: string | null;
  officialUrl: string | null;
  verificationSourceUrl: string;
  representation: string;
  lifecycleStages: string[];
  actions: ResolvedAssetAction[];
  /** Engine kinds currently in an available state. */
  availableKinds: string[];
  openHref: string;
};

export type SubjectView = {
  slug: string;
  type: SubjectDef["type"];
  name: string;
  description: string;
  sourceUrl: string;
  hasStellarRepresentation: boolean;
  representations: RepresentationView[];
};

export type CompareRow = { field: string; values: string[] };

export class SubjectsError extends Error {
  constructor(
    public readonly code: "not-found" | "invalid-request",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

const UNKNOWN = "Not published in Vicus source set";

async function loadRepresentation(assetSlug: string): Promise<RepresentationView | null> {
  const database = getDatabase();
  const [row] = await database
    .select({ circle: circles, asset: assets })
    .from(circles)
    .leftJoin(assets, eq(circles.assetId, assets.id))
    .where(eq(circles.slug, assetSlug))
    .limit(1);
  if (!row) return null;
  const network = row.asset?.chain ?? "Stellar";
  const actions = await resolveAssetActions(assetSlug, network);
  const lifecycle = await getCircleLifecycle(assetSlug).catch(() => []);
  return {
    assetSlug,
    code: row.asset?.code ?? row.circle.name,
    name: row.circle.name,
    network,
    ecosystem: row.asset?.ecosystem ?? "stellar",
    issuer: row.asset?.issuer ?? UNKNOWN,
    assetClass: row.circle.category,
    assetClassLabel: row.circle.category,
    contractOrMint: row.asset?.stellarContractId ?? null,
    eligibilityNote: row.asset?.eligibilityNote ?? null,
    officialUrl: row.asset?.officialUrl ?? null,
    verificationSourceUrl: row.asset?.verificationSourceUrl ?? row.asset?.officialUrl ?? "",
    representation: row.asset?.description ?? row.circle.tagline ?? "",
    lifecycleStages: lifecycle.map((step) => step.stage),
    actions,
    availableKinds: actions.filter((action) => action.state === "available").map((action) => action.kind),
    openHref: `/circles/${assetSlug}`,
  };
}

export async function getSubjectView(slug: string): Promise<SubjectView> {
  const def = getSubjectDef(slug.trim());
  if (!def) throw new SubjectsError("not-found", "That subject could not be found.", 404);
  try {
    const representations: RepresentationView[] = [];
    for (const assetSlug of def.representations) {
      const view = await loadRepresentation(assetSlug);
      if (view) representations.push(view);
    }
    return {
      slug: def.slug,
      type: def.type,
      name: def.name,
      description: def.description,
      sourceUrl: def.sourceUrl,
      hasStellarRepresentation: representations.some((rep) => rep.ecosystem === "stellar"),
      representations,
    };
  } catch (error) {
    if (error instanceof SubjectsError) throw error;
    throw toDatabaseUnavailableError("read subject");
  }
}

function actionState(actions: ResolvedAssetAction[], kind: string): string {
  const match = actions.find((action) => action.kind === kind);
  if (!match) return "—";
  if (match.state === "available") return `Available — ${match.stateLabel}`;
  if (match.state === "permissioned") return `Permissioned — ${match.stateLabel}`;
  return match.stateLabel;
}

function walletFor(rep: RepresentationView): string {
  if (rep.ecosystem === "stellar") return "Stellar wallet (Vicus identity)";
  if (rep.ecosystem === "solana") return "Connected Solana wallet";
  if (rep.ecosystem === "base") return "Connected Base wallet";
  return "Connected wallet";
}

/** Two-asset comparison built only from shared truth — no static claims. */
export async function compareRepresentations(aSlug: string, bSlug: string): Promise<{ left: RepresentationView; right: RepresentationView; rows: CompareRow[] }> {
  const [left, right] = await Promise.all([loadRepresentation(aSlug.trim()), loadRepresentation(bSlug.trim())]);
  if (!left || !right) throw new SubjectsError("not-found", "Both compared assets must exist in Vicus.", 404);
  if (left.assetSlug === right.assetSlug) {
    throw new SubjectsError("invalid-request", "Compare two different representations.", 400);
  }
  const accessValue = (rep: RepresentationView): string => {
    const kinds = rep.availableKinds;
    if (kinds.includes("access")) return `Executable — ${rep.actions.find((a) => a.kind === "access")?.stateLabel ?? ""}`.trim();
    if (kinds.includes("swap")) return `Executable via swap — ${rep.actions.find((a) => a.kind === "swap")?.stateLabel ?? ""}`.trim();
    const gated = rep.actions.find((a) => a.kind === "access");
    return gated ? `Gated — ${gated.stateLabel}` : "No verified access route";
  };
  const rows: CompareRow[] = [
    { field: "Representation", values: [left.code, right.code] },
    { field: "Network", values: [left.network, right.network] },
    { field: "Issuer / product", values: [left.issuer, right.issuer] },
    { field: "Contract / mint", values: [left.contractOrMint ?? UNKNOWN, right.contractOrMint ?? UNKNOWN] },
    { field: "Asset class", values: [left.assetClass, right.assetClass] },
    { field: "Access", values: [accessValue(left), accessValue(right)] },
    { field: "Send / transfer", values: [actionState(left.actions, "send"), actionState(right.actions, "send")] },
    { field: "Use", values: [left.lifecycleStages.includes("use") ? "Documented lifecycle use" : "—", right.lifecycleStages.includes("use") ? "Documented lifecycle use" : "—"] },
    { field: "Borrow / collateral", values: [actionState(left.actions, "borrow"), actionState(right.actions, "borrow")] },
    { field: "Exit / redeem", values: [actionState(left.actions, "exit") !== "—" ? actionState(left.actions, "exit") : actionState(left.actions, "redeem"), actionState(right.actions, "exit") !== "—" ? actionState(right.actions, "exit") : actionState(right.actions, "redeem")] },
    { field: "Wallet required", values: [walletFor(left), walletFor(right)] },
    { field: "Eligibility / restrictions", values: [left.eligibilityNote ?? UNKNOWN, right.eligibilityNote ?? UNKNOWN] },
    { field: "Source", values: [left.verificationSourceUrl || UNKNOWN, right.verificationSourceUrl || UNKNOWN] },
  ];
  return { left, right, rows };
}

export { getSubjectForAsset };
