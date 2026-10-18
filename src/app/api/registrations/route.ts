import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { createAssetRegistration, listMyAssetRegistrations } from "@/lib/registrations/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown, fallback: string) {
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
    { ok: false, code: "registration-unavailable", message: fallback },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/** Applicant's own registration requests with status and reviewer notes. */
export async function GET() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error, "Registrations could not be loaded.");
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view registrations." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const registrations = await listMyAssetRegistrations(session.user.id);
    return NextResponse.json({ ok: true, registrations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Registrations could not be loaded.");
  }
}

/**
 * Applicant requests registration for a canonical asset identity.
 * Valid shape only — a request is never verification.
 */
export async function POST(request: Request) {
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
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error, "The registration could not be saved.");
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to request registration." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  try {
    const registration = await createAssetRegistration(session.user.id, body);
    return NextResponse.json({ ok: true, registration }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "The registration could not be saved.");
  }
}
