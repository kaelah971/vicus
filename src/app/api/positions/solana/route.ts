import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { PositionsError, getSolanaPositions } from "@/lib/positions/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
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

/**
 * Connected-wallet Solana holdings. Session required; the wallet is read
 * live and never stored. Only known Vicus mints are queried.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view positions." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { wallet?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the connected wallet." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await getSolanaPositions(typeof body?.wallet === "string" ? body.wallet : "");
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
