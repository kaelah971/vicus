import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserProfileById } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

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
      {
        ok: true,
        profile: {
          ...profile,
          memberships: profile.memberships,
          badges: profile.badges,
          contributions: profile.contributions,
          wallets: profile.wallets.map((wallet) => ({
            ...wallet,
            verifiedAt: wallet.verifiedAt.toISOString(),
          })),
        },
      },
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
