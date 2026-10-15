import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { BasketsError } from "@/lib/baskets/service";
import { createUserBasket } from "@/lib/baskets/user";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof BasketsError) {
    return NextResponse.json(
      { ok: false, code: "basket-invalid", message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "Baskets are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "basket-unavailable", message: "That basket could not be saved." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Create a personal discovery basket. Ownership derives from the server
 * session; the body carries only name/theme/rationale/constituents.
 * Nothing here acquires assets or spends funds.
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
      { ok: false, code: "unauthenticated", message: "Sign in to save baskets." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { name?: unknown; theme?: unknown; rationale?: unknown; constituents?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Describe the basket to save it." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const basket = await createUserBasket(session.user.id, {
      name: body?.name,
      theme: body?.theme,
      rationale: body?.rationale,
      constituents: body?.constituents,
    });
    return NextResponse.json({ ok: true, basket }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
