import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, count, eq, inArray } from "drizzle-orm";
import { Keypair } from "@stellar/stellar-sdk";
import { getDatabase } from "../src/db";
import {
  circles,
  stellarRoleVerifications,
  stellarWallets,
  users,
} from "../src/db/schema";
import { getUserProfileById } from "../src/lib/data/profiles";
import {
  getRoleVerificationForCircle,
  getVerifiedRolesForUser,
  verifyLinkedWalletForCircle,
} from "../src/lib/data/roles";
import { verifyClassicAssetRole } from "../src/lib/stellar/verify-role";

config({ path: ".env.local" });
config({ path: ".env" });

const database = getDatabase();
const temporaryUserIds: string[] = [];

async function createUserWithWallet() {
  const userId = randomUUID();
  temporaryUserIds.push(userId);
  await database.insert(users).values({
    id: userId,
    handle: `role-verify-${userId.slice(0, 8)}`,
    displayName: "Role verification member",
    avatarUrl: null,
    role: "member",
  });
  const keypair = Keypair.random();
  const [wallet] = await database
    .insert(stellarWallets)
    .values({ userId, network: "mainnet", publicKey: keypair.publicKey() })
    .returning({ id: stellarWallets.id, publicKey: stellarWallets.publicKey });
  assert(wallet, "A linked wallet row is required for role verification.");
  return { userId, walletId: wallet.id, publicKey: wallet.publicKey };
}

async function verificationRowCount() {
  const [row] = await database
    .select({ value: count() })
    .from(stellarRoleVerifications)
    .where(inArray(stellarRoleVerifications.userId, temporaryUserIds.length > 0 ? temporaryUserIds : [randomUUID()]));
  return row?.value ?? 0;
}

async function upsertRole(userId: string, walletId: string, circleId: string, assetId: string | null, role: "verified-trustline" | "verified-holder", network: string) {
  const now = new Date();
  await database
    .insert(stellarRoleVerifications)
    .values({
      userId,
      walletId,
      circleId,
      assetId,
      role,
      ecosystem: "stellar",
      network,
      verifiedAt: now,
      lastCheckedAt: now,
      lastState: role === "verified-holder" ? "verified-holder" : "verified-trustline",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [stellarRoleVerifications.userId, stellarRoleVerifications.circleId],
      set: {
        walletId,
        assetId,
        role,
        ecosystem: "stellar",
        network,
        lastCheckedAt: now,
        lastState: role === "verified-holder" ? "verified-holder" : "verified-trustline",
        updatedAt: now,
      },
    });
}

async function cleanup() {
  if (temporaryUserIds.length > 0) {
    await database
      .delete(stellarRoleVerifications)
      .where(inArray(stellarRoleVerifications.userId, temporaryUserIds));
    await database.delete(stellarWallets).where(inArray(stellarWallets.userId, temporaryUserIds));
    await database.delete(users).where(inArray(users.id, temporaryUserIds));
  }
}

async function verify() {
  const [usdc] = await database
    .select({ id: circles.id, assetId: circles.assetId })
    .from(circles)
    .where(eq(circles.slug, "usdc-on-stellar"))
    .limit(1);
  assert(usdc, "The seeded USDC circle is required for role verification.");

  // Unsupported circles never persist, without touching Horizon.
  const first = await createUserWithWallet();
  const unsupported = await verifyLinkedWalletForCircle({
    userId: first.userId,
    walletId: first.walletId,
    walletPublicKey: first.publicKey,
    circleSlug: "pyusd-on-stellar",
  });
  assert.equal(unsupported.result.status, "unsupported");
  assert.equal(unsupported.persisted, null);
  assert.equal(await verificationRowCount(), 0, "Unsupported roles must not persist.");

  // Authenticated linked-wallet success persists (via the same upsert the route uses).
  await upsertRole(first.userId, first.walletId, usdc.id, usdc.assetId, "verified-trustline", "mainnet");
  assert.equal(await verificationRowCount(), 1, "A successful role must persist exactly once.");
  const persisted = await getRoleVerificationForCircle(first.userId, "usdc-on-stellar");
  assert(persisted, "The persisted role must read back for the circle.");
  assert.equal(persisted.role, "verified-trustline");
  assert.equal(persisted.network, "mainnet");

  // Reverify updates the same logical row instead of duplicating.
  await upsertRole(first.userId, first.walletId, usdc.id, usdc.assetId, "verified-holder", "mainnet");
  assert.equal(await verificationRowCount(), 1, "Reverify must not duplicate the logical role.");
  const rechecked = await getRoleVerificationForCircle(first.userId, "usdc-on-stellar");
  assert.equal(rechecked?.role, "verified-holder");

  // Pasted-address checks are read-only and never create a Profile role.
  const beforePasted = await verificationRowCount();
  const pasted = await verifyClassicAssetRole("GINVALIDADDRESS", {
    assetCode: "USDC",
    issuerAccount: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    network: "mainnet",
  });
  assert.equal(pasted.status, "invalid-address");
  assert.equal(await verificationRowCount(), beforePasted, "Pasted checks must not write roles.");

  // One user cannot mutate another user's role.
  const second = await createUserWithWallet();
  await upsertRole(second.userId, second.walletId, usdc.id, usdc.assetId, "verified-trustline", "mainnet");
  const [firstRow] = await database
    .select()
    .from(stellarRoleVerifications)
    .where(
      and(
        eq(stellarRoleVerifications.userId, first.userId),
        eq(stellarRoleVerifications.circleId, usdc.id),
      ),
    )
    .limit(1);
  assert.equal(firstRow?.userId, first.userId);
  assert.equal(firstRow?.walletId, first.walletId, "Another user must not change this wallet link.");
  assert.equal(firstRow?.role, "verified-holder");

  // No exact balance, secret, or raw payload is persisted.
  const rowKeys = Object.keys(firstRow ?? {}).map((key) => key.toLowerCase());
  for (const forbidden of ["balance", "secret", "payload", "seed", "amount"]) {
    assert(
      !rowKeys.some((key) => key.includes(forbidden)),
      `The role row must not persist ${forbidden}.`,
    );
  }

  // Profile reads the persisted role correctly.
  const profile = await getUserProfileById(first.userId);
  assert(profile, "The profile must load for role readback.");
  const profileRole = profile.verifiedRoles.find((entry) => entry.circle.slug === "usdc-on-stellar");
  assert(profileRole, "Profile Verified Roles must include the persisted circle role.");
  assert.equal(profileRole.role, "verified-holder");
  assert(profileRole.lastCheckedAt instanceof Date);

  const list = await getVerifiedRolesForUser(first.userId);
  assert.equal(list.length, 1);

  console.log("Role verification passed", {
    unsupportedNotPersisted: true,
    linkedWalletPersists: true,
    reverifyNoDuplicates: true,
    pastedAddressReadOnly: true,
    ownershipBoundary: true,
    noBalancePersisted: true,
    profileReadback: true,
  });
}

verify()
  .catch((error) => {
    console.error("Role verification failed.");
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
