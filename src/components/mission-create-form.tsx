"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export type StudioCircle = {
  id: string;
  slug: string;
  name: string;
  ecosystemLabel: string;
};

type DraftQuestion = {
  prompt: string;
  choicesText: string;
  correctAnswer: string;
};

type CreateResponse =
  | { ok: true; mission: { id: string; title: string } }
  | { ok: false; message: string };

function isCreateResponse(value: unknown): value is CreateResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<CreateResponse> & { message?: unknown };
  return typeof body.ok === "boolean";
}

const emptyQuestion = (): DraftQuestion => ({ prompt: "", choicesText: "", correctAnswer: "" });

export function MissionCreateForm({ circles }: { circles: StudioCircle[] }) {
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"quiz" | "text" | "research">("quiz");
  const [points, setPoints] = useState("100");
  const [status, setStatus] = useState<"draft" | "open">("draft");
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [rewardAmount, setRewardAmount] = useState("0.05");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [evidencePrompt, setEvidencePrompt] = useState(
    "Link the official source that supports your response.",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreated(null);
    setBusy(true);

    const payload: Record<string, unknown> = {
      circleId,
      title,
      description,
      type,
      points: Number(points),
      status,
      rewardEnabled,
      rewardAmount,
      evidenceRequired,
      evidencePrompt,
    };

    if (type === "quiz") {
      payload.questions = questions.map((question) => ({
        prompt: question.prompt,
        choices: question.choicesText
          .split("\n")
          .map((choice) => choice.trim())
          .filter(Boolean),
        correctAnswer: question.correctAnswer,
      }));
    }

    try {
      const response = await fetch("/api/admin/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!isCreateResponse(body)) {
        setError("The creation response could not be understood. Try again later.");
      } else if (!body.ok) {
        setError(body.message);
      } else {
        setCreated(body.mission);
        setTitle("");
        setDescription("");
      }
    } catch {
      setError("The mission could not be created. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  const selectedCircle = circles.find((circle) => circle.id === circleId);

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="mission-circle">Circle</label>
        <select
          id="mission-circle"
          value={circleId}
          onChange={(event) => setCircleId(event.target.value)}
          required
        >
          {circles.map((circle) => (
            <option key={circle.id} value={circle.id}>
              {circle.name} · {circle.ecosystemLabel}
            </option>
          ))}
        </select>
        <p className="field-help">
          Existing Circles only — Stellar, Ethereum, Base, or Solana. Rewards always settle as XLM on
          Stellar Testnet, never on the asset ecosystem{selectedCircle ? ` (${selectedCircle.ecosystemLabel})` : ""}.
        </p>
      </div>

      <div className="field-group">
        <label htmlFor="mission-title">Title</label>
        <input
          id="mission-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={180}
          required
          placeholder="Understand the asset Passport"
        />
      </div>

      <div className="field-group">
        <label htmlFor="mission-description">Instructions</label>
        <textarea
          id="mission-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          rows={3}
          required
          placeholder="What should the participant read, answer, or submit?"
        />
      </div>

      <div className="mission-create-grid">
        <div className="field-group">
          <label htmlFor="mission-type">Type</label>
          <select id="mission-type" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="quiz">Quiz · automatic grading</option>
            <option value="text">Text · manual review</option>
            <option value="research">Research · manual review</option>
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="mission-points">Vicus points</label>
          <input
            id="mission-points"
            type="number"
            min={0}
            max={10000}
            step={1}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            required
          />
        </div>
        <div className="field-group">
          <label htmlFor="mission-status">State</label>
          <select id="mission-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="draft">Draft · hidden from participants</option>
            <option value="open">Open · participants can submit</option>
          </select>
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="mission-reward-toggle">Stellar reward</label>
        <div className="mission-create-checkrow">
          <input
            id="mission-reward-toggle"
            type="checkbox"
            checked={rewardEnabled}
            onChange={(event) => setRewardEnabled(event.target.checked)}
          />
          <span>Enable XLM reward on approval (Stellar Testnet only)</span>
        </div>
        {rewardEnabled ? (
          <>
            <input
              aria-label="Reward amount in XLM"
              type="text"
              inputMode="decimal"
              value={rewardAmount}
              onChange={(event) => setRewardAmount(event.target.value)}
              placeholder="0.05"
              required
            />
            <p className="field-help">
              Asset is fixed to XLM; the network follows server configuration (Testnet). Approval makes
              the reward eligible — it is never sent automatically.
            </p>
          </>
        ) : null}
      </div>

      {type === "quiz" ? (
        <div className="field-group">
          <span className="field-label">Questions · answer keys stay server-side</span>
          <p className="field-help">Participants must answer every question correctly to pass.</p>
          {questions.map((question, index) => (
            <div className="mission-create-question" key={index}>
              <label htmlFor={`quiz-prompt-${index}`}>Question {index + 1}</label>
              <input
                id={`quiz-prompt-${index}`}
                type="text"
                value={question.prompt}
                onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                maxLength={500}
                required
                placeholder="What does this asset represent?"
              />
              <label htmlFor={`quiz-choices-${index}`}>Choices · one per line</label>
              <textarea
                id={`quiz-choices-${index}`}
                value={question.choicesText}
                onChange={(event) => updateQuestion(index, { choicesText: event.target.value })}
                rows={3}
                required
                placeholder={"A source-linked educational context\nA guaranteed return"}
              />
              <label htmlFor={`quiz-answer-${index}`}>Correct answer · must match a choice exactly</label>
              <input
                id={`quiz-answer-${index}`}
                type="text"
                value={question.correctAnswer}
                onChange={(event) => updateQuestion(index, { correctAnswer: event.target.value })}
                maxLength={280}
                required
              />
              {questions.length > 1 ? (
                <button
                  className="button button-outline button-small"
                  type="button"
                  onClick={() => setQuestions((current) => current.filter((_, position) => position !== index))}
                >
                  Remove question
                </button>
              ) : null}
            </div>
          ))}
          {questions.length < 10 ? (
            <button
              className="button button-outline button-small"
              type="button"
              onClick={() => setQuestions((current) => [...current, emptyQuestion()])}
            >
              Add question
            </button>
          ) : null}
        </div>
      ) : (
        <div className="field-group">
          <label htmlFor="mission-evidence-toggle">Source requirement</label>
          <div className="mission-create-checkrow">
            <input
              id="mission-evidence-toggle"
              type="checkbox"
              checked={evidenceRequired}
              onChange={(event) => setEvidenceRequired(event.target.checked)}
            />
            <span>Require a source link with the response (manual review)</span>
          </div>
          <label htmlFor="mission-evidence-prompt">Source guidance</label>
          <input
            id="mission-evidence-prompt"
            type="text"
            value={evidencePrompt}
            onChange={(event) => setEvidencePrompt(event.target.value)}
            maxLength={500}
            required
          />
        </div>
      )}

      {error ? (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      ) : null}
      {created ? (
        <p className="form-message form-message-success" role="status" aria-live="polite">
          Mission “{created.title}” created.{" "}
          <a href={`/admin/missions/${created.id}`}>Open campaign detail</a>
        </p>
      ) : null}

      <button className="button button-white" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "Creating…" : "Create mission"}
      </button>
    </form>
  );
}
