import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDatabase, isDatabaseUnavailableError } from "@/db";
import { users } from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { listEcosystems } from "@/lib/data/circles";
import { getUserProfileById } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

const assetInterestOptions = [
  "Stablecoins",
  "Tokenized treasuries",
  "Private credit",
  "Tokenized funds",
  "Commodities",
  "Real estate",
  "Payments",
] as const;

function stringList(value: unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet first." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const profile = await getUserProfileById(session.user.id);
    if (!profile) {
      return NextResponse.json(
        { ok: false, code: "profile-not-found", message: "The Vicus profile could not be found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: false, code: "profile-unavailable", message: "The profile could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (hasOversizedBody(request, 20_000)) {
    return NextResponse.json(
      { ok: false, code: "request-too-large", message: "Profile changes are too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated", message: "Connect a verified Stellar wallet first." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const displayName = typeof payload?.displayName === "string" ? payload.displayName.trim() : "";
    const bio = typeof payload?.bio === "string" ? payload.bio.trim() : "";
    const preferredEcosystems = stringList(payload?.preferredEcosystems, 8);
    const assetInterests = stringList(payload?.assetInterests, 7);
    if (!displayName || displayName.length > 160 || bio.length > 280 || !preferredEcosystems || !assetInterests) {
      return NextResponse.json(
        { ok: false, code: "invalid-profile", message: "Use a display name, a bio under 280 characters, and valid preferences." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const ecosystems = await listEcosystems();
    const ecosystemValues = new Set(ecosystems.map((ecosystem) => ecosystem.value));
    if (preferredEcosystems.some((ecosystem) => !ecosystemValues.has(ecosystem)) || assetInterests.some((interest) => !assetInterestOptions.includes(interest as (typeof assetInterestOptions)[number]))) {
      return NextResponse.json(
        { ok: false, code: "invalid-profile", message: "Choose preferences from the available options." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    await getDatabase()
      .update(users)
      .set({
        displayName,
        bio: bio || null,
        preferredEcosystems,
        assetInterests,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "profile-update-failed", message: "The profile could not be updated." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
