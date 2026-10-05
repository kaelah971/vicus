"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { StellarVerificationResult } from "@/lib/stellar/types";

const statusLabels: Record<StellarVerificationResult["status"], string> = {
  "verified-holder": "Verified holder",
  "verified-trustline": "Verified trustline",
  "not-qualified": "Not qualified",
  "invalid-address": "Invalid address",
  "account-not-found": "Account not found",
  "verification-unavailable": "Verification unavailable",
  unsupported: "Role check unavailable",
};

type RoleVerificationProps = {
  circleSlug: string;
  assetCode: string;
  network: string;
  sourceUrl: string | null;
};

type InvalidRequest = {
  status: "invalid-request";
  reason: string;
};

function isVerificationResult(value: unknown): value is StellarVerificationResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Partial<StellarVerificationResult>;
  return (
    typeof result.status === "string" &&
    typeof result.role === "string" &&
    typeof result.qualified === "boolean" &&
    typeof result.reason === "string" &&
    typeof result.checkedAt === "string"
  );
}

function isInvalidRequest(value: unknown): value is InvalidRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Partial<InvalidRequest>;
  return result.status === "invalid-request" && typeof result.reason === "string";
}

export function RoleVerification({
  circleSlug,
  assetCode,
  network,
  sourceUrl,
}: RoleVerificationProps) {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<StellarVerificationResult | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setIsChecking(true);

    try {
      const response = await fetch("/api/stellar/verify-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circleSlug, address }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (isVerificationResult(payload)) {
        setResult(payload);
      } else if (isInvalidRequest(payload)) {
        setError(payload.reason);
      } else {
        setError("Verification is temporarily unavailable. Try again later.");
      }
    } catch {
      setError("Verification is temporarily unavailable. Try again later.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="role-verification" aria-labelledby="role-verification-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Optional read-only check</span>
          <h2 id="role-verification-title">Check your public {assetCode} role</h2>
        </div>
        <span className="status-chip status-chip-live">Mainnet read</span>
      </div>
      <p className="role-verification-intro">
        Paste a Stellar public address to check its relationship with the canonical {assetCode} asset.
        Vicus does not connect a wallet, claim ownership, save the address, or show exact balances.
      </p>
      <div className="role-verification-watcher">
        <strong>Watcher</strong>
        <span>Available without a wallet or address check.</span>
      </div>

      <form className="role-verification-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="stellar-public-address">Stellar public address</label>
          <input
            id="stellar-public-address"
            name="stellar-public-address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="G..."
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            required
            aria-describedby="stellar-address-help"
            aria-invalid={result?.status === "invalid-address"}
          />
          <p id="stellar-address-help" className="field-help">
            Read-only check on the Stellar public network. It is not proof that you control the address.
          </p>
        </div>
        <button
          aria-busy={isChecking}
          className="button button-white"
          type="submit"
          disabled={isChecking}
        >
          {isChecking ? "Checking…" : "Check role"}
        </button>
      </form>

      {error ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          className={`verification-result verification-result-${result.status}`}
          role="status"
          aria-live="polite"
        >
          <div>
            <span className="eyebrow">Stellar {network} response</span>
            <h3>{statusLabels[result.status]}</h3>
          </div>
          <p>{result.reason}</p>
          {result.status === "verified-holder" ? (
            <p className="verification-privacy-note">
              Exact balances and unrelated assets are intentionally not displayed.
            </p>
          ) : null}
          <p className="verification-timestamp">
            Checked {new Date(result.checkedAt).toLocaleString()}
          </p>
        </div>
      ) : null}

      <p className="role-verification-footer">
        Watcher remains available without a check. This role is temporary and is not stored as a Vicus
        profile attribute. {sourceUrl ? <a href={sourceUrl}>Review the canonical source</a> : null}
      </p>
    </section>
  );
}
