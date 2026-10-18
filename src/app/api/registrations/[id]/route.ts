import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { MissionActionError } from "@/lib/missions/errors";
import { getAssetRegistrationForApplicant } from "@/lib/registrations/service";

export const dynamic = "force-dynamic";

/** Applicant reads one of their own registration requests. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (error instanceof MissionActionError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!session) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Sign in to view registrations." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { id } = await params;
  try {
    const registration = await getAssetRegistrationForApplicant(session.user.id, id);
    return NextResponse.json({ ok: true, registration }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MissionActionError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "registration-unavailable", message: "The registration could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
