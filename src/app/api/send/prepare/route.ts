import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { SendActionError, prepareSend } from "@/lib/send/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof SendActionError) {
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
    { ok: false, code: "send-unavailable", message: "Sending is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (hasOversizedBody(request, 8_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The send request is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
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
      { ok: false, code: "unauthenticated", message: "Sign in to send assets." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const body = (payload ?? {}) as Record<string, unknown>;
  try {
    // Source is always the session wallet; asset policy is server-owned.
    const preparation = await prepareSend(session.user.id, session.wallet.publicKey, {
      circleSlug: body.circleSlug,
      handle: body.handle,
      contactId: body.contactId,
      amount: body.amount,
    });
    return NextResponse.json({ ok: true, preparation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
