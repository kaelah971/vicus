"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/vicus";

export function WatchButton({
  circleSlug,
  initialWatched = false,
}: {
  circleSlug: string;
  initialWatched?: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleWatch() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/circles/${encodeURIComponent(circleSlug)}/watch`, {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setError(typeof body?.message === "string" ? body.message : "Connect a verified wallet to watch this asset.");
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
      <span className="control-note">Watching follows this asset in Vicus; it is not proof of ownership.</span>
      {error ? (
        <span className="watch-error" role="alert">
          {error} <Link href="/profile/me">Connect wallet</Link>
        </span>
      ) : null}
    </div>
  );
}
