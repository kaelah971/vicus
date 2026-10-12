import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "@/db";
import { hasOversizedBody, isSameOriginRequest } from "@/lib/auth/request";
import { AgentApiError, requestAgentQuote } from "@/lib/agent-api/service";

export const dynamic = "force-dynamic";

/**
 * Stateless indicative quote over server-owned routes. Intent in, live price
 * out. Mints, venue, and slippage are resolved server-side — the body cannot
 * supply them. Execution still requires an order, eligibility, a wallet
 * signature, and Vicus verification through the existing flows.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request) || (await hasOversizedBody(request, 8_000))) {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "That request could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-request", message: "Provide the quote intent." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const quote = await requestAgentQuote(body);
    return NextResponse.json({ ok: true, quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AgentApiError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { ok: false, code: "database-unavailable", message: "The Vicus database is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "quote-unavailable", message: "No executable price right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
