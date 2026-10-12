import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { CampaignActionError, getCampaign } from "@/lib/campaigns/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    return NextResponse.json({ ok: true, campaign }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
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
}
