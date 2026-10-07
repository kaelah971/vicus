import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/request";
import { getUserRewardStates } from "@/lib/data/rewards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet to view rewards." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rewards = await getUserRewardStates(session.user.id, session.wallet.publicKey);
    return NextResponse.json({ ok: true, rewards }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "rewards-unavailable", message: "Rewards are unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
