"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RewardStateView } from "@/lib/rewards/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shortenAddress(address: string | null) {
  return address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Not available";
}

function networkLabel(network: RewardStateView["network"]) {
  return network === "testnet" ? "Stellar Testnet" : "Stellar Public Network";
}

function statusLabel(status: RewardStateView["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: RewardStateView["status"]) {
  if (status === "confirmed") return "green";
  if (status === "submitted") return "blue";
  if (status === "claimable") return "violet";
  return "muted";
}

export function RewardClaimCard({ reward }: { reward: RewardStateView }) {
  const router = useRouter();
  const [current, setCurrent] = useState(reward);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canClaim = current.status === "eligible" || current.status === "claimable" || current.status === "failed";

  async function claimReward() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rewards/submissions/${current.submissionId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !isObject(body) || body.ok !== true || !isObject(body.reward)) {
        setError(isObject(body) && typeof body.message === "string" ? body.message : "The reward could not be claimed.");
        return;
      }

      const nextReward = body.reward as unknown as RewardStateView;
      setCurrent(nextReward);
      if (nextReward.id) {
        router.push(`/rewards/${nextReward.id}`);
      }
    } catch {
      setError("The reward could not be claimed. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="reward-claim-card">
      <div className="reward-claim-header">
        <div>
          <span className="eyebrow">Reward available</span>
          <h3>{current.amount} XLM</h3>
        </div>
        <span aria-live="polite" className={`status-pill status-${statusTone(current.status)}`}>
          {statusLabel(current.status)}
        </span>
      </div>

      <dl className="reward-claim-meta">
        <div>
          <dt>Network</dt>
          <dd>{networkLabel(current.network)}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{shortenAddress(current.destinationPublicKey)}</dd>
        </div>
      </dl>

      <p className="reward-claim-copy">
        This reward uses a real {networkLabel(current.network)} transaction. Testnet XLM has no monetary value.
      </p>

      {current.failureMessage ? <p className="reward-claim-error" role="alert">{current.failureMessage}</p> : null}
      {error ? <p className="reward-claim-error" role="alert">{error}</p> : null}

      <div className="reward-claim-actions">
        {canClaim ? (
          <button aria-busy={busy} className="button button-violet button-small" disabled={busy} onClick={claimReward} type="button">
            {busy ? "Claiming…" : current.status === "failed" ? "Try claim again" : "Claim reward"}
          </button>
        ) : null}
        {current.id ? <a className="mission-action-link" href={`/rewards/${current.id}`}>View receipt</a> : null}
      </div>
    </article>
  );
}
