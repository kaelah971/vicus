import { NextResponse } from "next/server";
import { getPriceEvidence } from "@/lib/prices/sources";

/**
 * P1.3 — Read-only price evidence endpoint. Server-side fetching only:
 * no provider keys, no mints, no policy reach the browser. Short public
 * cache (60s) matches the server evidence cache; provider failures
 * surface as honest unavailability, never as fabricated values.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get("slug") ?? "").trim().slice(0, 80);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide a catalogue asset slug." },
      { status: 400 },
    );
  }
  const evidence = await getPriceEvidence(slug);
  return NextResponse.json(
    { ok: true, evidence },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
