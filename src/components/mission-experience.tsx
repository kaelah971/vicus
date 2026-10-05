"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import type {
  MissionDetailRecord,
  SubmissionState,
} from "@/lib/missions/types";

type MissionExperienceProps = {
  mission: MissionDetailRecord;
};

type SubmissionResponse =
  | {
      ok: true;
      submission: SubmissionState;
      message: string;
      pointsAwarded: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function isSubmissionResponse(value: unknown): value is SubmissionResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Partial<SubmissionResponse>;
  return typeof response.ok === "boolean" && typeof response.message === "string";
}

function submissionLabel(submission: SubmissionState | null) {
  if (!submission) return "Not submitted";
  if (submission.status === "approved") return "Approved";
  if (submission.status === "pending") return "Pending review";
  if (submission.status === "needs_revision") return "Needs revision";
  return "Rejected";
}

function submissionTone(submission: SubmissionState | null) {
  if (submission?.status === "approved") return "green";
  if (submission?.status === "pending") return "blue";
  if (submission?.status === "needs_revision") return "violet";
  return "muted";
}

export function MissionExperience({ mission }: MissionExperienceProps) {
  const [submission, setSubmission] = useState(mission.submission);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [content, setContent] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    mission.viewer.authenticated &&
    mission.availability === "open" &&
    (!submission || submission.status === "needs_revision");
  const isQuiz = mission.config?.kind === "quiz";
  const isText = mission.config?.kind === "text" || mission.config?.kind === "research";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    const payload = isQuiz
      ? { answers }
      : { content, evidenceUrl: evidenceUrl.trim() || undefined };

    try {
      const response = await fetch(`/api/missions/${mission.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json().catch(() => null);

      if (!isSubmissionResponse(result)) {
        setError("The mission response could not be understood. Try again later.");
      } else if (!result.ok) {
        setError(result.message);
      } else {
        setSubmission(result.submission);
        setMessage(result.message);
        if (result.submission.status !== "needs_revision") {
          setContent("");
          setEvidenceUrl("");
          setAnswers({});
        }
      }
    } catch {
      setError("The mission response could not be saved. Try again later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mission-experience" aria-labelledby="mission-response-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Mission response</span>
          <h2 id="mission-response-title">
            {isQuiz ? "Show what you understand." : "Add something useful."}
          </h2>
        </div>
        <span className="status-chip">{mission.points} Vicus points</span>
      </div>

      <div className="mission-submission-state">
        <span className="field-label">Current state</span>
        <div>
          <span className={`status-pill status-${submissionTone(submission)}`}>
            {submissionLabel(submission)}
          </span>
          {submission?.score !== null && submission?.score !== undefined ? (
            <span className="submission-score">Score {submission.score}%</span>
          ) : null}
        </div>
        {submission?.revisionReason ? (
          <p className="submission-revision-reason">{submission.revisionReason}</p>
        ) : null}
      </div>

      {message ? (
        <p className="form-message form-message-success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}

      {!mission.viewer.authenticated ? (
        <div className="mission-closed-state">
          Connect a verified Stellar mainnet wallet below to submit this mission. The browser never sends
          a user ID; the Vicus session supplies the participant on the server.
        </div>
      ) : null}

      {mission.availability === "scheduled" ? (
        <div className="mission-closed-state">
          This mission is scheduled to open later. No response can be submitted yet.
        </div>
      ) : null}
      {mission.availability === "closed" ? (
        <div className="mission-closed-state">
          This mission is closed for new responses. Existing contribution state remains unchanged.
        </div>
      ) : null}
      {mission.availability === "preview" ? (
        <div className="mission-closed-state">
          This mission is a preview and is not connected to a submission workflow.
        </div>
      ) : null}

      {canSubmit && isQuiz && mission.config?.kind === "quiz" ? (
        <form className="mission-response-form" onSubmit={handleSubmit}>
          <p className="mission-form-instruction">
            Choose one answer for each question. Correct answers are checked on the server after you submit.
          </p>
          <div className="quiz-question-list">
            {mission.config.questions.map((question, index) => (
              <fieldset className="quiz-question" key={question.id}>
                <legend>
                  <span>{String(index + 1).padStart(2, "0")}</span> {question.prompt}
                </legend>
                <div className="quiz-choice-list">
                  {question.choices.map((choice) => (
                    <label className="quiz-choice" key={choice}>
                      <input
                        type="radio"
                        name={question.id}
                        value={choice}
                        checked={answers[question.id] === choice}
                        onChange={() => setAnswers((current) => ({ ...current, [question.id]: choice }))}
                        required
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <button className="button button-white" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Checking…" : "Submit quiz"}
          </button>
        </form>
      ) : null}

      {canSubmit && isText && mission.config && mission.config.kind !== "quiz" ? (
        <form className="mission-response-form" onSubmit={handleSubmit}>
          <p className="mission-form-instruction">
            Write between {mission.config.minLength} and {mission.config.maxLength} characters. Plain text
            is stored; HTML is not rendered.
          </p>
          <div className="field-group">
            <label htmlFor="mission-content">Your response</label>
            <textarea
              id="mission-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              minLength={mission.config.minLength}
              maxLength={mission.config.maxLength}
              rows={8}
              required
              aria-describedby="mission-content-help"
            />
            <p id="mission-content-help" className="field-help">
              {mission.config.evidencePrompt}
            </p>
          </div>
          <div className="field-group">
            <label htmlFor="mission-evidence">Source link{mission.config.evidenceRequired ? " · required" : " · optional"}</label>
            <input
              id="mission-evidence"
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="https://…"
              maxLength={500}
              required={mission.config.evidenceRequired}
            />
          </div>
          <button className="button button-white" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Submit contribution"}
          </button>
        </form>
      ) : null}

      {!mission.config ? (
        <div className="mission-closed-state">
          This mission does not have a valid response configuration. No submission can be stored.
        </div>
      ) : null}

      {submission?.status === "pending" ? (
        <p className="mission-next-step">Your response is waiting for review. You can return to the circle while the review is pending.</p>
      ) : null}
      {submission?.status === "approved" ? (
        <div className="mission-next-step mission-next-step-approved">
          <p>This contribution is reflected in your Vicus profile as an approved offchain contribution.</p>
          <Link className="button button-outline button-small" href="/profile/me">
            View profile contribution
          </Link>
        </div>
      ) : null}
      {submission?.status === "rejected" ? (
        <p className="mission-next-step">This response was not approved. A rejected response cannot be resubmitted without an explicit mission rule.</p>
      ) : null}
    </section>
  );
}
