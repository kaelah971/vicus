import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { SendActionError, getSendTransfer, listMySendTransfers } from "@/lib/send/service";

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

/** Sender-private history. No recipient feed in V1. */
export async function GET(request: Request) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view transfers." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get("transferId");
    if (transferId) {
      const transfer = await getSendTransfer(transferId, session.user.id);
      return NextResponse.json({ ok: true, transfer }, { headers: { "Cache-Control": "no-store" } });
    }
    const transfers = await listMySendTransfers(session.user.id);
    return NextResponse.json({ ok: true, transfers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
