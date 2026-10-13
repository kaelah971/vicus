"use client";

import { useState } from "react";

export function ThesisActions({ thesisId, isAuthor }: { thesisId: string; isAuthor: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (!isAuthor) return null;

  async function call(action: "resolve" | "withdraw") {
    if (busy) return;
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/theses/${thesisId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "resolve" ? { outcomeNote: note.trim() } : {}),
      });
      const data = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; message?: string };
      setMessage(data.ok ? `Thesis ${action === "resolve" ? "resolved" : "withdrawn"}.` : (data.message ?? "That change failed."));
      if (data.ok) window.location.reload();
    } catch {
      setMessage("That change failed.");
    }
    setBusy("");
  }

  return (
    <div className="stack">
      <label className="field">
        <span>Outcome note (required to resolve)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
      </label>
      <div className="row">
        <button type="button" disabled={busy === "resolve"} onClick={() => void call("resolve")}>
          {busy === "resolve" ? "Resolving…" : "Resolve with note"}
        </button>
        <button type="button" disabled={busy === "withdraw"} onClick={() => void call("withdraw")}>
          {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
        </button>
      </div>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
