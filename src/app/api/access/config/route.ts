import { NextResponse } from "next/server";
import { getPublicAccessConfig } from "@/lib/access/config";

export const dynamic = "force-dynamic";

/** Public protocol constants only. No secrets, no user data. */
export async function GET() {
  return NextResponse.json(
    { ok: true, config: getPublicAccessConfig() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
