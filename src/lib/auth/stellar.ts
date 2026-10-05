import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { Keypair } from "@stellar/stellar-sdk";
import { getDatabase } from "@/db";
import { authChallenges, stellarWallets, users } from "@/db/schema";
import { getVicusAuthConfig } from "@/lib/auth/config";
import { createAuthSession } from "@/lib/auth/session";

const MESSAGE_TITLE = "Sign in to Vicus";
const MESSAGE_STATEMENT = "This request proves control of the signing key corresponding to this Stellar address.";
const MESSAGE_BOUNDARY = "It does not submit a transaction or move funds.";
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_SIGNATURE_LENGTH = 256;
const MAX_CHALLENGE_ATTEMPTS = 5;

export class WalletMessageError extends Error {
  constructor(message = "The wallet message is invalid or has expired.") {
    super(message);
    this.name = "WalletMessageError";
  }
}

export type WalletMessageChallenge = {
  message: string;
  address: string;
  network: "mainnet";
  networkPassphrase: string;
  expiresAt: Date;
};

export type WalletAuthResult = {
  session: Awaited<ReturnType<typeof createAuthSession>>;
  user: {
    id: string;
    handle: string;
    displayName: string;
    role: string;
  };
  wallet: {
    id: string;
    network: string;
    publicKey: string;
    verifiedAt: Date;
  };
};

type WalletMessageFields = {
  address: string;
  domain: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
};

type ParsedWalletMessage = WalletMessageFields;

function hashMessage(message: string) {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

function isValidPublicKey(address: string) {
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return false;
  }

  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
}

function decodeSignature(signature: string) {
  if (
    signature.length === 0 ||
    signature.length > MAX_SIGNATURE_LENGTH ||
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(signature)
  ) {
    throw new WalletMessageError();
  }

  const normalized = signature.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Buffer.from(padded, "base64");

  if (bytes.length !== 64) {
    throw new WalletMessageError();
  }

  return new Uint8Array(bytes);
}

export function buildWalletAuthMessage(fields: WalletMessageFields) {
  return [
    MESSAGE_TITLE,
    "",
    `Address: ${fields.address}`,
    "Network: Stellar mainnet",
    `Domain: ${fields.domain}`,
    `Nonce: ${fields.nonce}`,
    `Issued at: ${fields.issuedAt.toISOString()}`,
    `Expires at: ${fields.expiresAt.toISOString()}`,
    "",
    MESSAGE_STATEMENT,
    MESSAGE_BOUNDARY,
  ].join("\n");
}

function parseIsoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
}

function fieldLine(lines: string[], index: number, prefix: string) {
  if (!lines[index]?.startsWith(prefix)) {
    return null;
  }

  const value = lines[index].slice(prefix.length);
  return value || null;
}

function parseWalletAuthMessage(
  message: string,
  config: ReturnType<typeof getVicusAuthConfig>,
  now = new Date(),
): ParsedWalletMessage | null {
  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  const lines = message.split("\n");
  if (
    lines.length !== 11 ||
    lines[0] !== MESSAGE_TITLE ||
    lines[1] !== "" ||
    lines[3] !== "Network: Stellar mainnet" ||
    lines[8] !== "" ||
    lines[9] !== MESSAGE_STATEMENT ||
    lines[10] !== MESSAGE_BOUNDARY
  ) {
    return null;
  }

  const address = fieldLine(lines, 2, "Address: ");
  const domain = fieldLine(lines, 4, "Domain: ");
  const nonce = fieldLine(lines, 5, "Nonce: ");
  const issuedAtText = fieldLine(lines, 6, "Issued at: ");
  const expiresAtText = fieldLine(lines, 7, "Expires at: ");
  const issuedAt = issuedAtText ? parseIsoDate(issuedAtText) : null;
  const expiresAt = expiresAtText ? parseIsoDate(expiresAtText) : null;

  if (
    !address ||
    !domain ||
    !nonce ||
    !issuedAt ||
    !expiresAt ||
    !NONCE_PATTERN.test(nonce) ||
    !isValidPublicKey(address) ||
    domain !== config.homeDomain ||
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() !== config.challengeTtlSeconds * 1_000 ||
    issuedAt.getTime() > now.getTime() + 30_000 ||
    expiresAt.getTime() <= now.getTime()
  ) {
    return null;
  }

  const fields = { address, domain, nonce, issuedAt, expiresAt };
  return buildWalletAuthMessage(fields) === message ? fields : null;
}

function adminWalletAddresses() {
  return new Set(
    (process.env.VICUS_ADMIN_WALLET_ADDRESSES ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
}

async function createMember(database: ReturnType<typeof getDatabase>, address: string) {
  const role = adminWalletAddresses().has(address) ? "admin" : "member";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const handle = `stellar-${randomBytes(8).toString("hex")}`;
    const [user] = await database
      .insert(users)
      .values({
        handle,
        displayName: "Stellar member",
        avatarUrl: null,
        role,
      })
      .onConflictDoNothing({ target: users.handle })
      .returning({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        role: users.role,
      });

    if (user) {
      return user;
    }
  }

  throw new Error("The Vicus member could not be created.");
}

export async function issueWalletMessageChallenge(address: string): Promise<WalletMessageChallenge> {
  const normalizedAddress = address.trim().toUpperCase();
  if (!isValidPublicKey(normalizedAddress)) {
    throw new WalletMessageError("Connect a valid Stellar mainnet account.");
  }

  const config = getVicusAuthConfig();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + config.challengeTtlSeconds * 1_000);
  const message = buildWalletAuthMessage({
    address: normalizedAddress,
    domain: config.homeDomain,
    nonce: randomBytes(32).toString("base64url"),
    issuedAt,
    expiresAt,
  });
  const database = getDatabase();

  await database.delete(authChallenges).where(lt(authChallenges.expiresAt, issuedAt));
  await database.insert(authChallenges).values({
    challengeHash: hashMessage(message),
    network: config.network,
    expiresAt,
    createdAt: issuedAt,
  });

  return {
    message,
    address: normalizedAddress,
    network: config.network,
    networkPassphrase: config.networkPassphrase,
    expiresAt,
  };
}

export async function verifyWalletMessage(message: string, signature: string): Promise<WalletAuthResult> {
  const config = getVicusAuthConfig();
  const database = getDatabase();
  const parsed = parseWalletAuthMessage(message, config);

  if (!parsed) {
    throw new WalletMessageError();
  }

  const challengeHash = hashMessage(message);
  const [challenge] = await database
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.challengeHash, challengeHash),
        eq(authChallenges.network, config.network),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!challenge || Math.abs(challenge.expiresAt.getTime() - parsed.expiresAt.getTime()) > 1_000) {
    throw new WalletMessageError();
  }

  const [attemptedChallenge] = await database
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(
      and(
        eq(authChallenges.id, challenge.id),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, new Date()),
        lt(authChallenges.attempts, MAX_CHALLENGE_ATTEMPTS),
      ),
    )
    .returning({ id: authChallenges.id });

  if (!attemptedChallenge) {
    throw new WalletMessageError("This wallet challenge has expired or exceeded its retry limit.");
  }

  try {
    const signatureBytes = decodeSignature(signature);
    const keypair = Keypair.fromPublicKey(parsed.address);
    if (!keypair.verifyMessage(message, signatureBytes)) {
      throw new WalletMessageError("The wallet signature could not be verified.");
    }
  } catch (error) {
    if (error instanceof WalletMessageError) {
      throw error;
    }

    throw new WalletMessageError("The wallet signature could not be verified.");
  }

  const consumedAt = new Date();
  const consumedRows = await database
    .update(authChallenges)
    .set({ consumedAt })
    .where(
      and(
        eq(authChallenges.id, challenge.id),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, consumedAt),
      ),
    )
    .returning({ id: authChallenges.id });

  if (consumedRows.length !== 1) {
    throw new WalletMessageError("This wallet challenge has already been used.");
  }

  const network = config.network;
  let wallet: typeof stellarWallets.$inferSelect | undefined;
  let user: {
    id: string;
    handle: string;
    displayName: string;
    role: string;
  } | undefined;

  const [existing] = await database
    .select({ wallet: stellarWallets, user: users })
    .from(stellarWallets)
    .innerJoin(users, eq(stellarWallets.userId, users.id))
    .where(and(eq(stellarWallets.network, network), eq(stellarWallets.publicKey, parsed.address)))
    .limit(1);

  if (existing) {
    wallet = existing.wallet;
    user = existing.user;
  } else {
    const createdUser = await createMember(database, parsed.address);
    const [createdWallet] = await database
      .insert(stellarWallets)
      .values({
        userId: createdUser.id,
        network,
        publicKey: parsed.address,
        verifiedAt: consumedAt,
        lastUsedAt: consumedAt,
        createdAt: consumedAt,
        updatedAt: consumedAt,
      })
      .onConflictDoNothing({ target: [stellarWallets.network, stellarWallets.publicKey] })
      .returning();

    if (createdWallet) {
      wallet = createdWallet;
      user = createdUser;
    } else {
      const [racedWallet] = await database
        .select({ wallet: stellarWallets, user: users })
        .from(stellarWallets)
        .innerJoin(users, eq(stellarWallets.userId, users.id))
        .where(and(eq(stellarWallets.network, network), eq(stellarWallets.publicKey, parsed.address)))
        .limit(1);
      wallet = racedWallet?.wallet;
      user = racedWallet?.user;
    }
  }

  if (!wallet || !user) {
    throw new Error("The verified Stellar wallet could not be linked.");
  }

  const role = adminWalletAddresses().has(parsed.address) ? "admin" : user.role;
  if (role !== user.role) {
    const [updatedUser] = await database
      .update(users)
      .set({ role, updatedAt: consumedAt })
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        role: users.role,
      });
    user = updatedUser ?? { ...user, role };
  }

  const [updatedWallet] = await database
    .update(stellarWallets)
    .set({ verifiedAt: consumedAt, lastUsedAt: consumedAt, updatedAt: consumedAt })
    .where(eq(stellarWallets.id, wallet.id))
    .returning();
  wallet = updatedWallet ?? wallet;

  const session = await createAuthSession(user.id, wallet.id, config.sessionTtlSeconds);

  return {
    session,
    user,
    wallet: {
      id: wallet.id,
      network: wallet.network,
      publicKey: wallet.publicKey,
      verifiedAt: wallet.verifiedAt,
    },
  };
}
