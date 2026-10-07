import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { isSameOriginRequest, hasOversizedBody } from "@/lib/auth/request";
import { RewardActionError, RewardSettlementError } from "@/lib/rewards/errors";
import { claimRewardForSession, requireRewardSession } from "@/lib/rewards/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof RewardActionError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof RewardSettlementError) {
    return NextResponse.json(
      { ok: false, code: "reward-unavailable", message: "The reward could not be settled. Try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable. No reward was confirmed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, code: "reward-unavailable", message: "The reward could not be settled. Try again later." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
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
  if (hasOversizedBody(request, 4_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "The reward request is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  let session;
  try {
    session = requireRewardSession(await getCurrentSession());
  } catch (error) {
    return errorResponse(error);
  }

  try {
    const { id } = await params;
    const reward = await claimRewardForSession(id, session);
    return NextResponse.json({ ok: true, reward }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
