import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import {
  deleteMyReceiveEndpoint,
  enableStellarReceiveEndpoint,
  updateMyReceiveEndpoint,
} from "@/lib/contacts/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof MissionActionError) {
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
    { ok: false, code: "contacts-unavailable", message: "Receive settings are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function sessionContext(): Promise<
  { userId: string; stellarWallet: string } | NextResponse
> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to manage receive addresses." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return { userId: session.user.id, stellarWallet: session.wallet.publicKey };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (hasOversizedBody(request, 8_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The request is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
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
    const auth = await sessionContext();
    if (!(typeof auth === "object" && "userId" in auth)) return auth;
    // The literal id "stellar" addresses the session wallet itself: the only
    // endpoint whose ownership Vicus can truthfully mark authenticated.
    if (id === "stellar") {
      const endpoint = await enableStellarReceiveEndpoint(auth.userId, auth.stellarWallet, {
        enabled: body.enabled,
        visibility: body.visibility,
      });
      return NextResponse.json({ ok: true, endpoint }, { headers: { "Cache-Control": "no-store" } });
    }
    const endpoint = await updateMyReceiveEndpoint(id, auth.userId, {
      enabled: body.enabled,
      visibility: body.visibility,
      label: body.label,
    });
    return NextResponse.json({ ok: true, endpoint }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const auth = await sessionContext();
    if (!(typeof auth === "object" && "userId" in auth)) return auth;
    const outcome = await deleteMyReceiveEndpoint(id, auth.userId);
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
