import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import {
  CrosschainSendError,
  createCrosschainSend,
  listMyCrosschainSends,
} from "@/lib/crosschain-send/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof CrosschainSendError) {
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
    { ok: false, code: "send-unavailable", message: "Cross-chain sends are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view sends." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const sends = await listMyCrosschainSends(session.user.id);
    return NextResponse.json({ ok: true, sends }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

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
      { ok: false, code: "unauthenticated", message: "Sign in to send." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { handle?: unknown; contactId?: unknown; destinationNetwork?: unknown; amount?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the send details." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    // Sender identity comes from the session wallet, never the client body.
    // The destination address is server-resolved from the recipient's receive
    // endpoint — the body carries no address and cannot substitute one.
    const send = await createCrosschainSend(session.user.id, session.wallet.publicKey, body ?? {});
    return NextResponse.json({ ok: true, send }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
