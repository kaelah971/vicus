import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { PositionsError, getStellarPositions } from "@/lib/positions/service";

export const dynamic = "force-dynamic";

/** Authenticated Stellar holdings for the session wallet. Private. */
export async function GET() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view positions." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view positions." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await getStellarPositions(session.wallet.publicKey);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PositionsError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "positions-unavailable", message: "Positions are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
