import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { submitSpaceApplication } from "@/lib/organizations/service";

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
        message: "The Vicus database is unavailable. The application was not submitted.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "application-unavailable", message: "The application could not be submitted." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (hasOversizedBody(request, 16_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The application is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to apply for a Space." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send an application." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isRecord(payload)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send an application." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const application = await submitSpaceApplication(session.user.id, {
      proposedName: payload.proposedName,
      proposedSlug: payload.proposedSlug,
      description: payload.description,
      websiteUrl: payload.websiteUrl ?? null,
      projectType: payload.projectType,
      ecosystemFocus: payload.ecosystemFocus ?? null,
      requestedPurpose: payload.requestedPurpose,
      affiliationNote: payload.affiliationNote ?? null,
    });
    return NextResponse.json({ ok: true, application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
