import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/request";
import { MissionActionError } from "@/lib/missions/errors";
import { setPostHelpful } from "@/lib/community/service";

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
        message: "The Vicus database is unavailable. The reaction was not saved.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "reaction-unavailable", message: "The reaction could not be saved." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function sessionUserId(): Promise<string | NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to mark posts Helpful." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return session.user.id;
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

  try {
    const auth = await sessionUserId();
    if (typeof auth !== "string") return auth;
    const { postId } = await params;
    const outcome = await setPostHelpful(auth, postId, true);
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
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

  try {
    const auth = await sessionUserId();
    if (typeof auth !== "string") return auth;
    const { postId } = await params;
    const outcome = await setPostHelpful(auth, postId, false);
    return NextResponse.json({ ok: true, ...outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
