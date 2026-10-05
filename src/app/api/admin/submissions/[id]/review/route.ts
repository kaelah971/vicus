import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { reviewMissionSubmission } from "@/lib/missions/service";
import type { ReviewAction } from "@/lib/missions/service";

export const dynamic = "force-dynamic";

const reviewActions = new Set<ReviewAction>(["approved", "rejected", "needs_revision"]);

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
      { ok: false, code: "request-too-large", message: "The review request is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in with an admin wallet to review submissions." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "This wallet is not authorized to review submissions." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send a review action." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isRecord(payload) || typeof payload.action !== "string" || !reviewActions.has(payload.action as ReviewAction)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Choose an approved, rejected, or revision result." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { id } = await params;
    const outcome = await reviewMissionSubmission(
      id,
      payload.action as ReviewAction,
      payload.reason,
      session.user.id,
    );
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
