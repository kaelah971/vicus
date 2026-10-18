import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { reviewAssetRegistration } from "@/lib/registrations/service";

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
      {
        ok: false,
        code: "database-unavailable",
        message: "The Vicus database is unavailable. The review was not saved.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "review-unavailable", message: "The review could not be saved." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Global-admin decision on a registration request. Server-authorized only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (hasOversizedBody(request, 8_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The review is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to review registrations." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { id } = await params;
  const action = isRecord(body) ? body.action : undefined;
  const note = isRecord(body) && typeof body.note === "string" ? body.note : null;
  try {
    const registration = await reviewAssetRegistration(id, action, note, session.user.id);
    return NextResponse.json({ ok: true, registration }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
