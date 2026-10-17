import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { createSpaceApplicationDraft } from "@/lib/organizations/service";

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
      { ok: false, code: "database-unavailable", message: "The draft could not be created." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "draft-unavailable", message: "The draft could not be created." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/** Start a new application draft. Authenticated applicants only; never submits. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (hasOversizedBody(request, 4_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The request is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to start an application." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const draft = await createSpaceApplicationDraft(session.user.id);
    return NextResponse.json({ ok: true, draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
