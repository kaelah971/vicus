import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/request";
import { unwatchBasket, watchBasket } from "@/lib/baskets/watch";

type RouteProps = { params: Promise<{ ref: string }> };

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

async function readKind(request: Request): Promise<unknown> {
  try {
    const body = (await request.json()) as { kind?: unknown };
    if (typeof body?.kind === "string") return body.kind;
  } catch {
    // No body — fall through to query param.
  }
  return new URL(request.url).searchParams.get("kind");
}

async function requireSession() {
  return getCurrentSession();
}

/**
 * Watch a basket for discovery. Watching tracks a theme; it is not proof
 * of ownership and never executes anything.
 */
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
        { ok: false, code: "unauthenticated", message: "Sign in to watch baskets." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const { ref } = await params;
    const watched = await watchBasket(session.user.id, await readKind(request), ref);
    if (watched === null) {
      return NextResponse.json(
        { ok: false, code: "basket-not-found", message: "That basket could not be found." },
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
        { ok: false, code: "unauthenticated", message: "Sign in to watch baskets." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const { ref } = await params;
    const watched = await unwatchBasket(session.user.id, await readKind(request), ref);
    if (watched === null) {
      return NextResponse.json(
        { ok: false, code: "invalid-request", message: "That watch request could not be accepted." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: true, watched }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
