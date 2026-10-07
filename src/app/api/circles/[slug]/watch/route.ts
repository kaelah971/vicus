import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/request";
import { unwatchCircle, watchCircle } from "@/lib/data/watch";

type RouteProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "Watch state is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: false, code: "watch-unavailable", message: "Watch state could not be updated." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function requireSession() {
  return getCurrentSession();
}

export async function POST(request: Request, { params }: RouteProps) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet to watch an asset." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const { slug } = await params;
    const watched = await watchCircle(session.user.id, slug);
    if (watched === null) {
      return NextResponse.json(
        { ok: false, code: "circle-not-found", message: "That asset circle could not be found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: true, watched }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet to manage watched assets." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const { slug } = await params;
    const watched = await unwatchCircle(session.user.id, slug);
    if (watched === null) {
      return NextResponse.json(
        { ok: false, code: "circle-not-found", message: "That asset circle could not be found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: true, watched }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
