"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/vicus";

export function BasketWatchButton({
  basketKind,
  basketRef,
  initialWatched = false,
}: {
  basketKind: "curated" | "user";
  basketRef: string;
  initialWatched?: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleWatch() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/baskets/${encodeURIComponent(basketRef)}/watch`, {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: basketKind }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setError(typeof body?.message === "string" ? body.message : "Sign in to watch baskets.");
        return;
      }
      setWatched(body.watched === true);
    } catch {
      setError("Watch state is temporarily unavailable. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="watch-control">
      <button
        aria-busy={busy}
        aria-pressed={watched}
        className="button button-white"
        disabled={busy}
        onClick={toggleWatch}
        type="button"
      >
        <span>{busy ? "Saving…" : watched ? "Watching" : "Watch"}</span>
        <Icon name={watched ? "check" : "arrow-right"} size={16} />
      </button>
      <span className="control-note">Watching tracks this theme for discovery; it is not ownership.</span>
      {error ? (
        <span className="watch-error" role="alert">
          {error} <Link href="/profile/me">Connect wallet</Link>
        </span>
      ) : null}
    </div>
  );
}
