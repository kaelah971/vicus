import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { ConvictionError, getThesis } from "@/lib/conviction/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const thesis = await getThesis(id);
    return NextResponse.json({ ok: true, thesis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConvictionError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "conviction-unavailable", message: "That thesis is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
