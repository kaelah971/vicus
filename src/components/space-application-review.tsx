"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SpaceApplicationRecord } from "@/lib/organizations/service";

type ReviewResponse = { ok: boolean; message?: string };

export function SpaceApplicationReview({ applications }: { applications: SpaceApplicationRecord[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function review(applicationId: string, action: "approved" | "rejected") {
    setError("");
    setBusyId(applicationId);
    try {
      const response = await fetch(`/api/admin/space-applications/${applicationId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[applicationId] ?? "" }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as ReviewResponse).ok !== true) {
        setError(
          typeof payload === "object" && payload !== null && "message" in payload
            ? String((payload as ReviewResponse).message ?? "The review could not be saved.")
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

  if (applications.length === 0) {
    return <p className="control-note">No Space applications waiting for review.</p>;
  }

  return (
    <div>
      {applications.map((application) => (
        <div className="hairline-card" key={application.id} style={{ marginBottom: 12 }}>
          <p>
            <strong>{application.proposedName}</strong> · <span className="mission-type">{application.projectType}</span>
          </p>
          <p>
            @{application.applicant.handle} ({application.applicant.displayName}) · slug:{" "}
            {application.proposedSlug}
            {application.ecosystemFocus ? ` · ${application.ecosystemFocus} focus` : null}
          </p>
          <p>{application.description}</p>
          <p className="control-note">Purpose: {application.requestedPurpose}</p>
          {application.websiteUrl ? (
            <p className="control-note">
              <a href={application.websiteUrl} rel="noreferrer" target="_blank">
                {application.websiteUrl}
              </a>
            </p>
          ) : null}
          {application.affiliationNote ? (
            <p className="control-note">Affiliation: {application.affiliationNote}</p>
          ) : null}
          <div className="field-group">
            <label htmlFor={`space-review-note-${application.id}`}>Review note (optional, shown on rejection)</label>
            <input
              id={`space-review-note-${application.id}`}
              onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))}
              value={notes[application.id] ?? ""}
            />
          </div>
          <div className="admin-queue-filter-group" role="group" aria-label={`Review ${application.proposedName}`}>
            <button
              className="button button-small button-white"
              disabled={busyId === application.id}
              onClick={() => review(application.id, "approved")}
              type="button"
            >
              {busyId === application.id ? "Saving…" : "Approve"}
            </button>
            <button
              className="button button-small button-outline"
              disabled={busyId === application.id}
              onClick={() => review(application.id, "rejected")}
              type="button"
            >
              Reject
            </button>
          </div>
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
