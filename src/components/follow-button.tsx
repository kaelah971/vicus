"use client";

import { useState } from "react";

type FollowResponse = { ok: boolean; following?: boolean; message?: string };

export function FollowButton({
  handle,
  initialFollowing,
}: {
  handle: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(handle)}/follow`, {
        method: following ? "DELETE" : "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (
        typeof payload !== "object" ||
        payload === null ||
        (payload as FollowResponse).ok !== true
      ) {
        const message =
          typeof payload === "object" && payload !== null && "message" in payload
            ? String((payload as FollowResponse).message ?? "The follow could not be changed.")
            : "The follow could not be changed.";
        setError(message);
      } else {
        setFollowing((payload as FollowResponse).following ?? !following);
      }
    } catch {
      setError("The follow could not be changed. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="follow-control">
      <button
        className={following ? "button button-outline button-small" : "button button-small"}
        disabled={busy}
        onClick={toggle}
        type="button"
      >
        {busy ? "Saving…" : following ? "Following" : "Follow"}
      </button>
      {error ? (
        <span className="wallet-auth-message" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
