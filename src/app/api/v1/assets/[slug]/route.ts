import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { AgentApiError, getPublicAsset } from "@/lib/agent-api/service";

export const dynamic = "force-dynamic";

/** Public asset detail with lifecycle. No auth; safe metadata only. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const asset = await getPublicAsset(slug);
    return NextResponse.json({ ok: true, asset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AgentApiError) {
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
      { ok: false, code: "assets-unavailable", message: "That asset is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
