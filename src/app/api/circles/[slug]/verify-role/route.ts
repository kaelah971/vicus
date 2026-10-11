import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/request";
import {
  getRoleVerificationForCircle,
  verifyLinkedWalletForCircle,
} from "@/lib/data/roles";

type RouteProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Read the current user's persisted role for this circle. Never accepts an
 * address: pasted-address checks stay on /api/stellar/verify-role (read-only).
 */
export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return noStore(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet first." },
        401,
      );
    }

    const { slug } = await params;
    const verification = await getRoleVerificationForCircle(session.user.id, slug);
    return noStore({ ok: true, verification });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return noStore(
        { ok: false, code: "database-unavailable", message: "Role state is temporarily unavailable." },
        503,
      );
    }
    return noStore(
      { ok: false, code: "role-unavailable", message: "Role state could not be loaded." },
      503,
    );
  }
}

/**
 * Verify the authenticated user's linked wallet and persist ONLY a successful
 * supported role. The wallet comes from the server session — the request body
 * cannot choose a different address, so one user cannot mutate another's role
 * and a pasted address can never create a Profile role.
 */
export async function POST(request: Request, { params }: RouteProps) {
  if (!isSameOriginRequest(request)) {
    return noStore(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      403,
    );
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return noStore(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet to verify a role." },
        401,
      );
    }

    const { slug } = await params;
    const { result, persisted } = await verifyLinkedWalletForCircle({
      userId: session.user.id,
      walletId: session.wallet.id,
      walletPublicKey: session.wallet.publicKey,
      circleSlug: slug,
    });

    return noStore({ ok: true, result, verification: persisted });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return noStore(
        { ok: false, code: "database-unavailable", message: "Role verification is temporarily unavailable." },
        503,
      );
    }
    return noStore(
      { ok: false, code: "role-unavailable", message: "Role verification could not be completed." },
      503,
    );
  }
}
