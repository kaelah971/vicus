import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import {
  addContactEndpoint,
  deleteMyContact,
  getMyContact,
  updateMyContact,
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
    { ok: false, code: "contacts-unavailable", message: "Contacts are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function sessionUserId(): Promise<string | NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to manage contacts." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return session.user.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const auth = await sessionUserId();
    if (typeof auth !== "string") return auth;
    const contact = await getMyContact(id, auth);
    return NextResponse.json({ ok: true, contact }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
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
      { ok: false, code: "request-too-large", message: "The contact request is too large." },
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
    const auth = await sessionUserId();
    if (typeof auth !== "string") return auth;
    // Endpoint additions ride the same route: { network, address, label }.
    if (body.network !== undefined || body.address !== undefined) {
      const endpoint = await addContactEndpoint(id, auth, {
        network: body.network,
        address: body.address,
        label: body.label,
      });
      return NextResponse.json({ ok: true, endpoint }, { headers: { "Cache-Control": "no-store" } });
    }
    const contact = await updateMyContact(id, auth, {
      displayName: body.displayName,
      note: body.note,
    });
    return NextResponse.json({ ok: true, contact }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isSameOriginRequest(_request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const auth = await sessionUserId();
    if (typeof auth !== "string") return auth;
    const outcome = await deleteMyContact(id, auth);
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
