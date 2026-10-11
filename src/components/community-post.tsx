"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/vicus";
import { personInitials } from "@/components/person-card";
import type { CommunityPost } from "@/lib/community/service";

export function typeLabel(type: string) {
  if (type === "question") return "Question";
  if (type === "insight") return "Insight";
  return "Source";
}

export function CommunityPostCard({
  post,
  circleSlug,
  linkToPost = true,
}: {
  post: CommunityPost;
  circleSlug: string;
  linkToPost?: boolean;
}) {
  const href = `/circles/${circleSlug}/community/${post.id}`;
  return (
    <article className="mission-card">
      <div className="mission-card-header">
        <StatusPill tone={post.type === "question" ? "blue" : post.type === "insight" ? "green" : "muted"}>
          {typeLabel(post.type)}
        </StatusPill>
        <span className="mission-type">
          {post.helpfulCount} Helpful · {post.answerCount} answers
        </span>
      </div>
      <h3>{linkToPost ? <Link href={href}>{post.title}</Link> : post.title}</h3>
      <p>{post.body.length > 280 ? `${post.body.slice(0, 280)}…` : post.body}</p>
      {post.sourceUrl ? (
        <p className="circle-identity-meta">
          Community source:{" "}
          <a href={post.sourceUrl} rel="noreferrer" target="_blank">
            {post.sourceDomain ?? post.sourceUrl}
          </a>
        </p>
      ) : null}
      <div className="mission-footer">
        <span className="mission-index-context">
          <span aria-hidden="true" className="avatar-orb">
            {personInitials(post.author.displayName)}
          </span>
          <Link href={`/u/${post.author.handle}`}>
            {post.author.displayName} · @{post.author.handle}
          </Link>
        </span>
        {linkToPost ? (
          <Link className="mission-action-link" href={href}>
            Open discussion
          </Link>
        ) : (
          <span>{post.createdAt.slice(0, 10)}</span>
        )}
      </div>
    </article>
  );
}

type PostResponse = { ok: boolean; post?: CommunityPost; message?: string };

export function CommunityPostForm({ circleSlug }: { circleSlug: string }) {
  const router = useRouter();
  const [type, setType] = useState<"question" | "insight" | "source">("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/circles/${circleSlug}/community/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, body, sourceUrl: sourceUrl || null }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as PostResponse).ok !== true) {
        setError(
          typeof payload === "object" && payload !== null && "message" in payload
            ? String((payload as PostResponse).message ?? "The post could not be created.")
            : "The post could not be created.",
        );
      } else {
        setTitle("");
        setBody("");
        setSourceUrl("");
        router.refresh();
      }
    } catch {
      setError("The post could not be created. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="community-post-type">Type</label>
        <select
          id="community-post-type"
          onChange={(event) => setType(event.target.value as "question" | "insight" | "source")}
          value={type}
        >
          <option value="question">Question — ask the Circle</option>
          <option value="insight">Insight — explain something useful</option>
          <option value="source">Source — share official material with context</option>
        </select>
        <p className="control-note">
          Insights are educational explanations, never investment recommendations or price predictions.
        </p>
      </div>
      <div className="field-group">
        <label htmlFor="community-post-title">Title</label>
        <input id="community-post-title" onChange={(event) => setTitle(event.target.value)} required value={title} />
      </div>
      <div className="field-group">
        <label htmlFor="community-post-body">
          {type === "source" ? "Why does this source matter?" : "Details"}
        </label>
        <textarea
          id="community-post-body"
          onChange={(event) => setBody(event.target.value)}
          required
          rows={4}
          value={body}
        />
      </div>
      {type === "source" ? (
        <div className="field-group">
          <label htmlFor="community-post-url">Source URL</label>
          <input
            id="community-post-url"
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://…"
            required
            value={sourceUrl}
          />
          <p className="control-note">Community sources stay distinct from the official Asset Passport sources.</p>
        </div>
      ) : null}
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Posting…" : "Post to Circle"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
