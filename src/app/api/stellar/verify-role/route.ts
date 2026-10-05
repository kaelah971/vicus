import { NextResponse } from "next/server";
import {
  getCircleVerificationConfig,
} from "@/lib/data/circles";
import { isDatabaseUnavailableError } from "@/db";
import {
  unsupportedVerificationResult,
  verifyClassicAssetRole,
} from "@/lib/stellar/verify-role";
import type { StellarVerificationResult } from "@/lib/stellar/types";

export const dynamic = "force-dynamic";

function response(
  body: StellarVerificationResult | { status: "invalid-request"; reason: string },
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCircleSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 140;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return response(
      { status: "invalid-request", reason: "Send a JSON object with a circle and address." },
      400,
    );
  }

  if (!isRecord(body)) {
    return response(
      { status: "invalid-request", reason: "Send a JSON object with a circle and address." },
      400,
    );
  }

  const circleSlug = typeof body.circleSlug === "string" ? body.circleSlug.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";

  if (!isCircleSlug(circleSlug) || !address || address.length > 100) {
    return response(
      { status: "invalid-request", reason: "Send a circle slug and Stellar public address." },
      400,
    );
  }

  try {
    const config = await getCircleVerificationConfig(circleSlug);

    if (!config) {
      return response(
        { status: "invalid-request", reason: "That circle could not be found." },
        404,
      );
    }

    if (
      config.verificationMode !== "classic-asset" ||
      config.stellarNetwork !== "mainnet" ||
      !config.stellarAssetCode ||
      !config.stellarIssuerAccount
    ) {
      return response(unsupportedVerificationResult(config.stellarAssetCode, config.stellarNetwork));
    }

    return response(
      await verifyClassicAssetRole(address, {
        assetCode: config.stellarAssetCode,
        issuerAccount: config.stellarIssuerAccount,
        network: config.stellarNetwork,
      }),
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return response(
        {
          status: "verification-unavailable",
          role: "none",
          qualified: false,
          reason: "The Vicus database is unavailable. Try again later.",
          assetCode: null,
          network: null,
          checkedAt: new Date().toISOString(),
        },
        503,
      );
    }

    return response(
      {
        status: "verification-unavailable",
        role: "none",
        qualified: false,
        reason: "Verification is temporarily unavailable. Try again later.",
        assetCode: null,
        network: null,
        checkedAt: new Date().toISOString(),
      },
      503,
    );
  }
}
