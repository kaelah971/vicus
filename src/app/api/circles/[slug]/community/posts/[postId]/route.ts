import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { createCommunityAnswer, removeCommunityPost } from "@/lib/community/service";

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
        message: "The Vicus database is unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "answer-unavailable", message: "The request could not be completed." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (hasOversizedBody(request, 24_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The answer is too large." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to answer this question." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send an answer." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isRecord(payload)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Send an answer." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { postId } = await params;
    const answer = await createCommunityAnswer(session.user.id, postId, payload.body);
    return NextResponse.json({ ok: true, answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
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
      { ok: false, code: "unauthenticated", message: "Sign in to moderate community content." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { postId } = await params;
    const outcome = await removeCommunityPost(session.user.id, postId);
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
