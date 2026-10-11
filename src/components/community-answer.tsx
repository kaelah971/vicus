"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { personInitials } from "@/components/person-card";
import type { CommunityAnswer } from "@/lib/community/service";

export function CommunityAnswerCard({
  answer,
  canRemove,
  circleSlug,
  postId,
}: {
  answer: CommunityAnswer;
  canRemove: boolean;
  circleSlug: string;
  postId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRemove() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(
        `/api/circles/${circleSlug}/community/posts/${postId}/answers/${answer.id}`,
        { method: "DELETE" },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as { ok: boolean }).ok !== true) {
        setError("The answer could not be removed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("The answer could not be removed. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-panel">
      <p>{answer.body}</p>
      <div className="mission-footer">
        <span className="mission-index-context">
          <span aria-hidden="true" className="avatar-orb">
            {personInitials(answer.author.displayName)}
          </span>
          <Link href={`/u/${answer.author.handle}`}>
            {answer.author.displayName} · @{answer.author.handle}
          </Link>
          <span>{answer.createdAt.slice(0, 10)}</span>
        </span>
        {canRemove ? (
          <button className="button button-outline button-small" disabled={busy} onClick={handleRemove} type="button">
            {busy ? "Removing…" : "Remove"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type AnswerResponse = { ok: boolean; answer?: CommunityAnswer; message?: string };

export function CommunityAnswerForm({ circleSlug, postId }: { circleSlug: string; postId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/circles/${circleSlug}/community/posts/${postId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as AnswerResponse).ok !== true) {
        setError(
          typeof payload === "object" && payload !== null && "message" in payload
            ? String((payload as AnswerResponse).message ?? "The answer could not be posted.")
            : "The answer could not be posted.",
        );
      } else {
        setBody("");
        router.refresh();
      }
    } catch {
      setError("The answer could not be posted. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="community-answer-body">Your answer</label>
        <textarea
          id="community-answer-body"
          onChange={(event) => setBody(event.target.value)}
          required
          rows={4}
          value={body}
        />
      </div>
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Posting…" : "Post answer"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function CommunityRemovePostButton({
  circleSlug,
  postId,
}: {
  circleSlug: string;
  postId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRemove() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/circles/${circleSlug}/community/posts/${postId}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as { ok: boolean }).ok !== true) {
        setError("The post could not be removed.");
      } else {
        router.push(`/circles/${circleSlug}/community`);
        router.refresh();
      }
    } catch {
      setError("The post could not be removed. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="follow-control">
      <button className="button button-outline button-small" disabled={busy} onClick={handleRemove} type="button">
        {busy ? "Removing…" : "Remove post"}
      </button>
      {error ? (
        <span className="wallet-auth-message" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function HelpfulButton({
  circleSlug,
  postId,
  initialHelpful,
  initialCount,
}: {
  circleSlug: string;
  postId: string;
  initialHelpful: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [helpful, setHelpful] = useState(initialHelpful);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/circles/${circleSlug}/community/posts/${postId}/helpful`, {
        method: helpful ? "DELETE" : "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as { ok: boolean }).ok !== true) {
        setError("The reaction could not be saved.");
      } else {
        const next = payload as { helpful: boolean; helpfulCount: number };
        setHelpful(next.helpful);
        setCount(next.helpfulCount);
        router.refresh();
      }
    } catch {
      setError("The reaction could not be saved. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="follow-control">
      <button
        className={helpful ? "button button-outline button-small" : "button button-small"}
        disabled={busy}
        onClick={toggle}
        type="button"
      >
        {busy ? "Saving…" : helpful ? `✓ Helpful · ${count}` : `Helpful · ${count}`}
      </button>
      {error ? (
        <span className="wallet-auth-message" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
