import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { listPublicAssets } from "@/lib/agent-api/service";

export const dynamic = "force-dynamic";

/** Public asset directory. No auth; production asset circles only. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listPublicAssets({
      ecosystem: url.searchParams.get("ecosystem"),
      assetClass: url.searchParams.get("assetClass"),
      query: url.searchParams.get("query"),
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "assets-unavailable", message: "The asset directory is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
