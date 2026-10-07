import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDatabase, isDatabaseUnavailableError } from "@/db";
import { authSessions, stellarWallets, users } from "@/db/schema";

export const AUTH_COOKIE_NAME = "vicus_session";
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export class SessionUnavailableError extends Error {
  constructor() {
    super("The Vicus session service is temporarily unavailable.");
    this.name = "SessionUnavailableError";
  }
}

export function isSessionUnavailableError(error: unknown): error is SessionUnavailableError {
  return error instanceof SessionUnavailableError;
}

export type AuthenticatedSession = {
  sessionId: string;
  user: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
  };
  wallet: {
    id: string;
    network: string;
    publicKey: string;
    verifiedAt: Date;
  };
  expiresAt: Date;
};

type SessionRow = {
  session: typeof authSessions.$inferSelect;
  user: typeof users.$inferSelect;
  wallet: typeof stellarWallets.$inferSelect;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function mapSession(row: SessionRow): AuthenticatedSession {
  return {
    sessionId: row.session.id,
    user: {
      id: row.user.id,
      handle: row.user.handle,
      displayName: row.user.displayName,
      avatarUrl: row.user.avatarUrl,
      role: row.user.role,
    },
    wallet: {
      id: row.wallet.id,
      network: row.wallet.network,
      publicKey: row.wallet.publicKey,
      verifiedAt: row.wallet.verifiedAt,
    },
    expiresAt: row.session.expiresAt,
  };
}

async function findSessionByTokenHash(tokenHash: string) {
  const database = getDatabase();
  const [row] = await database
    .select({ session: authSessions, user: users, wallet: stellarWallets })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .innerJoin(stellarWallets, eq(authSessions.walletId, stellarWallets.id))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row as SessionRow | undefined;
}

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token || token.length > 200) {
    return null;
  }

  try {
    const row = await findSessionByTokenHash(hashSessionToken(token));
    return row ? mapSession(row) : null;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      throw error;
    }

    console.error("[auth] session lookup failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new SessionUnavailableError();
  }
}

export async function createAuthSession(userId: string, walletId: string, expiresInSeconds = AUTH_COOKIE_MAX_AGE) {
  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1_000);
  const database = getDatabase();
  const [session] = await database
    .insert(authSessions)
    .values({
      tokenHash: hashSessionToken(token),
      userId,
      walletId,
      expiresAt,
      lastSeenAt: now,
      createdAt: now,
    })
    .returning({ id: authSessions.id });

  if (!session) {
    throw new Error("The Vicus session could not be created.");
  }

  return { token, sessionId: session.id, expiresAt };
}

export async function revokeSessionToken(token: string) {
  const database = getDatabase();
  await database
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.tokenHash, hashSessionToken(token)), isNull(authSessions.revokedAt)));
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token && token.length <= 200) {
    await revokeSessionToken(token);
  }
}
