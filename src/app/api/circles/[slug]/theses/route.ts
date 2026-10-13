import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { ConvictionError, createThesis, listCircleTheses } from "@/lib/conviction/service";

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
    { ok: false, code: "conviction-unavailable", message: "Theses are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const theses = await listCircleTheses(slug);
    return NextResponse.json({ ok: true, theses }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 24_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
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
      { ok: false, code: "unauthenticated", message: "Sign in to publish a thesis." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the thesis." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { slug } = await params;
    // Position proof (if requested) runs against the session Stellar wallet.
    const thesis = await createThesis(session.user.id, session.wallet.publicKey, { ...body, circleSlug: slug });
    return NextResponse.json({ ok: true, thesis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
