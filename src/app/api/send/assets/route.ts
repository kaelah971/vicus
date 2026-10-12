import { NextResponse } from "next/server";
import { SENDABLE_ASSETS, SEND_NETWORK, SEND_NETWORK_LABEL } from "@/lib/send/service";

export const dynamic = "force-dynamic";

/** Public send policy: which Circles expose an executable Send. No secrets. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      network: SEND_NETWORK,
      networkLabel: SEND_NETWORK_LABEL,
      assets: SENDABLE_ASSETS.map((entry) => ({
        slug: entry.slug,
        code: entry.code,
        permissioned: entry.permissioned,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
