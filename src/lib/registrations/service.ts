/* ------------------------------------------------------------------ */
/* P8.2 source-backed asset registration.                              */
/*                                                                     */
/* An application, URL, contract address, or claimed issuer            */
/* relationship is NOT proof of legitimacy. Registration records that  */
/* a global admin reviewed stated sources and allowed the asset into   */
/* the catalogue — nothing more. It grants no hosting authority, no    */
/* trading availability, no eligibility, no distribution rights, and no */
/* payouts. No circle is auto-published on approval.                   */
/* ------------------------------------------------------------------ */

import { and, eq } from "drizzle-orm";
import { getDatabase, toDatabaseUnavailableError } from "@/db";
import {
  assetCapabilities,
  assetRegistrations,
  assets,
  campaigns,
  circles,
  spaceApplications,
  users,
  type AssetRegistrationFinding,
  type AssetRegistrationStatus,
  type AssetRegistrationType,
} from "@/db/schema";
import { isHttpUrl } from "@/lib/missions/config";
import { MissionActionError } from "@/lib/missions/errors";
import { isGlobalAdmin } from "@/lib/organizations/service";

export const REGISTRATION_TYPES: AssetRegistrationType[] = [
  "stellar-classic",
  "stellar-contract",
  "evm",
  "solana",
];

/** Networks Vicus registers today. Nothing else is admitted. */
const NETWORKS_BY_TYPE: Record<AssetRegistrationType, string[]> = {
  "stellar-classic": ["stellar"],
  "stellar-contract": ["stellar"],
  evm: ["base", "ethereum"],
  solana: ["solana"],
};

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT = /^C[A-Z2-7]{55}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const STELLAR_CODE = /^[A-Za-z0-9]{1,12}$/;

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_URLS = 10;

function asUrls(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_URLS) return null;
  const cleaned: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const url = entry.trim();
    if (!url) continue;
    if (url.length > 500 || !isHttpUrl(url)) return null;
    cleaned.push(url);
  }
  return cleaned;
}

function asBounded(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function asOptional(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return null;
  return trimmed;
}

export type RegistrationInput = {
  assetName: string;
  assetType: AssetRegistrationType;
  network: string;
  identifier: string;
  code: string | null;
  issuerClaim: string | null;
  documentationUrls: string[];
  chainEvidenceUrls: string[];
  issuerWebsite: string | null;
  spaceApplicationId: string | null;
  canonicalKey: string;
};

function identifierIssue(assetType: AssetRegistrationType, identifier: string): string | null {
  switch (assetType) {
    case "stellar-classic":
      return STELLAR_ADDRESS.test(identifier)
        ? null
        : "Stellar issuer must be a valid G… account address.";
    case "stellar-contract":
      return STELLAR_CONTRACT.test(identifier)
        ? null
        : "Stellar contract must be a valid C… contract ID.";
    case "evm":
      return EVM_ADDRESS.test(identifier)
        ? null
        : "EVM contract must be a 0x address with 40 hex characters.";
    case "solana":
      return SOLANA_MINT.test(identifier)
        ? null
        : "Solana mint must be a valid base58 address (32–44 characters).";
  }
}

/** Canonical dedupe key. EVM addresses fold to lowercase; Stellar is case-exact. */
export function buildCanonicalKey(
  assetType: AssetRegistrationType,
  network: string,
  identifier: string,
): string {
  const id = assetType === "evm" ? identifier.toLowerCase() : identifier;
  return `${assetType}:${network}:${id}`;
}

/** Derive a catalogue code when the applicant supplies no symbol. */
export function deriveCode(assetName: string): string {
  const compact = assetName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return compact || "UNNAMED";
}

/**
 * Pure input validation. Returns the normalized input plus the findings a
 * reviewer will see. A valid shape NEVER means verified — every accepted
 * request carries an explicit UNVERIFIED finding.
 */
export function validateRegistrationInput(value: unknown):
  | { ok: true; input: RegistrationInput; findings: AssetRegistrationFinding[] }
  | { ok: false; issue: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, issue: "A registration needs an asset name, type, network, and identifier." };
  }
  const entry = value as Record<string, unknown>;
  const assetName = asBounded(entry.assetName, 2, 120);
  if (!assetName) return { ok: false, issue: "Asset name needs 2–120 characters." };
  if (typeof entry.assetType !== "string" || !(REGISTRATION_TYPES as string[]).includes(entry.assetType)) {
    return { ok: false, issue: `Asset type must be one of: ${REGISTRATION_TYPES.join(", ")}.` };
  }
  const assetType = entry.assetType as AssetRegistrationType;
  const allowed = NETWORKS_BY_TYPE[assetType];
  if (typeof entry.network !== "string" || !allowed.includes(entry.network)) {
    return { ok: false, issue: `Network must be one of: ${allowed.join(", ")} for ${assetType}.` };
  }
  const network = entry.network;
  if (typeof entry.identifier !== "string" || !entry.identifier.trim()) {
    return { ok: false, issue: "A canonical on-chain identifier is required." };
  }
  const identifier = entry.identifier.trim();
  const idIssue = identifierIssue(assetType, identifier);
  if (idIssue) return { ok: false, issue: idIssue };
  let code: string | null = null;
  if (assetType === "stellar-classic") {
    if (typeof entry.code !== "string" || !STELLAR_CODE.test(entry.code.trim())) {
      return { ok: false, issue: "Stellar Classic assets need an asset code (1–12 letters/digits)." };
    }
    code = entry.code.trim();
  } else if (entry.code !== undefined && entry.code !== null && entry.code !== "") {
    const symbol = asBounded(entry.code, 1, 32);
    if (!symbol) return { ok: false, issue: "Token symbol must be 1–32 characters." };
    code = symbol;
  }
  const issuerClaim = asOptional(entry.issuerClaim, 500);
  if (entry.issuerClaim !== undefined && entry.issuerClaim !== null && entry.issuerClaim !== "" && issuerClaim === null) {
    return { ok: false, issue: "Issuer claim must be 500 characters or fewer." };
  }
  const documentationUrls = asUrls(entry.documentationUrls);
  if (documentationUrls === null) {
    return { ok: false, issue: "Documentation URLs must be valid http(s), max 10." };
  }
  if (documentationUrls.length === 0) {
    return { ok: false, issue: "At least one official issuer/product documentation URL is required." };
  }
  const chainEvidenceUrls = asUrls(entry.chainEvidenceUrls);
  if (chainEvidenceUrls === null) {
    return { ok: false, issue: "Chain evidence URLs must be valid http(s), max 10." };
  }
  if (chainEvidenceUrls.length === 0) {
    return { ok: false, issue: "At least one public chain record (Horizon/explorer) URL is required." };
  }
  let issuerWebsite: string | null = null;
  if (entry.issuerWebsite !== undefined && entry.issuerWebsite !== null && entry.issuerWebsite !== "") {
    if (typeof entry.issuerWebsite !== "string" || !isHttpUrl(entry.issuerWebsite.trim()) || entry.issuerWebsite.trim().length > 500) {
      return { ok: false, issue: "Issuer website must be a valid http(s) URL." };
    }
    issuerWebsite = entry.issuerWebsite.trim();
  }
  let spaceApplicationId: string | null = null;
  if (entry.spaceApplicationId !== undefined && entry.spaceApplicationId !== null && entry.spaceApplicationId !== "") {
    if (typeof entry.spaceApplicationId !== "string" || !UUID.test(entry.spaceApplicationId)) {
      return { ok: false, issue: "Linked application reference is not valid." };
    }
    spaceApplicationId = entry.spaceApplicationId;
  }
  const canonicalKey = buildCanonicalKey(assetType, network, identifier);
  const findings: AssetRegistrationFinding[] = [
    { code: "format-ok", message: "Canonical identifier parses for its network.", severity: "info" },
    {
      code: "sources-present",
      message: `${documentationUrls.length} documentation + ${chainEvidenceUrls.length} chain record URL(s) supplied — supplied, not checked.`,
      severity: "info",
    },
    {
      code: "unverified",
      message:
        "UNVERIFIED: a URL or chain record proves an on-chain object exists. It does not prove issuer endorsement, redemption rights, legal legitimacy, or distribution permission. Admin review required.",
      severity: "warning",
    },
  ];
  return {
    ok: true,
    input: {
      assetName, assetType, network, identifier, code, issuerClaim,
      documentationUrls, chainEvidenceUrls, issuerWebsite, spaceApplicationId, canonicalKey,
    },
    findings,
  };
}

export type AssetRegistrationRecord = {
  id: string;
  assetName: string;
  assetType: string;
  network: string;
  identifier: string;
  code: string | null;
  issuerClaim: string | null;
  documentationUrls: string[];
  chainEvidenceUrls: string[];
  issuerWebsite: string | null;
  canonicalKey: string;
  status: AssetRegistrationStatus;
  validationFindings: AssetRegistrationFinding[];
  reviewNote: string | null;
  reviewedAt: string | null;
  registeredAssetId: string | null;
  createdAt: string;
  applicant: { id: string; handle: string; displayName: string };
  originApplication: { id: string; proposedName: string; proposedSlug: string; status: string } | null;
};

type RegistrationRow = typeof assetRegistrations.$inferSelect;

function mapRecord(
  row: RegistrationRow,
  applicant: { id: string; handle: string; displayName: string },
  origin: AssetRegistrationRecord["originApplication"],
): AssetRegistrationRecord {
  return {
    id: row.id,
    assetName: row.assetName,
    assetType: row.assetType,
    network: row.network,
    identifier: row.identifier,
    code: row.code,
    issuerClaim: row.issuerClaim,
    documentationUrls: (row.documentationUrls ?? []) as string[],
    chainEvidenceUrls: (row.chainEvidenceUrls ?? []) as string[],
    issuerWebsite: row.issuerWebsite,
    canonicalKey: row.canonicalKey,
    status: row.status as AssetRegistrationStatus,
    validationFindings: (row.validationFindings ?? []) as AssetRegistrationFinding[],
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    registeredAssetId: row.registeredAssetId,
    createdAt: row.createdAt.toISOString(),
    applicant,
    originApplication: origin,
  };
}

async function requireUser(userId: string | null | undefined): Promise<{ id: string; handle: string; displayName: string }> {
  if (!userId || !UUID.test(userId)) {
    throw new MissionActionError("unauthenticated", "Sign in to manage asset registrations.", 401);
  }
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ id: users.id, handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      throw new MissionActionError("unauthenticated", "Sign in to manage asset registrations.", 401);
    }
    return row;
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("load registration applicant");
  }
}

/** Catalogue collision: does this canonical identity already live in assets? */
async function findCatalogueCollision(input: RegistrationInput): Promise<{ id: string; code: string } | null> {
  try {
    const database = getDatabase();
    if (input.assetType === "stellar-classic") {
      if (!input.code) return null;
      const [row] = await database
        .select({ id: assets.id, code: assets.code })
        .from(assets)
        .where(
          and(
            eq(assets.stellarAssetCode, input.code),
            eq(assets.stellarIssuerAccount, input.identifier),
          ),
        )
        .limit(1);
      return row ? { id: row.id, code: row.code } : null;
    }
    const [row] = await database
      .select({ id: assets.id, code: assets.code })
      .from(assets)
      .where(
        and(eq(assets.stellarContractId, input.identifier), eq(assets.chain, input.network)),
      )
      .limit(1);
    return row ? { id: row.id, code: row.code } : null;
  } catch {
    throw toDatabaseUnavailableError("check catalogue collision");
  }
}

/** Applicant creates a registration request. Valid shape only — never verified. */
export async function createAssetRegistration(
  applicantId: string | null | undefined,
  value: unknown,
): Promise<AssetRegistrationRecord> {
  const applicant = await requireUser(applicantId);
  const parsed = validateRegistrationInput(value);
  if (!parsed.ok) {
    throw new MissionActionError("invalid-request", parsed.issue, 400);
  }
  const { input, findings } = parsed;
  try {
    const database = getDatabase();
    let origin: AssetRegistrationRecord["originApplication"] = null;
    if (input.spaceApplicationId) {
      const [app] = await database
        .select({
          id: spaceApplications.id,
          applicantUserId: spaceApplications.applicantUserId,
          proposedName: spaceApplications.proposedName,
          proposedSlug: spaceApplications.proposedSlug,
          status: spaceApplications.status,
        })
        .from(spaceApplications)
        .where(eq(spaceApplications.id, input.spaceApplicationId))
        .limit(1);
      if (!app || app.applicantUserId !== applicant.id) {
        throw new MissionActionError(
          "invalid-request",
          "That application does not belong to this applicant.",
          400,
        );
      }
      origin = { id: app.id, proposedName: app.proposedName, proposedSlug: app.proposedSlug, status: app.status };
    }
    const [approvedDup] = await database
      .select({ id: assetRegistrations.id })
      .from(assetRegistrations)
      .where(
        and(eq(assetRegistrations.canonicalKey, input.canonicalKey), eq(assetRegistrations.status, "approved")),
      )
      .limit(1);
    if (approvedDup) {
      throw new MissionActionError("invalid-request", "This asset is already registered.", 409);
    }
    const [pendingDup] = await database
      .select({ id: assetRegistrations.id })
      .from(assetRegistrations)
      .where(
        and(
          eq(assetRegistrations.canonicalKey, input.canonicalKey),
          eq(assetRegistrations.applicantUserId, applicant.id),
        ),
      )
      .limit(1);
    if (pendingDup) {
      throw new MissionActionError(
        "invalid-request",
        "You already have a request for this asset. Wait for review.",
        409,
      );
    }
    const [inserted] = await database
      .insert(assetRegistrations)
      .values({
        applicantUserId: applicant.id,
        spaceApplicationId: input.spaceApplicationId,
        assetName: input.assetName,
        assetType: input.assetType,
        network: input.network,
        identifier: input.identifier,
        code: input.code,
        issuerClaim: input.issuerClaim,
        documentationUrls: input.documentationUrls,
        chainEvidenceUrls: input.chainEvidenceUrls,
        issuerWebsite: input.issuerWebsite,
        canonicalKey: input.canonicalKey,
        status: "pending",
        validationFindings: findings,
      })
      .returning();
    if (!inserted) throw toDatabaseUnavailableError("create asset registration");
    return mapRecord(inserted, applicant, origin);
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("create asset registration");
  }
}

/** Applicant-visible list: own requests with status, findings, and reviewer notes. */
export async function listMyAssetRegistrations(
  applicantId: string | null | undefined,
): Promise<AssetRegistrationRecord[]> {
  const applicant = await requireUser(applicantId);
  try {
    const database = getDatabase();
    const rows = await database
      .select({ registration: assetRegistrations, application: spaceApplications })
      .from(assetRegistrations)
      .leftJoin(spaceApplications, eq(assetRegistrations.spaceApplicationId, spaceApplications.id))
      .where(eq(assetRegistrations.applicantUserId, applicant.id));
    return rows.map((row) =>
      mapRecord(
        row.registration,
        applicant,
        row.application
          ? {
              id: row.application.id,
              proposedName: row.application.proposedName,
              proposedSlug: row.application.proposedSlug,
              status: row.application.status,
            }
          : null,
      ),
    );
  } catch {
    throw toDatabaseUnavailableError("list asset registrations");
  }
}

export async function getAssetRegistrationForApplicant(
  applicantId: string | null | undefined,
  id: string,
): Promise<AssetRegistrationRecord> {
  const applicant = await requireUser(applicantId);
  if (!UUID.test(id)) {
    throw new MissionActionError("invalid-request", "That registration could not be found.", 404);
  }
  try {
    const database = getDatabase();
    const [row] = await database
      .select({ registration: assetRegistrations, application: spaceApplications })
      .from(assetRegistrations)
      .leftJoin(spaceApplications, eq(assetRegistrations.spaceApplicationId, spaceApplications.id))
      .where(eq(assetRegistrations.id, id))
      .limit(1);
    if (!row || row.registration.applicantUserId !== applicant.id) {
      throw new MissionActionError("invalid-request", "That registration could not be found.", 404);
    }
    return mapRecord(
      row.registration,
      applicant,
      row.application
        ? {
            id: row.application.id,
            proposedName: row.application.proposedName,
            proposedSlug: row.application.proposedSlug,
            status: row.application.status,
          }
        : null,
    );
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("load asset registration");
  }
}

/** Admin queue: pending + parked requests. Approved/rejected stay out of the queue. */
export async function listPendingAssetRegistrations(
  actorId: string | null | undefined,
): Promise<AssetRegistrationRecord[]> {
  if (!actorId || !UUID.test(actorId) || !(await isGlobalAdmin(actorId))) {
    throw new MissionActionError("forbidden", "This wallet is not authorized to review registrations.", 403);
  }
  try {
    const database = getDatabase();
    const rows = await database
      .select({
        registration: assetRegistrations,
        applicant: users,
        application: spaceApplications,
      })
      .from(assetRegistrations)
      .innerJoin(users, eq(assetRegistrations.applicantUserId, users.id))
      .leftJoin(spaceApplications, eq(assetRegistrations.spaceApplicationId, spaceApplications.id))
      .where(eq(assetRegistrations.status, "pending"));
    const parked = await database
      .select({
        registration: assetRegistrations,
        applicant: users,
        application: spaceApplications,
      })
      .from(assetRegistrations)
      .innerJoin(users, eq(assetRegistrations.applicantUserId, users.id))
      .leftJoin(spaceApplications, eq(assetRegistrations.spaceApplicationId, spaceApplications.id))
      .where(eq(assetRegistrations.status, "needs_review"));
    return [...rows, ...parked].map((row) =>
      mapRecord(
        row.registration,
        { id: row.applicant.id, handle: row.applicant.handle, displayName: row.applicant.displayName },
        row.application
          ? {
              id: row.application.id,
              proposedName: row.application.proposedName,
              proposedSlug: row.application.proposedSlug,
              status: row.application.status,
            }
          : null,
      ),
    );
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("list pending registrations");
  }
}

/**
 * Admin decision. Approval performs the ONLY authorized registry write:
 * one assets row (sourceStatus states admin-reviewed, never official), no
 * circle, no capabilities, no routes. Everything else stays untouched.
 */
export async function reviewAssetRegistration(
  registrationId: string,
  action: unknown,
  reviewNoteValue: unknown,
  actorId: string | null | undefined,
): Promise<AssetRegistrationRecord> {
  if (!actorId || !UUID.test(actorId) || !(await isGlobalAdmin(actorId))) {
    throw new MissionActionError("forbidden", "This wallet is not authorized to review registrations.", 403);
  }
  if (!UUID.test(registrationId)) {
    throw new MissionActionError("invalid-request", "That registration could not be found.", 404);
  }
  if (action !== "approved" && action !== "rejected" && action !== "needs_review") {
    throw new MissionActionError("invalid-request", "Review action must be approved, rejected, or needs_review.", 400);
  }
  const reviewNote =
    typeof reviewNoteValue === "string" && reviewNoteValue.trim()
      ? reviewNoteValue.trim().slice(0, 2_000)
      : null;

  try {
    const database = getDatabase();
    const [row] = await database
      .select({ registration: assetRegistrations, applicant: users })
      .from(assetRegistrations)
      .innerJoin(users, eq(assetRegistrations.applicantUserId, users.id))
      .where(eq(assetRegistrations.id, registrationId))
      .limit(1);
    if (!row) {
      throw new MissionActionError("invalid-request", "That registration could not be found.", 404);
    }
    const applicant = { id: row.applicant.id, handle: row.applicant.handle, displayName: row.applicant.displayName };
    const current = row.registration;

    // Idempotent replay: an approval that already wrote its registry row
    // returns the same outcome instead of duplicating.
    if (action === "approved" && current.status === "approved" && current.registeredAssetId) {
      const [asset] = await database
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.id, current.registeredAssetId))
        .limit(1);
      if (asset) return mapRecord(current, applicant, null);
    }
    if (current.status !== "pending" && current.status !== "needs_review") {
      throw new MissionActionError(
        "invalid-transition",
        "This registration is no longer waiting for review.",
        409,
      );
    }

    if (action === "rejected") {
      const [updated] = await database
        .update(assetRegistrations)
        .set({ status: "rejected", reviewedBy: actorId, reviewNote, reviewedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(assetRegistrations.id, registrationId), eq(assetRegistrations.status, current.status)),
        )
        .returning();
      if (!updated) {
        throw new MissionActionError("invalid-transition", "This registration is no longer waiting for review.", 409);
      }
      return mapRecord(updated, applicant, null);
    }

    if (action === "needs_review") {
      const [updated] = await database
        .update(assetRegistrations)
        .set({ status: "needs_review", reviewedBy: actorId, reviewNote, reviewedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(assetRegistrations.id, registrationId), eq(assetRegistrations.status, current.status)),
        )
        .returning();
      if (!updated) {
        throw new MissionActionError("invalid-transition", "This registration is no longer waiting for review.", 409);
      }
      return mapRecord(updated, applicant, null);
    }

    // Approve: re-validate stored shape, then fail closed on any collision
    // BEFORE touching the registry. Status flips only alongside the write.
    const stored = {
      assetName: current.assetName,
      assetType: current.assetType,
      network: current.network,
      identifier: current.identifier,
      code: current.code,
      issuerClaim: current.issuerClaim,
      documentationUrls: (current.documentationUrls ?? []) as string[],
      chainEvidenceUrls: (current.chainEvidenceUrls ?? []) as string[],
      issuerWebsite: current.issuerWebsite,
      spaceApplicationId: current.spaceApplicationId,
    };
    const rechecked = validateRegistrationInput(stored);
    if (!rechecked.ok) {
      throw new MissionActionError("invalid-request", `Stored claim no longer validates: ${rechecked.issue}`, 409);
    }
    const collision = await findCatalogueCollision(rechecked.input);
    if (collision) {
      throw new MissionActionError(
        "invalid-request",
        "This asset is already in the catalogue. Existing records are never overwritten.",
        409,
      );
    }
    const [approvedDup] = await database
      .select({ id: assetRegistrations.id })
      .from(assetRegistrations)
      .where(
        and(
          eq(assetRegistrations.canonicalKey, current.canonicalKey),
          eq(assetRegistrations.status, "approved"),
        ),
      )
      .limit(1);
    if (approvedDup && approvedDup.id !== registrationId) {
      throw new MissionActionError("invalid-request", "This asset was already registered.", 409);
    }

    const input = rechecked.input;
    const code = input.code ?? deriveCode(input.assetName);
    const [created] = await database
      .insert(assets)
      .values({
        code,
        issuer: input.issuerClaim ?? input.assetName,
        chain: input.network,
        ecosystem: input.network === "stellar" ? "stellar" : input.network,
        type: "tokenized asset",
        stellarNetwork: null,
        stellarAssetCode: input.assetType === "stellar-classic" ? input.code : null,
        stellarIssuerAccount: input.assetType === "stellar-classic" ? input.identifier : null,
        stellarContractId: input.assetType === "stellar-classic" ? null : input.identifier,
        verificationMode: `registered-${input.assetType}`,
        verificationSourceUrl: input.chainEvidenceUrls[0] ?? null,
        name: `${input.assetName} (${input.network})`,
        description:
          "Community-registered via Vicus Studio after admin source review. Registration records reviewed sources only — it does not verify issuer endorsement, redemption rights, legal legitimacy, or distribution permission. Always verify identifiers before interacting.",
        intendedUse: null,
        officialUrl: input.issuerWebsite ?? input.documentationUrls[0] ?? null,
        riskNote:
          "Registered assets carry issuer, liquidity, and regulatory risk. Registration is not an endorsement and enables no trading, Send, Earn, Redeem, or distribution on its own.",
        eligibilityNote: null,
        sourceStatus: "Studio-registered (issuer unverified)",
        lastVerifiedAt: null,
      })
      .returning({ id: assets.id });
    if (!created) throw toDatabaseUnavailableError("write registered asset");

    // Flip to approved alongside the write. The partial unique index on
    // (canonical_key) WHERE approved is the concurrent-approval backstop:
    // a lost race surfaces as 23505 and fails closed with no duplicate.
    let updated: RegistrationRow | undefined;
    try {
      const [flipped] = await database
        .update(assetRegistrations)
        .set({
          status: "approved",
          reviewedBy: actorId,
          reviewNote,
          reviewedAt: new Date(),
          registeredAssetId: created.id,
          updatedAt: new Date(),
        })
        .where(
          and(eq(assetRegistrations.id, registrationId), eq(assetRegistrations.status, current.status)),
        )
        .returning();
      updated = flipped;
    } catch (error) {
      const pgCode = (error as { code?: string }).code;
      if (pgCode === "23505" || /unique|duplicate/i.test(error instanceof Error ? error.message : "")) {
        await database.delete(assets).where(eq(assets.id, created.id)).catch(() => undefined);
        throw new MissionActionError("invalid-request", "This asset was already registered.", 409);
      }
      await database.delete(assets).where(eq(assets.id, created.id)).catch(() => undefined);
      throw error;
    }
    if (!updated) {
      await database.delete(assets).where(eq(assets.id, created.id)).catch(() => undefined);
      throw new MissionActionError("invalid-transition", "This registration is no longer waiting for review.", 409);
    }
    return mapRecord(updated, applicant, null);
  } catch (error) {
    if (error instanceof MissionActionError) throw error;
    throw toDatabaseUnavailableError("review asset registration");
  }
}

/** Structural guard for tests: capabilities/campaigns must never attach silently. */
export async function countFinancialAttachments(assetId: string): Promise<{ capabilities: number; campaigns: number }> {
  try {
    const database = getDatabase();
    const caps = await database
      .select({ id: assetCapabilities.id })
      .from(assetCapabilities)
      .innerJoin(circles, eq(assetCapabilities.circleId, circles.id))
      .where(eq(circles.assetId, assetId));
    const camp = await database
      .select({ id: campaigns.id })
      .from(campaigns)
      .innerJoin(circles, eq(campaigns.circleId, circles.id))
      .where(eq(circles.assetId, assetId));
    return { capabilities: caps.length, campaigns: camp.length };
  } catch {
    throw toDatabaseUnavailableError("count financial attachments");
  }
}
