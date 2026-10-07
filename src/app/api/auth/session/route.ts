import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession, isSessionUnavailableError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: session.user,
        wallet: {
          network: session.wallet.network,
          publicKey: session.wallet.publicKey,
          verifiedAt: session.wallet.verifiedAt.toISOString(),
        },
        expiresAt: session.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { authenticated: false, code: "database-unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (isSessionUnavailableError(error)) {
      return NextResponse.json(
        { authenticated: false, code: "session-unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { authenticated: false, code: "session-unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
