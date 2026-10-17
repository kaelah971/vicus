"use client";

import { useCallback, useState } from "react";
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

function roleDisplayName(role: string) {
  if (role === "verified-holder") return "Verified Holder";
  if (role === "verified-trustline") return "Verified Trustline";
  return role;
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown date";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** P7.2: persisted checks older than 24h are history, not permission. */
const ROLE_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

function freshnessNote(lastCheckedAt: string): string | null {
  const checked = new Date(lastCheckedAt).getTime();
  if (!Number.isFinite(checked)) return null;
  if (Date.now() - checked < ROLE_FRESHNESS_MS) return null;
  return "Older than 24 hours — reverify for current holder access. Restricted areas always re-check live.";
}

type RoleVerificationProps = {
  circleSlug: string;
  circleName: string;
  assetCode: string;
  network: string;
  sourceUrl: string | null;
  initialAuthenticated: boolean;
  initialVerification: {
    id: string;
    role: string;
    lastState: string;
    ecosystem: string;
    network: string;
    lastCheckedAt: string;
  } | null;
};

type InvalidRequest = {
  status: "invalid-request";
  reason: string;
};

type PersistedVerification = {
  id: string;
  role: string;
  lastState: string;
  ecosystem: string;
  network: string;
  verifiedAt: string;
  lastCheckedAt: string;
  circle: { slug: string; name: string };
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

function isPersistedVerification(value: unknown): value is PersistedVerification {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<PersistedVerification>;
  return typeof row.id === "string" && typeof row.role === "string";
}

export function RoleVerification({
  circleSlug,
  circleName,
  assetCode,
  network,
  sourceUrl,
  initialAuthenticated,
  initialVerification,
}: RoleVerificationProps) {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<StellarVerificationResult | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const [persisted, setPersisted] = useState<PersistedVerification | null>(
    initialVerification
      ? {
          ...initialVerification,
          verifiedAt: initialVerification.lastCheckedAt,
          circle: { slug: circleSlug, name: circleName },
        }
      : null,
  );
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [linkedResult, setLinkedResult] = useState<StellarVerificationResult | null>(null);
  const [linkedError, setLinkedError] = useState("");
  const [isVerifyingLinked, setIsVerifyingLinked] = useState(false);

  const loadPersisted = useCallback(async () => {
    try {
      const response = await fetch(`/api/circles/${encodeURIComponent(circleSlug)}/verify-role`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (
        typeof payload === "object" &&
        payload !== null &&
        "ok" in payload &&
        (payload as { ok: boolean }).ok &&
        "verification" in payload
      ) {
        const verification = (payload as { verification: unknown }).verification;
        setPersisted(isPersistedVerification(verification) ? verification : null);
      }
    } catch {
      // Persisted role stays as last known; pasted check still works.
    }
  }, [circleSlug]);

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

  async function handleLinkedVerify() {
    setLinkedError("");
    setLinkedResult(null);
    setIsVerifyingLinked(true);
    try {
      const response = await fetch(`/api/circles/${encodeURIComponent(circleSlug)}/verify-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload === "object" && payload !== null && "ok" in payload) {
        const body = payload as { ok: boolean; result?: unknown; verification?: unknown; message?: string; code?: string };
        if (!body.ok) {
          if (body.code === "unauthenticated") {
            setAuthenticated(false);
            setLinkedError("Connect a verified Stellar wallet to verify a role.");
          } else {
            setLinkedError(typeof body.message === "string" ? body.message : "Role verification could not be completed.");
          }
          return;
        }
        if (isVerificationResult(body.result)) {
          setLinkedResult(body.result);
        }
        setPersisted(isPersistedVerification(body.verification) ? body.verification : null);
        await loadPersisted();
      } else {
        setLinkedError("Role verification is temporarily unavailable. Try again later.");
      }
    } catch {
      setLinkedError("Role verification is temporarily unavailable. Try again later.");
    } finally {
      setIsVerifyingLinked(false);
    }
  }

  return (
    <section className="role-verification" aria-labelledby="role-verification-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Role verification</span>
          <h2 id="role-verification-title">Prove a {assetCode} role</h2>
        </div>
        <span className="status-chip status-chip-live">Mainnet read</span>
      </div>

      {persisted ? (
        <div className="verification-result verification-result-verified-holder" role="status" aria-live="polite">
          <div>
            <span className="eyebrow">Persistent Vicus role</span>
            <h3>{roleDisplayName(persisted.role)}</h3>
          </div>
          <p>
            {persisted.circle.name} on Stellar · Last verified {formatDate(persisted.lastCheckedAt)}. Ownership is
            re-checked on reverify; this is not a permanent claim.
          </p>
          {freshnessNote(persisted.lastCheckedAt) ? (
            <p className="verification-stale" role="note">
              {freshnessNote(persisted.lastCheckedAt)}
            </p>
          ) : null}
          <p className="verification-timestamp">
            <button
              aria-busy={isVerifyingLinked}
              className="button button-outline button-small"
              disabled={isVerifyingLinked}
              onClick={handleLinkedVerify}
              type="button"
            >
              {isVerifyingLinked ? "Reverifying…" : "Reverify"}
            </button>
          </p>
        </div>
      ) : null}

      <div className="role-verification-watcher">
        <strong>{persisted ? "Linked wallet" : "Watcher"}</strong>
        <span>
          {authenticated
            ? persisted
              ? "Your linked wallet holds this persistent role. Reverify to refresh it."
              : "Verify your connected wallet to persist a supported role to your Profile."
            : "Available without a wallet or address check."}
        </span>
      </div>

      {authenticated ? (
        <div className="role-verification-form" style={{ alignItems: "center" }}>
          <p className="field-help" style={{ margin: 0 }}>
            Uses the wallet you signed in with. Only a successful supported check (
            {assetCode} trustline or holder) is stored — never balances, secrets, or raw Horizon data.
          </p>
          <button
            aria-busy={isVerifyingLinked}
            className="button button-white"
            disabled={isVerifyingLinked}
            onClick={handleLinkedVerify}
            type="button"
          >
            {isVerifyingLinked ? "Verifying…" : persisted ? "Reverify linked wallet" : "Verify linked wallet"}
          </button>
        </div>
      ) : (
        <p className="role-verification-intro">
          Connect a verified Stellar wallet to persist a role. Pasted-address checks below stay read-only.
        </p>
      )}

      {linkedError ? (
        <p className="form-message form-message-error" role="alert">
          {linkedError}
        </p>
      ) : null}

      {linkedResult ? (
        <div
          className={`verification-result verification-result-${linkedResult.status}`}
          role="status"
          aria-live="polite"
        >
          <div>
            <span className="eyebrow">Linked wallet · Stellar {network} response</span>
            <h3>{statusLabels[linkedResult.status]}</h3>
          </div>
          <p>{linkedResult.reason}</p>
          {!linkedResult.qualified ? (
            <p className="verification-privacy-note">
              No Profile role was created or changed. Only successful supported checks persist.
            </p>
          ) : null}
          <p className="verification-timestamp">
            Checked {new Date(linkedResult.checkedAt).toLocaleString()}
          </p>
        </div>
      ) : null}

      <p className="role-verification-intro">
        Or paste a Stellar public address for a read-only check of its relationship with the canonical{" "}
        {assetCode} asset. A pasted address never creates a Profile role and is never saved.
      </p>

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
        Watcher remains available without a check. Pasted-address results are temporary and are never stored
        as a Vicus profile attribute. {sourceUrl ? <a href={sourceUrl}>Review the canonical source</a> : null}
      </p>
    </section>
  );
}
