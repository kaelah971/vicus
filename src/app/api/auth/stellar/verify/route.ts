import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { AuthConfigurationError } from "@/lib/auth/config";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import {
  verifyWalletMessage,
  WalletMessageError,
} from "@/lib/auth/stellar";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function responseBody(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return responseBody({ ok: false, code: "forbidden", message: "The request origin is not allowed." }, 403);
  }

  if (hasOversizedBody(request, 30_000)) {
    return responseBody({ ok: false, code: "request-too-large", message: "The signed message is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return responseBody(
      { ok: false, code: "invalid-request", message: "Send the signed wallet message as JSON." },
      400,
    );
  }

  const message =
    typeof payload === "object" && payload !== null && "message" in payload
      ? payload.message
      : null;
  const signature =
    typeof payload === "object" && payload !== null && "signature" in payload
      ? payload.signature
      : null;
  if (
    typeof message !== "string" ||
    message.length > 2_000 ||
    typeof signature !== "string" ||
    signature.length > 256
  ) {
    return responseBody(
      { ok: false, code: "invalid-request", message: "The signed wallet message is invalid." },
      400,
    );
  }

  try {
    const result = await verifyWalletMessage(message, signature);
    const response = responseBody({
      ok: true,
      user: result.user,
      wallet: {
        network: result.wallet.network,
        publicKey: result.wallet.publicKey,
        verifiedAt: result.wallet.verifiedAt.toISOString(),
      },
      expiresAt: result.session.expiresAt.toISOString(),
    });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: result.session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (error) {
    if (error instanceof WalletMessageError) {
      return responseBody(
        { ok: false, code: "wallet-not-verified", message: error.message },
        401,
      );
    }

    if (error instanceof AuthConfigurationError) {
      return responseBody(
        { ok: false, code: "auth-not-configured", message: "Wallet authentication is not configured." },
        503,
      );
    }

    if (isDatabaseUnavailableError(error)) {
      return responseBody(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        503,
      );
    }

    console.error("[auth] wallet message verification failed");
    return responseBody(
      { ok: false, code: "wallet-verification-unavailable", message: "The Stellar wallet message could not be verified." },
      503,
    );
  }
}
