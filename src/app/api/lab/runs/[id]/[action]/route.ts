import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { LabActionError, fundLabWallet, issueLabAsset, submitLabTrustline } from "@/lib/lab/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof LabActionError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "lab-unavailable", message: "Tokenization Lab is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function requireSession() {
  const session = await getCurrentSession().catch(() => null);
  return session;
}

async function actionParams(request: Request) {
  if (!isSameOriginRequest(request)) return "forbidden";
  if (hasOversizedBody(request, 24_000)) return "too-large";
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const guard = await actionParams(request);
  if (guard === "forbidden") {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (guard === "too-large") {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The request is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }
  const session = await requireSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to use the Tokenization Lab." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  try {
    const { id, action } = await params;
    if (action === "submit") {
      const run = await submitLabTrustline(
        id,
        session.user.id,
        isRecord(payload) ? payload.signedXdr : null,
      );
      return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "fund") {
      const result = await fundLabWallet(id, session.user.id);
      return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "issue") {
      const run = await issueLabAsset(id, session.user.id);
      return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Unknown Lab action." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
