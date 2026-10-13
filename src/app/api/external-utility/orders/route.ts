import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { SWAP_TARGET_ASSET, getSwapTarget } from "@/lib/external-utility/config";
import {
  UtilityOrderError,
  createUtilityOrder,
  listMyUtilityOrders,
} from "@/lib/external-utility/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof UtilityOrderError) {
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
    { ok: false, code: "utility-unavailable", message: "Utility swaps are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  // Slug-driven target: the page asks for its own asset; unknown slugs
  // fall back to the default target rather than leaking an error surface.
  const requested = new URL(request.url).searchParams.get("slug");
  const target = (requested && getSwapTarget(requested)) || SWAP_TARGET_ASSET;
  if (!session) {
    return NextResponse.json(
      { ok: true, signedIn: false, target, orders: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const orders = await listMyUtilityOrders(session.user.id);
    return NextResponse.json(
      { ok: true, signedIn: true, target, orders },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to swap." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { targetSlug?: unknown; sourceAmount?: unknown; executionWallet?: unknown; eligibilityAcknowledged?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the order details." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  // Server owns mints, venue, network, and slippage — the body carries only
  // amount, wallet, and the eligibility acknowledgement.
  try {
    const order = await createUtilityOrder(session.user.id, body);
    return NextResponse.json({ ok: true, order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
