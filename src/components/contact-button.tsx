"use client";

import { useState } from "react";

type ContactResponse = { ok: boolean; message?: string };

export function ContactButton({
  handle,
  initialSaved,
}: {
  handle: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      if (saved) {
        // Removal needs the contact id: resolve mine, find the linked row.
        const list = await fetch("/api/contacts").then((response) =>
          response.json().catch(() => null),
        ) as (ContactResponse & { contacts?: Array<{ id: string; handle: string | null }> }) | null;
        const row = list?.contacts?.find(
          (entry) => entry.handle?.toLowerCase() === handle.toLowerCase(),
        );
        if (!row) {
          setSaved(false);
          return;
        }
        const removed = await fetch(`/api/contacts/${row.id}`, { method: "DELETE" }).then((response) =>
          response.json().catch(() => null),
        ) as ContactResponse | null;
        if (!removed?.ok) throw new Error(removed?.message);
        setSaved(false);
      } else {
        const created = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle }),
        }).then((response) => response.json().catch(() => null)) as ContactResponse | null;
        if (!created?.ok) throw new Error(created?.message);
        setSaved(true);
      }
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : "The contact could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="follow-control">
      <button
        className={saved ? "button button-outline button-small" : "button button-small"}
        disabled={busy}
        onClick={toggle}
        type="button"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save contact"}
      </button>
      {error ? (
        <span className="wallet-auth-message" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
