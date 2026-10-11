import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { getUserProfileByHandle } from "@/lib/data/profiles";
import { addOrganizationMember, getOrgIdBySlugOrThrow } from "@/lib/organizations/service";

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
        message: "The Vicus database is unavailable. The member was not added.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "organization-unavailable", message: "The member could not be added." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
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
      { ok: false, code: "unauthenticated", message: "Sign in to manage organization members." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send a member payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isRecord(payload)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send a member payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { slug } = await params;
    const orgId = await getOrgIdBySlugOrThrow(slug);
    const userId =
      typeof payload.userId === "string" && payload.userId.trim()
        ? payload.userId.trim()
        : null;
    const handle =
      typeof payload.handle === "string" && payload.handle.trim()
        ? payload.handle.trim()
        : null;
    let targetId = userId;
    if (!targetId && handle) {
      const profile = await getUserProfileByHandle(handle);
      if (!profile) {
        return NextResponse.json(
          { ok: false, code: "invalid-request", message: "That member could not be found." },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      targetId = profile.user.id;
    }
    const member = await addOrganizationMember(orgId, targetId, payload.role, session.user.id);
    return NextResponse.json({ ok: true, member }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
