import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { ConvictionError, resolveThesis, withdrawThesis } from "@/lib/conviction/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ConvictionError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "The database is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "conviction-unavailable", message: "That thesis is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/** Author-only transitions: resolve (with outcome note) or withdraw. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { id, action } = await params;
  if (action !== "resolve" && action !== "withdraw") {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Unknown thesis action." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
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
      { ok: false, code: "unauthenticated", message: "Sign in to change this thesis." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    if (action === "resolve") {
      let body: { outcomeNote?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return NextResponse.json(
          { ok: false, code: "invalid-request", message: "Resolution needs a short outcome note." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const thesis = await resolveThesis(id, session.user.id, body ?? {});
      return NextResponse.json({ ok: true, thesis }, { headers: { "Cache-Control": "no-store" } });
    }
    const thesis = await withdrawThesis(id, session.user.id);
    return NextResponse.json({ ok: true, thesis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
