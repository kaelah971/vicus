import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { isSameOriginRequest } from "@/lib/auth/request";
import {
  AUTH_COOKIE_NAME,
  revokeCurrentSession,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "The request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await revokeCurrentSession();
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: false, code: "logout-unavailable", message: "The session could not be closed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
