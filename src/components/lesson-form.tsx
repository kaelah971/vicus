"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

export type LessonCircleOption = {
  id: string;
  slug: string;
  name: string;
};

export type LessonInitial = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  circleId: string | null;
  status: string;
  sources: Array<{ label: string; url: string }>;
};

type SaveResponse =
  | { ok: true; lesson: { id: string; slug: string; title: string } }
  | { ok: false; message: string };

function isSaveResponse(value: unknown): value is SaveResponse {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Partial<SaveResponse>).ok === "boolean";
}

function sourcesToText(sources: Array<{ label: string; url: string }>) {
  return sources.map((source) => `${source.label} | ${source.url}`).join("\n");
}

function textToSources(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("|");
      if (separator < 0) return { label: line, url: "" };
      return { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
    });
}

export function LessonForm({
  orgSlug,
  circles,
  initial = null,
}: {
  orgSlug: string;
  circles: LessonCircleOption[];
  initial?: LessonInitial | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [circleId, setCircleId] = useState(initial?.circleId ?? "");
  const [status, setStatus] = useState<"draft" | "published">(
    initial?.status === "published" ? "published" : "draft",
  );
  const [sourcesText, setSourcesText] = useState(
    initial ? sourcesToText(initial.sources) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; slug: string; title: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(null);
    setBusy(true);

    const payload: Record<string, unknown> = {
      title,
      slug: initial ? initial.slug : slug,
      summary,
      body,
      circleId: circleId || null,
      status,
      sources: textToSources(sourcesText),
    };

    try {
      const url = initial
        ? `/api/orgs/${orgSlug}/lessons/${initial.id}`
        : `/api/orgs/${orgSlug}/lessons`;
      const response = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed: unknown = await response.json().catch(() => null);

      if (!isSaveResponse(parsed)) {
        setError("The lesson response could not be understood. Try again later.");
      } else if (!parsed.ok) {
        setError(parsed.message);
      } else {
        setSaved(parsed.lesson);
        router.refresh();
      }
    } catch {
      setError("The lesson could not be saved. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor={initial ? `lesson-title-${initial.id}` : "lesson-title"}>Title</label>
        <input
          id={initial ? `lesson-title-${initial.id}` : "lesson-title"}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </div>
      {!initial ? (
        <div className="field-group">
          <label htmlFor="lesson-slug">Slug</label>
          <input
            id="lesson-slug"
            onChange={(event) => setSlug(event.target.value)}
            placeholder="usdc-across-ecosystems"
            required
            value={slug}
          />
        </div>
      ) : null}
      <div className="field-group">
        <label htmlFor={initial ? `lesson-summary-${initial.id}` : "lesson-summary"}>Summary</label>
        <textarea
          id={initial ? `lesson-summary-${initial.id}` : "lesson-summary"}
          onChange={(event) => setSummary(event.target.value)}
          required
          rows={2}
          value={summary}
        />
      </div>
      <div className="field-group">
        <label htmlFor={initial ? `lesson-body-${initial.id}` : "lesson-body"}>
          Body (plain text, blank line between paragraphs)
        </label>
        <textarea
          id={initial ? `lesson-body-${initial.id}` : "lesson-body"}
          onChange={(event) => setBody(event.target.value)}
          required
          rows={8}
          value={body}
        />
      </div>
      <div className="field-group">
        <label htmlFor={initial ? `lesson-circle-${initial.id}` : "lesson-circle"}>
          Associated Circle (hosted only, optional)
        </label>
        <select
          id={initial ? `lesson-circle-${initial.id}` : "lesson-circle"}
          onChange={(event) => setCircleId(event.target.value)}
          value={circleId ?? ""}
        >
          <option value="">No specific Circle</option>
          {circles.map((circle) => (
            <option key={circle.id} value={circle.id}>
              {circle.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field-group">
        <label htmlFor={initial ? `lesson-status-${initial.id}` : "lesson-status"}>Status</label>
        <select
          id={initial ? `lesson-status-${initial.id}` : "lesson-status"}
          onChange={(event) => setStatus(event.target.value === "published" ? "published" : "draft")}
          value={status}
        >
          <option value="draft">Draft (organization only)</option>
          <option value="published">Published (participant-visible)</option>
        </select>
      </div>
      <div className="field-group">
        <label htmlFor={initial ? `lesson-sources-${initial.id}` : "lesson-sources"}>
          Official sources (one per line: Label | https://…)
        </label>
        <textarea
          id={initial ? `lesson-sources-${initial.id}` : "lesson-sources"}
          onChange={(event) => setSourcesText(event.target.value)}
          placeholder={"Circle USDC docs | https://www.circle.com/usdc"}
          required
          rows={3}
          value={sourcesText}
        />
      </div>
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Saving…" : initial ? "Save lesson" : "Create lesson"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="control-note">Saved “{saved.title}”. The studio list refreshes from persisted state.</p> : null}
    </form>
  );
}
