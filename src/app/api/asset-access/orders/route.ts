import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import {
  AccessOrderError,
  createAccessOrder,
  getExecutionGate,
  getTargetAsset,
  listMyAccessOrders,
} from "@/lib/asset-access/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AccessOrderError) {
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
    { ok: false, code: "asset-access-unavailable", message: "Asset access is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  const target = getTargetAsset();
  const gate = getExecutionGate();
  if (!session) {
    return NextResponse.json(
      {
        ok: true,
        signedIn: false,
        target,
        executionEnabled: gate.enabled,
        disabledReasons: gate.reasons,
        orders: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const orders = await listMyAccessOrders(session.user.id);
    return NextResponse.json(
      { ok: true, signedIn: true, target, executionEnabled: gate.enabled, disabledReasons: gate.reasons, orders },
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
      { ok: false, code: "unauthenticated", message: "Sign in to access tokenized assets." },
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
  // Server owns every protocol fact: slug must be the verified target, source
  // asset/network and venue come from server config, never the request body.
  try {
    const order = await createAccessOrder(session.user.id, body);
    return NextResponse.json({ ok: true, order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
