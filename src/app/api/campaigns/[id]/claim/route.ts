import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import {
  CampaignActionError,
  claimCampaignReward,
  getCampaignDashboard,
  listEligibleProofs,
  listMyCompletions,
} from "@/lib/campaigns/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof CampaignActionError) {
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
    { ok: false, code: "campaign-unavailable", message: "Campaigns are temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Claim a reward for a verified proof. The destination is always the
 * session's own verified Stellar wallet — never client-supplied. Body
 * carries only { proofKind, proofId }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to claim this reward." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { proofKind?: unknown; proofId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the qualifying proof." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const completion = await claimCampaignReward(
      id,
      session.user.id,
      session.wallet.publicKey,
      { kind: body?.proofKind, id: body?.proofId },
    );
    return NextResponse.json({ ok: true, completion }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** My private completions for this campaign. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view your rewards." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = new URL(request.url);
  try {
    const { id } = await params;
    if (url.searchParams.get("view") === "dashboard") {
      const dashboard = await getCampaignDashboard(id, session.user.id);
      return NextResponse.json({ ok: true, dashboard }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.searchParams.get("view") === "proofs") {
      const proofs = await listEligibleProofs(id, session.user.id);
      return NextResponse.json({ ok: true, proofs }, { headers: { "Cache-Control": "no-store" } });
    }
    const completions = await listMyCompletions(id, session.user.id);
    return NextResponse.json({ ok: true, completions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
