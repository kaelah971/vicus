"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StatusResponse =
  | { ok: true; mission: { id: string; status: string; title: string } }
  | { ok: false; message: string };

function isStatusResponse(value: unknown): value is StatusResponse {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Partial<StatusResponse>).ok === "boolean";
}

export function AdminMissionStatusControl({
  missionId,
  status,
}: {
  missionId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nextStatus = status === "open" ? "draft" : "open";
  const actionLabel = status === "open" ? "Move to draft" : "Open campaign";
  const hint =
    status === "open"
      ? "Open missions are participant-visible. Moving to draft hides this campaign from participants immediately."
      : "Draft missions are visible to admins only. Opening makes this campaign participant-visible immediately.";

  async function handleClick() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!isStatusResponse(body)) {
        setError("The status response could not be understood. Try again later.");
      } else if (!body.ok) {
        setError(body.message);
      } else {
        router.refresh();
      }
    } catch {
      setError("The campaign status could not be changed. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel" aria-label="Campaign lifecycle">
      <p className="control-note">{hint}</p>
      <button type="button" className="primary-action" onClick={handleClick} disabled={busy}>
        {busy ? "Saving…" : actionLabel}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
