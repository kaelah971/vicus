"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AssetRegistrationRecord } from "@/lib/registrations/service";

type ReviewResponse = { ok: boolean; message?: string };

function statusLabel(status: string) {
  if (status === "pending") return "Pending review";
  if (status === "needs_review") return "Parked — needs evidence";
  if (status === "approved") return "Registered";
  return "Rejected";
}

export function AssetRegistrationReview({
  registrations,
}: {
  registrations: AssetRegistrationRecord[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function review(registrationId: string, action: "approved" | "rejected" | "needs_review") {
    setError("");
    setBusyId(registrationId);
    try {
      const response = await fetch(`/api/registrations/${registrationId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[registrationId] ?? "" }),
      });
      const payload = (await response.json().catch(() => null)) as ReviewResponse | null;
      if (!payload || payload.ok !== true) {
        setError(
          payload && typeof payload.message === "string" && payload.message
            ? payload.message
            : "The review could not be saved.",
        );
      } else {
        router.refresh();
      }
    } catch {
      setError("The review could not be saved. Try again later.");
    } finally {
      setBusyId("");
    }
  }

  if (registrations.length === 0) {
    return <p className="control-note">No asset registrations waiting for review.</p>;
  }

  return (
    <div>
      {registrations.map((registration) => (
        <div className="hairline-card" key={registration.id} style={{ marginBottom: 12 }}>
          <p>
            <strong>{registration.assetName}</strong>{" "}
            <span className="mission-type">
              {registration.assetType} · {registration.network} · {statusLabel(registration.status)}
            </span>
          </p>
          <p className="control-note">
            @{registration.applicant.handle} ({registration.applicant.displayName})
            {registration.originApplication
              ? ` · from “${registration.originApplication.proposedName}” (${registration.originApplication.status})`
              : " · standalone request"}
          </p>
          <p>
            Identifier: <span className="reg-mono">{registration.identifier}</span>
            {registration.code ? (
              <>
                {" · "}Code: <span className="reg-mono">{registration.code}</span>
              </>
            ) : null}
          </p>
          {registration.issuerClaim ? (
            <p className="control-note">Issuer claim (applicant-stated, not proof): {registration.issuerClaim}</p>
          ) : null}
          <div className="control-note">
            <strong>Sources (supplied, not checked):</strong>
            <ul>
              {registration.documentationUrls.map((url) => (
                <li key={url}>
                  docs:{" "}
                  <a className="reg-mono" href={url} rel="noreferrer" target="_blank">
                    {url}
                  </a>
                </li>
              ))}
              {registration.chainEvidenceUrls.map((url) => (
                <li key={url}>
                  chain:{" "}
                  <a className="reg-mono" href={url} rel="noreferrer" target="_blank">
                    {url}
                  </a>
                </li>
              ))}
              {registration.issuerWebsite ? (
                <li>
                  site:{" "}
                  <a className="reg-mono" href={registration.issuerWebsite} rel="noreferrer" target="_blank">
                    {registration.issuerWebsite}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <div className="control-note">
            <strong>Validation findings:</strong>
            <ul>
              {registration.validationFindings.map((finding, index) => (
                <li key={index}>
                  [{finding.severity}] {finding.message}
                </li>
              ))}
            </ul>
          </div>
          <div className="field-group">
            <label htmlFor={`reg-review-note-${registration.id}`}>
              Review note (required reading for the applicant on needs-review / rejection)
            </label>
            <input
              id={`reg-review-note-${registration.id}`}
              onChange={(event) =>
                setNotes((current) => ({ ...current, [registration.id]: event.target.value }))
              }
              value={notes[registration.id] ?? ""}
            />
          </div>
          <div className="admin-queue-filter-group" role="group" aria-label={`Review ${registration.assetName}`}>
            <button
              className="button button-small button-white"
              disabled={busyId === registration.id}
              onClick={() => review(registration.id, "approved")}
              type="button"
            >
              {busyId === registration.id ? "Saving…" : "Register"}
            </button>
            <button
              className="button button-small button-outline"
              disabled={busyId === registration.id}
              onClick={() => review(registration.id, "needs_review")}
              type="button"
            >
              Needs evidence
            </button>
            <button
              className="button button-small button-outline"
              disabled={busyId === registration.id}
              onClick={() => review(registration.id, "rejected")}
              type="button"
            >
              Reject
            </button>
          </div>
          <p className="control-note">
            Registration records reviewed sources only. It never certifies the issuer, enables no
            trading, Send, Earn, Redeem, or distribution, and publishes no Circle.
          </p>
        </div>
      ))}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
