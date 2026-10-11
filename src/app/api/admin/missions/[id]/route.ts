import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { getDatabase } from "@/db";
import { missions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrgRoles } from "@/lib/organizations/service";
import { applyMissionStatus, updateMissionStatus } from "@/lib/missions/service";

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
        message: "The Vicus database is unavailable. The campaign status was not changed.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "status-unavailable", message: "The campaign status could not be changed." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (hasOversizedBody(request, 4_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The status request is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in with an admin wallet to change campaign status." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Authorization is enforced per path below: global admins via
  // updateMissionStatus, organization owners/admins via their org scope.

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send a campaign status." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isRecord(payload) || (payload.status !== "draft" && payload.status !== "open")) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Campaign status must be draft or open." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { id } = await params;
    if (session.user.role === "admin") {
      const outcome = await updateMissionStatus(id, payload.status, session.user.id);
      return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
    }
    // Organization path: owners/admins may move their own org's missions.
    // updateMissionStatus would reject non-global callers, so authorize the
    // org scope here and reuse the shared persisted transition.
    const database = getDatabase();
    const [mission] = await database
      .select({ organizationId: missions.organizationId })
      .from(missions)
      .where(eq(missions.id, id))
      .limit(1);
    if (!mission?.organizationId) {
      return NextResponse.json(
        { ok: false, code: "forbidden", message: "This wallet is not authorized to change campaign status." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      await requireOrgRoles(session.user.id, mission.organizationId, ["owner", "admin"]);
    } catch (error) {
      return errorResponse(error);
    }
    const outcome = await applyMissionStatus(id, payload.status as "draft" | "open");
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
