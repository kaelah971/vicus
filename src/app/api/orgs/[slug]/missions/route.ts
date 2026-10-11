import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { createOrgMission, getOrgIdBySlugOrThrow } from "@/lib/organizations/service";

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
        message: "The Vicus database is unavailable. The mission was not created.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "mission-unavailable", message: "The mission could not be created." },
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

  if (hasOversizedBody(request, 24_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The mission payload is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to create missions for this organization." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send a mission payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isRecord(payload)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send a mission payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { slug } = await params;
    const orgId = await getOrgIdBySlugOrThrow(slug);
    const outcome = await createOrgMission(
      orgId,
      {
        circleId: payload.circleId,
        title: payload.title,
        description: payload.description,
        type: payload.type,
        points: payload.points,
        status: payload.status,
        rewardEnabled: payload.rewardEnabled,
        rewardAmount: payload.rewardAmount,
        questions: payload.questions,
        evidenceRequired: payload.evidenceRequired,
        evidencePrompt: payload.evidencePrompt,
      },
      session.user.id,
    );
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
