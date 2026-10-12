import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { AccessOrderError, linkAccessTransfer, recordBaseProgress } from "@/lib/asset-access/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AccessOrderError) {
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
    { ok: false, code: "asset-access-unavailable", message: "Asset access is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/** Link an existing Access (CCTP) transfer — never starts a second burn. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to link a transfer." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { accessTransferId?: unknown; approvalHash?: unknown; swapHash?: unknown; destinationUsdcAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the update details." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    // Record Base-side evidence (hashes/funded amounts) through the same
    // guarded writer; unknown fields stay ignored.
    let order = await recordBaseProgress(id, session.user.id, body ?? {});
    if (body.accessTransferId !== undefined) {
      order = await linkAccessTransfer(id, session.user.id, body.accessTransferId);
    }
    return NextResponse.json({ ok: true, order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
