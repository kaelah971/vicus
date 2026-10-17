import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { submitSpaceApplicationDraft } from "@/lib/organizations/service";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof MissionActionError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "The application could not be submitted." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "application-unavailable", message: "The application could not be submitted." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Submit an owned draft for review. Validates identity, asset documents,
 * and eligibility; incomplete drafts stay drafts with actionable errors.
 */
export async function POST(request: Request, { params }: RouteParams) {
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
      { ok: false, code: "unauthenticated", message: "Sign in to submit this application." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const application = await submitSpaceApplicationDraft(session.user.id, id);
    return NextResponse.json({ ok: true, application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
