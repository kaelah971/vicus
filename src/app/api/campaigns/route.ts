import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { CampaignActionError, createCampaign, listOrgCampaigns } from "@/lib/campaigns/service";

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

export async function POST(request: Request) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to create a campaign." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the campaign details." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const campaign = await createCampaign(session.user.id, body);
    return NextResponse.json({ ok: true, campaign }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Manager-visible campaigns for an organization: ?organizationId=. */
export async function GET(request: Request) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return errorResponse(error);
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to review campaigns." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  try {
    const campaigns = await listOrgCampaigns(organizationId, session.user.id);
    return NextResponse.json({ ok: true, campaigns }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
