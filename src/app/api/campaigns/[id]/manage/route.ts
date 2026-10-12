import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import {
  CampaignActionError,
  activateCampaign,
  completeCampaign,
  pauseCampaign,
  verifyCampaignFunding,
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

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to manage this campaign." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return session;
}

/** Submit a funding transaction hash; the server verifies everything onchain. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
    if (session instanceof NextResponse) return session;
  } catch (error) {
    return errorResponse(error);
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { fundingTxHash?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the funding transaction hash." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const campaign = await verifyCampaignFunding(id, session.user.id, body?.fundingTxHash);
    return NextResponse.json({ ok: true, campaign }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Lifecycle transitions: {"to":"active"} | {"to":"paused"} | {"to":"completed"}. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
    if (session instanceof NextResponse) return session;
  } catch (error) {
    return errorResponse(error);
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: { to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Choose the next campaign state." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { id } = await params;
    const campaign =
      body?.to === "active"
        ? await activateCampaign(id, session.user.id)
        : body?.to === "paused"
          ? await pauseCampaign(id, session.user.id)
          : body?.to === "completed"
            ? await completeCampaign(id, session.user.id)
            : null;
    if (!campaign) {
      return NextResponse.json(
        { ok: false, code: "invalid-request", message: "Choose active, paused, or completed." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: true, campaign }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
