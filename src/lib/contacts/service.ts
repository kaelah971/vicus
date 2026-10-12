import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError, toDatabaseUnavailableError } from "@/db";
import {
  contactWalletEndpoints,
  userContacts,
  userReceiveEndpoints,
  users,
} from "@/db/schema";
import { MissionActionError } from "@/lib/missions/errors";

export const CONTACT_NETWORKS = ["stellar", "base", "ethereum", "solana"] as const;

export type ContactNetwork = (typeof CONTACT_NETWORKS)[number];

export function isContactNetwork(value: unknown): value is ContactNetwork {
  return (
    typeof value === "string" &&
    (CONTACT_NETWORKS as readonly string[]).includes(value)
  );
}

const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const UUID_RE = /^[0-9a-f-]{36}$/i;

function decodeBase58Length(value: string): number | null {
  if (!value || /[^1-9A-HJ-NP-Za-km-z]/.test(value)) return null;
  const bytes: number[] = [0];
  for (const char of value) {
    let carry = BASE58_ALPHABET.indexOf(char);
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (const char of value) {
    if (char !== "1") break;
    leadingZeros += 1;
  }
  const stripped = bytes.reverse();
  while (stripped.length > 0 && stripped[0] === 0) stripped.shift();
  return leadingZeros + stripped.length;
}

/** Strict per-network address validation. Malformed strings never persist. */
export function normalizeContactAddress(network: ContactNetwork, address: unknown): string | null {
  if (typeof address !== "string") return null;
  const trimmed = address.trim();
  if (network === "stellar") return STELLAR_KEY_RE.test(trimmed) ? trimmed : null;
  if (network === "base" || network === "ethereum") {
    return EVM_ADDRESS_RE.test(trimmed) ? `0x${trimmed.slice(2).toLowerCase()}` : null;
  }
  return decodeBase58Length(trimmed) === 32 ? trimmed : null;
}

function requireOwner(ownerId: string | null | undefined): string {
  if (!ownerId || !UUID_RE.test(ownerId)) {
    throw new MissionActionError("unauthenticated", "Sign in to manage contacts.", 401);
  }
  return ownerId;
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

async function resolveUserByHandle(handle: string) {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;
  const database = getDatabase();
  const [row] = await database
    .select({ id: users.id, handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(1);
  return row ?? null;
}

export type ContactEndpointView = {
  id: string;
  network: ContactNetwork;
  address: string;
  label: string | null;
  verifiedSource: string | null;
};

export type ContactView = {
  id: string;
  displayName: string;
  handle: string | null;
  linkedUserId: string | null;
  source: "vicus_user" | "manual";
  note: string | null;
  endpoints: ContactEndpointView[];
  createdAt: string;
};

function mapContact(
  row: typeof userContacts.$inferSelect,
  endpoints: Array<typeof contactWalletEndpoints.$inferSelect>,
  handle: string | null,
): ContactView {
  return {
    id: row.id,
    displayName: row.displayName,
    handle: handle ?? row.handleSnapshot,
    linkedUserId: row.linkedUserId,
    source: row.linkedUserId ? "vicus_user" : "manual",
    note: row.note,
    endpoints: endpoints.map((endpoint) => ({
      id: endpoint.id,
      network: endpoint.network as ContactNetwork,
      address: endpoint.address,
      label: endpoint.label,
      verifiedSource: endpoint.verifiedSource,
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireOwnedContact(contactId: string, ownerId: string) {
  if (!UUID_RE.test(contactId)) {
    throw new MissionActionError("invalid-request", "That contact could not be found.", 404);
  }
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(userContacts)
    .where(eq(userContacts.id, contactId))
    .limit(1);
  if (!row || row.ownerUserId !== ownerId) {
    throw new MissionActionError("invalid-request", "That contact could not be found.", 404);
  }
  return row;
}

async function endpointsFor(contactId: string) {
  const database = getDatabase();
  return database
    .select()
    .from(contactWalletEndpoints)
    .where(eq(contactWalletEndpoints.contactId, contactId))
    .orderBy(asc(contactWalletEndpoints.network));
}

/** Save an existing Vicus user as a contact. Duplicate linked contacts rejected. */
export async function saveUserContact(
  ownerId: string | null | undefined,
  handle: unknown,
  note?: unknown,
): Promise<ContactView> {
  try {
    const owner = requireOwner(ownerId);
    const target = typeof handle === "string" ? await resolveUserByHandle(handle) : null;
    if (!target) {
      throw new MissionActionError("invalid-request", "That Vicus user could not be found.", 404);
    }
    if (target.id === owner) {
      throw new MissionActionError("invalid-request", "You cannot save yourself as a contact.", 400);
    }
    const database = getDatabase();
    const [existing] = await database
      .select()
      .from(userContacts)
      .where(and(eq(userContacts.ownerUserId, owner), eq(userContacts.linkedUserId, target.id)))
      .limit(1);
    if (existing) {
      throw new MissionActionError("duplicate-submission", "That person is already in your contacts.", 409);
    }
    const [row] = await database
      .insert(userContacts)
      .values({
        ownerUserId: owner,
        linkedUserId: target.id,
        displayName: target.displayName,
        handleSnapshot: target.handle,
        note: boundedText(note, 280),
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("save contact");
    return mapContact(row, [], target.handle);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("save contact");
  }
}

/** Add a manual contact (name only, or with one wallet endpoint). No ownership claimed. */
export async function saveManualContact(
  ownerId: string | null | undefined,
  input: { displayName?: unknown; network?: unknown; address?: unknown; label?: unknown; note?: unknown },
): Promise<ContactView> {
  try {
    const owner = requireOwner(ownerId);
    const displayName = boundedText(input.displayName, 160);
    if (!displayName) {
      throw new MissionActionError("invalid-request", "Give the contact a name.", 400);
    }
    let endpoint: { network: ContactNetwork; address: string } | null = null;
    if (input.network !== undefined || input.address !== undefined) {
      if (!isContactNetwork(input.network)) {
        throw new MissionActionError("invalid-request", "Choose a supported network.", 400);
      }
      const address = normalizeContactAddress(input.network, input.address);
      if (!address) {
        throw new MissionActionError("invalid-request", "That wallet address is not valid.", 400);
      }
      endpoint = { network: input.network, address };
    }
    const database = getDatabase();
    const [row] = await database
      .insert(userContacts)
      .values({
        ownerUserId: owner,
        linkedUserId: null,
        displayName,
        handleSnapshot: null,
        note: boundedText(input.note, 280),
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("save contact");
    let endpoints: Array<typeof contactWalletEndpoints.$inferSelect> = [];
    if (endpoint) {
      endpoints = await database
        .insert(contactWalletEndpoints)
        .values({
          contactId: row.id,
          network: endpoint.network,
          address: endpoint.address,
          label: boundedText(input.label, 80),
          verifiedSource: "manual",
        })
        .onConflictDoNothing({
          target: [
            contactWalletEndpoints.contactId,
            contactWalletEndpoints.network,
            contactWalletEndpoints.address,
          ],
        })
        .returning();
      if (endpoints.length === 0) {
        endpoints = await endpointsFor(row.id);
      }
    }
    return mapContact(row, endpoints, null);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("save contact");
  }
}

export async function listMyContacts(ownerId: string | null | undefined): Promise<ContactView[]> {
  try {
    const owner = requireOwner(ownerId);
    const database = getDatabase();
    const rows = await database
      .select({ contact: userContacts, handle: users.handle })
      .from(userContacts)
      .leftJoin(users, eq(userContacts.linkedUserId, users.id))
      .where(eq(userContacts.ownerUserId, owner))
      .orderBy(desc(userContacts.createdAt))
      .limit(100);
    const views: ContactView[] = [];
    for (const row of rows) {
      views.push(mapContact(row.contact, await endpointsFor(row.contact.id), row.handle));
    }
    return views;
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("list contacts");
  }
}

export async function getMyContact(
  contactId: string,
  ownerId: string | null | undefined,
): Promise<ContactView> {
  try {
    const owner = requireOwner(ownerId);
    const row = await requireOwnedContact(contactId, owner);
    const database = getDatabase();
    const [linked] = row.linkedUserId
      ? await database.select({ handle: users.handle }).from(users).where(eq(users.id, row.linkedUserId)).limit(1)
      : [];
    return mapContact(row, await endpointsFor(row.id), linked?.handle ?? null);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("read contact");
  }
}

export async function updateMyContact(
  contactId: string,
  ownerId: string | null | undefined,
  input: { displayName?: unknown; note?: unknown },
): Promise<ContactView> {
  try {
    const owner = requireOwner(ownerId);
    const row = await requireOwnedContact(contactId, owner);
    const patch: { displayName?: string; note?: string | null; updatedAt?: Date } = {
      updatedAt: new Date(),
    };
    if (input.displayName !== undefined) {
      const displayName = boundedText(input.displayName, 160);
      if (!displayName) throw new MissionActionError("invalid-request", "Give the contact a name.", 400);
      patch.displayName = displayName;
    }
    if (input.note !== undefined) {
      patch.note =
        typeof input.note === "string" && input.note.trim()
          ? input.note.trim().slice(0, 280)
          : null;
    }
    const database = getDatabase();
    const [updated] = await database
      .update(userContacts)
      .set(patch)
      .where(and(eq(userContacts.id, row.id), eq(userContacts.ownerUserId, owner)))
      .returning();
    if (!updated) throw toDatabaseUnavailableError("update contact");
    const [linked] = updated.linkedUserId
      ? await database.select({ handle: users.handle }).from(users).where(eq(users.id, updated.linkedUserId)).limit(1)
      : [];
    return mapContact(updated, await endpointsFor(updated.id), linked?.handle ?? null);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("update contact");
  }
}

export async function deleteMyContact(
  contactId: string,
  ownerId: string | null | undefined,
): Promise<{ removed: boolean }> {
  try {
    const owner = requireOwner(ownerId);
    await requireOwnedContact(contactId, owner);
    const database = getDatabase();
    await database
      .delete(userContacts)
      .where(and(eq(userContacts.id, contactId), eq(userContacts.ownerUserId, owner)));
    return { removed: true };
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("delete contact");
  }
}

/**
 * Add a wallet endpoint to an owned contact. Manual endpoints are always
 * recorded as user-supplied — never verified, owned, or authenticated.
 */
export async function addContactEndpoint(
  contactId: string,
  ownerId: string | null | undefined,
  input: { network?: unknown; address?: unknown; label?: unknown },
): Promise<ContactEndpointView> {
  try {
    const owner = requireOwner(ownerId);
    await requireOwnedContact(contactId, owner);
    if (!isContactNetwork(input.network)) {
      throw new MissionActionError("invalid-request", "Choose a supported network.", 400);
    }
    const address = normalizeContactAddress(input.network, input.address);
    if (!address) {
      throw new MissionActionError("invalid-request", "That wallet address is not valid.", 400);
    }
    const database = getDatabase();
    const [existing] = await database
      .select()
      .from(contactWalletEndpoints)
      .where(
        and(
          eq(contactWalletEndpoints.contactId, contactId),
          eq(contactWalletEndpoints.network, input.network),
          eq(contactWalletEndpoints.address, address),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        id: existing.id,
        network: existing.network as ContactNetwork,
        address: existing.address,
        label: existing.label,
        verifiedSource: existing.verifiedSource,
      };
    }
    const [row] = await database
      .insert(contactWalletEndpoints)
      .values({
        contactId,
        network: input.network,
        address,
        label: boundedText(input.label, 80),
        verifiedSource: "manual",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("add contact endpoint");
    return {
      id: row.id,
      network: row.network as ContactNetwork,
      address: row.address,
      label: row.label,
      verifiedSource: row.verifiedSource,
    };
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("add contact endpoint");
  }
}

export async function isContactSaved(ownerId: string, handle: string): Promise<boolean> {
  try {
    if (!UUID_RE.test(ownerId)) return false;
    const target = await resolveUserByHandle(handle);
    if (!target) return false;
    const database = getDatabase();
    const [row] = await database
      .select({ id: userContacts.id })
      .from(userContacts)
      .where(and(eq(userContacts.ownerUserId, ownerId), eq(userContacts.linkedUserId, target.id)))
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}

export type ReceiveEndpointView = {
  id: string;
  network: ContactNetwork;
  address: string;
  label: string | null;
  enabled: boolean;
  visibility: "contacts_only" | "public";
  ownershipStatus: "authenticated" | "verified" | "unverified";
  createdAt: string;
};

function mapReceiveEndpoint(row: typeof userReceiveEndpoints.$inferSelect): ReceiveEndpointView {
  return {
    id: row.id,
    network: row.network as ContactNetwork,
    address: row.address,
    label: row.label,
    enabled: row.enabled,
    visibility: row.visibility === "public" ? "public" : "contacts_only",
    ownershipStatus:
      row.ownershipStatus === "authenticated" || row.ownershipStatus === "verified"
        ? row.ownershipStatus
        : "unverified",
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recipient-managed receive endpoint. Disabled until the user explicitly
 * enables it; contacts_only by default. Manual non-Stellar addresses stay
 * unverified until real proof exists — the caller sets ownershipStatus, and
 * only "unverified" is accepted from user input.
 */
export async function addMyReceiveEndpoint(
  ownerId: string | null | undefined,
  input: { network?: unknown; address?: unknown; label?: unknown },
): Promise<ReceiveEndpointView> {
  try {
    const owner = requireOwner(ownerId);
    if (!isContactNetwork(input.network)) {
      throw new MissionActionError("invalid-request", "Choose a supported network.", 400);
    }
    const address = normalizeContactAddress(input.network, input.address);
    if (!address) {
      throw new MissionActionError("invalid-request", "That wallet address is not valid.", 400);
    }
    const database = getDatabase();
    const [existing] = await database
      .select()
      .from(userReceiveEndpoints)
      .where(
        and(
          eq(userReceiveEndpoints.userId, owner),
          eq(userReceiveEndpoints.network, input.network),
          eq(userReceiveEndpoints.address, address),
        ),
      )
      .limit(1);
    if (existing) return mapReceiveEndpoint(existing);
    const [row] = await database
      .insert(userReceiveEndpoints)
      .values({
        userId: owner,
        network: input.network,
        address,
        label: boundedText(input.label, 80),
        enabled: false,
        visibility: "contacts_only",
        ownershipStatus: "unverified",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("add receive endpoint");
    return mapReceiveEndpoint(row);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("add receive endpoint");
  }
}

/**
 * Enable the user's authenticated Stellar wallet as a receive endpoint.
 * Ownership is marked authenticated ONLY because the wallet comes from the
 * live Vicus session — the same wallet that signed authentication. Nothing
 * is exposed until the user also enables it.
 */
export async function enableStellarReceiveEndpoint(
  ownerId: string | null | undefined,
  stellarPublicKey: string | null | undefined,
  input: { enabled?: unknown; visibility?: unknown } = {},
): Promise<ReceiveEndpointView> {
  try {
    const owner = requireOwner(ownerId);
    if (!stellarPublicKey || !/^G[A-Z2-7]{55}$/.test(stellarPublicKey)) {
      throw new MissionActionError("invalid-request", "No authenticated Stellar wallet is available.", 400);
    }
    const enabled = input.enabled === undefined ? true : input.enabled === true;
    const visibility = input.visibility === "public" ? "public" : "contacts_only";
    const database = getDatabase();
    const [existing] = await database
      .select()
      .from(userReceiveEndpoints)
      .where(
        and(
          eq(userReceiveEndpoints.userId, owner),
          eq(userReceiveEndpoints.network, "stellar"),
          eq(userReceiveEndpoints.address, stellarPublicKey),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await database
        .update(userReceiveEndpoints)
        .set({ enabled, visibility, ownershipStatus: "authenticated", updatedAt: new Date() })
        .where(eq(userReceiveEndpoints.id, existing.id))
        .returning();
      if (!updated) throw toDatabaseUnavailableError("enable receive endpoint");
      return mapReceiveEndpoint(updated);
    }
    const [row] = await database
      .insert(userReceiveEndpoints)
      .values({
        userId: owner,
        network: "stellar",
        address: stellarPublicKey,
        label: "Stellar wallet",
        enabled,
        visibility,
        ownershipStatus: "authenticated",
      })
      .returning();
    if (!row) throw toDatabaseUnavailableError("enable receive endpoint");
    return mapReceiveEndpoint(row);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("enable receive endpoint");
  }
}

export async function listMyReceiveEndpoints(
  ownerId: string | null | undefined,
): Promise<ReceiveEndpointView[]> {
  try {
    const owner = requireOwner(ownerId);
    const database = getDatabase();
    const rows = await database
      .select()
      .from(userReceiveEndpoints)
      .where(eq(userReceiveEndpoints.userId, owner))
      .orderBy(asc(userReceiveEndpoints.network));
    return rows.map(mapReceiveEndpoint);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("list receive endpoints");
  }
}

export async function updateMyReceiveEndpoint(
  endpointId: string,
  ownerId: string | null | undefined,
  input: { enabled?: unknown; visibility?: unknown; label?: unknown },
): Promise<ReceiveEndpointView> {
  try {
    const owner = requireOwner(ownerId);
    if (!UUID_RE.test(endpointId)) {
      throw new MissionActionError("invalid-request", "That receive endpoint could not be found.", 404);
    }
    const database = getDatabase();
    const [row] = await database
      .select()
      .from(userReceiveEndpoints)
      .where(eq(userReceiveEndpoints.id, endpointId))
      .limit(1);
    if (!row || row.userId !== owner) {
      throw new MissionActionError("invalid-request", "That receive endpoint could not be found.", 404);
    }
    const patch: {
      enabled?: boolean;
      visibility?: string;
      label?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.enabled !== undefined) patch.enabled = input.enabled === true;
    if (input.visibility !== undefined) {
      patch.visibility = input.visibility === "public" ? "public" : "contacts_only";
    }
    if (input.label !== undefined) {
      patch.label =
        typeof input.label === "string" && input.label.trim()
          ? input.label.trim().slice(0, 80)
          : null;
    }
    const [updated] = await database
      .update(userReceiveEndpoints)
      .set(patch)
      .where(and(eq(userReceiveEndpoints.id, row.id), eq(userReceiveEndpoints.userId, owner)))
      .returning();
    if (!updated) throw toDatabaseUnavailableError("update receive endpoint");
    return mapReceiveEndpoint(updated);
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("update receive endpoint");
  }
}

export async function deleteMyReceiveEndpoint(
  endpointId: string,
  ownerId: string | null | undefined,
): Promise<{ removed: boolean }> {
  try {
    const owner = requireOwner(ownerId);
    if (!UUID_RE.test(endpointId)) {
      throw new MissionActionError("invalid-request", "That receive endpoint could not be found.", 404);
    }
    const database = getDatabase();
    const [row] = await database
      .select()
      .from(userReceiveEndpoints)
      .where(eq(userReceiveEndpoints.id, endpointId))
      .limit(1);
    if (!row || row.userId !== owner) {
      throw new MissionActionError("invalid-request", "That receive endpoint could not be found.", 404);
    }
    await database
      .delete(userReceiveEndpoints)
      .where(and(eq(userReceiveEndpoints.id, row.id), eq(userReceiveEndpoints.userId, owner)));
    return { removed: true };
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("delete receive endpoint");
  }
}

export type RecipientResolution =
  | {
      ok: true;
      recipientUserId: string;
      contactId: string | null;
      network: ContactNetwork;
      address: string;
      ownershipStatus: "authenticated" | "verified" | "unverified";
      visibility: "contacts_only" | "public";
    }
  | { ok: false; reason: "no-endpoint" | "not-permitted" | "not-found" | "disabled" };

async function senderSavedRecipient(senderUserId: string, recipientUserId: string): Promise<boolean> {
  const database = getDatabase();
  const [row] = await database
    .select({ id: userContacts.id })
    .from(userContacts)
    .where(
      and(
        eq(userContacts.ownerUserId, senderUserId),
        eq(userContacts.linkedUserId, recipientUserId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Future SEND TO @HANDLE resolver. Answers whether a sender may resolve a
 * recipient's enabled endpoint on a network — no transactions, no XDR.
 * contacts_only endpoints resolve only for senders who saved the recipient
 * as a contact; removing that contact revokes resolution.
 */
export async function resolveRecipient(input: {
  senderUserId: string | null | undefined;
  handle?: unknown;
  contactId?: unknown;
  targetNetwork?: unknown;
}): Promise<RecipientResolution> {
  try {
    const sender = requireOwner(input.senderUserId);
    if (!isContactNetwork(input.targetNetwork)) {
      throw new MissionActionError("invalid-request", "Choose a supported network.", 400);
    }
    let recipientUserId: string | null = null;
    let contactId: string | null = null;
    if (typeof input.contactId === "string" && UUID_RE.test(input.contactId)) {
      const database = getDatabase();
      const [contact] = await database
        .select()
        .from(userContacts)
        .where(eq(userContacts.id, input.contactId))
        .limit(1);
      if (!contact || contact.ownerUserId !== sender || !contact.linkedUserId) {
        return { ok: false, reason: "not-found" };
      }
      recipientUserId = contact.linkedUserId;
      contactId = contact.id;
    } else if (typeof input.handle === "string") {
      const target = await resolveUserByHandle(input.handle);
      if (!target) return { ok: false, reason: "not-found" };
      recipientUserId = target.id;
    } else {
      throw new MissionActionError("invalid-request", "Provide a contact or handle.", 400);
    }

    const database = getDatabase();
    const [endpoint] = await database
      .select()
      .from(userReceiveEndpoints)
      .where(
        and(
          eq(userReceiveEndpoints.userId, recipientUserId),
          eq(userReceiveEndpoints.network, input.targetNetwork),
          eq(userReceiveEndpoints.enabled, true),
        ),
      )
      .limit(1);
    if (!endpoint) return { ok: false, reason: "no-endpoint" };
    const visibility = endpoint.visibility === "public" ? "public" : "contacts_only";
    if (visibility === "contacts_only" && !(await senderSavedRecipient(sender, recipientUserId))) {
      return { ok: false, reason: "not-permitted" };
    }
    return {
      ok: true,
      recipientUserId,
      contactId,
      network: input.targetNetwork,
      address: endpoint.address,
      ownershipStatus:
        endpoint.ownershipStatus === "authenticated" || endpoint.ownershipStatus === "verified"
          ? endpoint.ownershipStatus
          : "unverified",
      visibility,
    };
  } catch (error) {
    if (error instanceof MissionActionError || isDatabaseUnavailableError(error)) throw error;
    throw toDatabaseUnavailableError("resolve recipient");
  }
}
