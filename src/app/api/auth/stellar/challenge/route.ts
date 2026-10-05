import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { AuthConfigurationError } from "@/lib/auth/config";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { issueWalletMessageChallenge, WalletMessageError } from "@/lib/auth/stellar";

export const dynamic = "force-dynamic";

function responseBody(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function readAddress(value: unknown) {
  return typeof value === "string" && value.trim().length <= 80 ? value : null;
}

async function issue(address: string | null) {
  if (!address) {
    return responseBody(
      { ok: false, code: "invalid-address", message: "Send the Stellar account to authenticate." },
      400,
    );
  }

  try {
    const challenge = await issueWalletMessageChallenge(address);
    return responseBody({
      ok: true,
      message: challenge.message,
      address: challenge.address,
      network: challenge.network,
      networkPassphrase: challenge.networkPassphrase,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof WalletMessageError) {
      return responseBody({ ok: false, code: "invalid-address", message: error.message }, 400);
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

    return responseBody(
      { ok: false, code: "challenge-unavailable", message: "A wallet message could not be created." },
      503,
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return responseBody({ ok: false, code: "forbidden", message: "The request origin is not allowed." }, 403);
  }

  if (hasOversizedBody(request, 8_000)) {
    return responseBody({ ok: false, code: "request-too-large", message: "The request is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return responseBody({ ok: false, code: "invalid-request", message: "Send a JSON wallet address." }, 400);
  }

  const address =
    typeof payload === "object" && payload !== null && "address" in payload
      ? readAddress(payload.address)
      : null;
  return issue(address);
}
