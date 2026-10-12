import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { UtilityOrderError, checkOrderFunding } from "@/lib/external-utility/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof UtilityOrderError) {
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
    { ok: false, code: "utility-unavailable", message: "Funding checks are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Funding gate: compares the owned order's required spend against the real
 * onchain balance of the server-stored execution wallet. No wallet input —
 * the order's wallet is resolved server-side from the owner's row.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to check funding." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const funding = await checkOrderFunding(id, session.user.id);
    return NextResponse.json({ ok: true, funding }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
