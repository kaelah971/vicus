import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import {
  getSpaceApplicationForApplicant,
  updateSpaceApplicationDraft,
} from "@/lib/organizations/service";

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
      { ok: false, code: "database-unavailable", message: "The application is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "application-unavailable", message: "The application is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read an owned application (resume drafts, check status). */
export async function GET(_request: Request, { params }: RouteParams) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view this application." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const application = await getSpaceApplicationForApplicant(session.user.id, id);
    return NextResponse.json({ ok: true, application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Edit an owned draft. Submitted applications are read-only (409). */
export async function PATCH(request: Request, { params }: RouteParams) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (hasOversizedBody(request, 32_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The draft update is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to edit this application." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send draft fields to save." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isRecord(payload)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send draft fields to save." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const {
      proposedName,
      proposedSlug,
      description,
      websiteUrl,
      projectType,
      ecosystemFocus,
      requestedPurpose,
      affiliationNote,
      assetDetails,
      eligibility,
    } = payload;
    const draft = await updateSpaceApplicationDraft(session.user.id, id, {
      proposedName,
      proposedSlug,
      description,
      websiteUrl,
      projectType,
      ecosystemFocus,
      requestedPurpose,
      affiliationNote,
      assetDetails,
      eligibility,
    });
    return NextResponse.json({ ok: true, draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
