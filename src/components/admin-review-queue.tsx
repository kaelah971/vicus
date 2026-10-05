"use client";

import { useState } from "react";
import type { SubmissionReviewRecord } from "@/lib/data/types";

const reviewLabels = {
  approved: "Approve contribution",
  needs_revision: "Request revision",
  rejected: "Reject contribution",
} as const;

type ReviewAction = keyof typeof reviewLabels;

type AdminReviewQueueProps = {
  submissions: SubmissionReviewRecord[];
};

type ReviewResponse =
  | { ok: true; message: string }
  | { ok: false; message: string };

function isReviewResponse(value: unknown): value is ReviewResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<ReviewResponse>;
  return typeof response.ok === "boolean" && typeof response.message === "string";
}

export function AdminReviewQueue({ submissions }: AdminReviewQueueProps) {
  const [queue, setQueue] = useState(submissions);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function review(submissionId: string, action: ReviewAction) {
    setError("");
    setNotice("");
    setBusyId(submissionId);

    try {
      const response = await fetch(`/api/admin/submissions/${submissionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reasons[submissionId] ?? "" }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!isReviewResponse(payload)) {
        setError("The review response could not be understood. Try again later.");
      } else if (!payload.ok) {
        setError(payload.message);
      } else {
        setQueue((current) => current.filter((submission) => submission.id !== submissionId));
        setNotice(payload.message);
      }
    } catch {
      setError("The review could not be saved. Try again later.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="admin-review-queue">
      <div className="review-queue-intro">
        <p>Review authenticated Vicus contributions with clear source and state.</p>
        <span>Admin wallet session required · no reward settlement</span>
      </div>
      {notice ? (
        <p className="form-message form-message-success" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
      {queue.length === 0 ? (
        <div className="admin-review-empty">
          <strong>No responses are waiting for review.</strong>
          <span>Quiz missions are graded automatically; text missions appear here while pending.</span>
        </div>
      ) : (
        <div className="review-submission-list">
          {queue.map((submission) => (
            <article className="review-submission" key={submission.id}>
              <div className="review-submission-header">
                <div>
                  <span className="eyebrow">{submission.missionType} · {submission.circleName}</span>
                  <h3>{submission.missionTitle}</h3>
                </div>
                <span className="status-pill status-blue">Pending review</span>
              </div>
              <div className="review-submission-meta">
                <span>@{submission.participantHandle} · {submission.participantName}</span>
                <span>{submission.missionPoints} Vicus points if approved</span>
                <span>Submitted {new Date(submission.submittedAt).toLocaleString()}</span>
              </div>
              <div className="review-submission-content">
                <span className="field-label">Response</span>
                <p>{submission.content ?? "No text response was stored."}</p>
                {submission.evidenceUrl ? (
                  <a href={submission.evidenceUrl} target="_blank" rel="noreferrer">
                    Open submitted source
                  </a>
                ) : null}
              </div>
              <div className="review-submission-actions">
                <label htmlFor={`review-reason-${submission.id}`}>Review note</label>
                <textarea
                  id={`review-reason-${submission.id}`}
                  value={reasons[submission.id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [submission.id]: event.target.value }))
                  }
                  placeholder="Required for rejection or revision"
                  maxLength={1000}
                  rows={3}
                />
                <div className="review-action-buttons">
                  {(Object.keys(reviewLabels) as ReviewAction[]).map((action) => (
                    <button
                      className={`button ${action === "approved" ? "button-white" : "button-outline"}`}
                      disabled={busyId === submission.id}
                      key={action}
                      onClick={() => review(submission.id, action)}
                      type="button"
                    >
                      {busyId === submission.id ? "Saving…" : reviewLabels[action]}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
