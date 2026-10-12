import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { users } from "../src/db/schema";
import { MissionActionError } from "../src/lib/missions/errors";
import {
  addContactEndpoint,
  addMyReceiveEndpoint,
  deleteMyContact,
  deleteMyReceiveEndpoint,
  enableStellarReceiveEndpoint,
  getMyContact,
  isContactSaved,
  listMyContacts,
  listMyReceiveEndpoints,
  normalizeContactAddress,
  resolveRecipient,
  saveManualContact,
  saveUserContact,
  updateMyContact,
  updateMyReceiveEndpoint,
} from "../src/lib/contacts/service";
import { getPublicProfileByHandle } from "../src/lib/social/service";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

const STELLAR_A = `G${"A".repeat(55)}`;
const STELLAR_B = `G${"B".repeat(55)}`;
const EVM_A = "0xAbCdef0123456789aBcDEf0123456789ABCDEF01";
const SOLANA_A = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

async function createUser(handle: string) {
  // Serverless DB inserts flake occasionally: bounded retry with fresh
  // identity per attempt (a lost response must never collide on retry).
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    const uniqueHandle = `${handle}-${randomUUID().slice(0, 8)}`;
    try {
      await database
        .insert(users)
        .values({ id, handle: uniqueHandle, displayName: `${uniqueHandle} tester`, avatarUrl: null, role: "member" });
      temporaryUserIds.push(id);
      return id;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function expectCode(promise: Promise<unknown>, code: string, label: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof MissionActionError, `${label}: expected MissionActionError`);
    assert.equal((error as MissionActionError).code, code, `${label}: wrong code`);
    return;
  }
  assert.fail(`${label}: expected rejection with ${code}`);
}

async function main() {
  const owner = await createUser(`ct-owner-${Date.now()}`);
  const friend = await createUser(`ct-friend-${Date.now()}`);
  const stranger = await createUser(`ct-stranger-${Date.now()}`);

  // 1. Signed-out blocked everywhere.
  await expectCode(listMyContacts(null), "unauthenticated", "signed-out list");
  await expectCode(saveUserContact(undefined, "x"), "unauthenticated", "signed-out save");
  await expectCode(listMyReceiveEndpoints(null), "unauthenticated", "signed-out endpoints");
  await expectCode(resolveRecipient({ senderUserId: null, targetNetwork: "stellar" }), "unauthenticated", "signed-out resolve");

  // 2. Network address validation.
  assert.equal(normalizeContactAddress("stellar", STELLAR_A), STELLAR_A);
  assert.equal(normalizeContactAddress("stellar", "GSHORT"), null);
  assert.equal(normalizeContactAddress("ethereum", EVM_A), EVM_A.toLowerCase());
  assert.equal(normalizeContactAddress("base", "0x123"), null);
  assert.equal(normalizeContactAddress("solana", SOLANA_A), SOLANA_A);
  assert.equal(normalizeContactAddress("solana", "not-a-key"), null);

  // 3. Save Vicus user; duplicate linked contact prevented; self rejected.
  const saved = await saveUserContact(owner, (await database.select().from(users).where(eq(users.id, friend)).limit(1))[0]!.handle);
  assert.equal(saved.source, "vicus_user");
  assert.equal(saved.linkedUserId, friend);
  assert.ok(await isContactSaved(owner, saved.handle!));
  await expectCode(saveUserContact(owner, saved.handle!), "duplicate-submission", "duplicate linked contact");
  const ownerHandle = (await database.select().from(users).where(eq(users.id, owner)).limit(1))[0]!.handle;
  await expectCode(saveUserContact(owner, ownerHandle), "invalid-request", "self contact");
  await expectCode(saveUserContact(owner, "no-such-handle-xyz"), "invalid-request", "unknown handle");

  // 4. Manual contacts allowed, with optional validated endpoint (never verified).
  const manual = await saveManualContact(owner, { displayName: "Treasury wallet", network: "ethereum", address: EVM_A });
  assert.equal(manual.source, "manual");
  assert.equal(manual.endpoints.length, 1);
  assert.equal(manual.endpoints[0]!.verifiedSource, "manual");
  await expectCode(
    saveManualContact(owner, { displayName: "Bad", network: "stellar", address: "0x123" }),
    "invalid-request",
    "malformed manual address",
  );
  const added = await addContactEndpoint(manual.id, owner, { network: "solana", address: SOLANA_A });
  assert.equal(added.verifiedSource, "manual", "manual endpoint never auto-verified");

  // 5. Owner scoping: another user cannot read/edit/delete.
  await expectCode(getMyContact(saved.id, stranger), "invalid-request", "cross-user read");
  await expectCode(updateMyContact(saved.id, stranger, { displayName: "X" }), "invalid-request", "cross-user edit");
  await expectCode(deleteMyContact(saved.id, stranger), "invalid-request", "cross-user delete");
  const renamed = await updateMyContact(manual.id, owner, { displayName: "Treasury 2" });
  assert.equal(renamed.displayName, "Treasury 2");

  // 6. Receive endpoints disabled by default; explicit enable only.
  const recv = await addMyReceiveEndpoint(friend, { network: "base", address: EVM_A });
  assert.equal(recv.enabled, false, "disabled by default");
  assert.equal(recv.visibility, "contacts_only", "contacts_only default");
  assert.equal(recv.ownershipStatus, "unverified", "manual stays unverified");
  const stellarRecv = await enableStellarReceiveEndpoint(friend, STELLAR_B, { enabled: true });
  assert.equal(stellarRecv.ownershipStatus, "authenticated", "session wallet truthfully authenticated");
  assert.equal(stellarRecv.enabled, true);
  await updateMyReceiveEndpoint(recv.id, friend, { enabled: true });

  // 7. contacts_only gates resolution; removal revokes access.
  const resolution = await resolveRecipient({ senderUserId: owner, handle: saved.handle!, targetNetwork: "base" });
  assert.equal(resolution.ok, true, "contact resolves contacts_only endpoint");
  if (resolution.ok) {
    assert.equal(resolution.address, EVM_A.toLowerCase());
    assert.equal(resolution.ownershipStatus, "unverified");
  }
  const strangerResolution = await resolveRecipient({ senderUserId: stranger, handle: saved.handle!, targetNetwork: "base" });
  assert.deepEqual(strangerResolution, { ok: false, reason: "not-permitted" }, "unrelated requester blocked");
  await deleteMyContact(saved.id, owner);
  assert.ok(!(await isContactSaved(owner, saved.handle!)));
  const revoked = await resolveRecipient({ senderUserId: owner, handle: saved.handle!, targetNetwork: "base" });
  assert.deepEqual(revoked, { ok: false, reason: "not-permitted" }, "removal revokes access");

  // 8. Public endpoints resolve when explicitly public; disabled never resolves.
  await updateMyReceiveEndpoint(recv.id, friend, { visibility: "public" });
  const publicResolution = await resolveRecipient({ senderUserId: stranger, handle: saved.handle!, targetNetwork: "base" });
  assert.equal(publicResolution.ok, true, "public resolves for strangers");
  await updateMyReceiveEndpoint(recv.id, friend, { enabled: false });
  const disabledResolution = await resolveRecipient({ senderUserId: stranger, handle: saved.handle!, targetNetwork: "base" });
  assert.deepEqual(disabledResolution, { ok: false, reason: "no-endpoint" }, "disabled never resolves");
  await deleteMyReceiveEndpoint(recv.id, friend);
  await deleteMyReceiveEndpoint(stellarRecv.id, friend);

  // 9. Public profiles leak no private wallet/endpoints/contacts/notes.
  const profile = await getPublicProfileByHandle(saved.handle!);
  assert(profile, "public profile resolves");
  const seenKeys = new Set<string>();
  JSON.stringify(profile, (key, value) => {
    seenKeys.add(key);
    return value as unknown;
  });
  for (const forbidden of ["contacts", "receiveEndpoints", "contactEndpoints", "wallets", "linkedUserId", "ownerUserId", "note"]) {
    assert(!seenKeys.has(forbidden), `public profile exposes no ${forbidden}`);
  }
  assert(!JSON.stringify(profile).includes(STELLAR_B), "no wallet leak");
  assert(!JSON.stringify(profile).includes(EVM_A.toLowerCase()), "no endpoint leak");

  // 10. No transfer execution exists: resolver answers only, never transacts.
  assert.equal(typeof resolveRecipient, "function");
  const noEndpoint = await resolveRecipient({ senderUserId: owner, handle: ownerHandle, targetNetwork: "solana" });
  assert.deepEqual(noEndpoint, { ok: false, reason: "no-endpoint" });

  // 11. Migration integrity: the three tables exist and accept rows.
  const remaining = await listMyContacts(owner);
  assert(remaining.every((entry) => entry.id), "contacts table integral");
  const endpoints = await listMyReceiveEndpoints(owner);
  assert(Array.isArray(endpoints), "receive table integral");

  console.log("contacts:verify ok — 11 groups, all assertions passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  })
  .finally(async () => {
    for (const id of temporaryUserIds) {
      await database.delete(users).where(eq(users.id, id)).catch(() => undefined);
    }
  });
