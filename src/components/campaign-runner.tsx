"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  circleSlug: string;
  circleName: string;
  objective: string;
  targetAction: string;
  rewardAsset: string;
  rewardNetworkLabel: string;
  rewardPerCompletion: string | null;
  participantCap: number | null;
  fundedAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
};

type Proof = { kind: string; id: string; label: string; completedAt: string };

type Completion = {
  id: string;
  proofKind: string;
  rewardAmount: string;
  rewardAsset: string;
  status: string;
  payoutTxHash: string | null;
  payoutExplorerUrl: string | null;
  lastError: string | null;
  paidAt: string | null;
};

const ACTION_HREF: Record<string, (slug: string) => string> = {
  send: (slug) => `/send?asset=${slug}`,
  swap: (slug) => `/swap/${slug}`,
  mission: (slug) => `/circles/${slug}#missions`,
};

const ACTION_LABEL: Record<string, string> = {
  send: "Send",
  swap: "Swap",
  mission: "Complete mission",
};

export function CampaignRunner({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [campaignRes, proofsRes, completionsRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" }),
          fetch(`/api/campaigns/${campaignId}/claim?view=proofs`, { cache: "no-store" }),
          fetch(`/api/campaigns/${campaignId}/claim`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const campaignData = (await campaignRes.json()) as { ok: boolean; campaign?: Campaign };
        if (campaignData.ok && campaignData.campaign) setCampaign(campaignData.campaign);
        else if (!cancelled) setFailed(true);
        const proofsData = (await proofsRes.json()) as { ok: boolean; proofs?: Proof[] };
        if (!cancelled && proofsData.ok && proofsData.proofs) setProofs(proofsData.proofs);
        const completionsData = (await completionsRes.json()) as { ok: boolean; completions?: Completion[] };
        if (!cancelled && completionsData.ok && completionsData.completions) setCompletions(completionsData.completions);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function refresh() {
    try {
      const [proofsRes, completionsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/claim?view=proofs`, { cache: "no-store" }),
        fetch(`/api/campaigns/${campaignId}/claim`, { cache: "no-store" }),
      ]);
      const proofsData = (await proofsRes.json()) as { ok: boolean; proofs?: Proof[] };
      if (proofsData.ok && proofsData.proofs) setProofs(proofsData.proofs);
      const completionsData = (await completionsRes.json()) as { ok: boolean; completions?: Completion[] };
      if (completionsData.ok && completionsData.completions) setCompletions(completionsData.completions);
    } catch {
      /* lists stay as-is on failure */
    }
  }

  async function claim(proof: Proof) {
    if (busy) return;
    setBusy(proof.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofKind: proof.kind, proofId: proof.id }),
      });
      const data = (await response.json()) as { ok: boolean; completion?: Completion; message?: string; code?: string };
      if (data.ok && data.completion) {
        setCompletions((current) => {
          const rest = current.filter((entry) => entry.id !== data.completion!.id);
          return [data.completion!, ...rest];
        });
        setProofs((current) => current.filter((entry) => entry.id !== proof.id));
        if (data.completion.status !== "paid") {
          setNotice(data.completion.lastError ?? "Submitted — the payout is still settling. It stays retryable.");
        }
      } else {
        setNotice(data.message ?? "That reward could not be claimed.");
      }
    } catch {
      setNotice("The claim could not be submitted. Try again.");
    }
    setBusy(null);
    void refresh();
  }

  if (failed) return <p className="muted">That campaign could not be found.</p>;
  if (!campaign) return <p className="muted">Loading the campaign…</p>;

  const actionHref = (ACTION_HREF[campaign.targetAction] ?? ACTION_HREF.mission)!(campaign.circleSlug);
  const actionLabel = ACTION_LABEL[campaign.targetAction] ?? "Complete action";
  const live = campaign.status === "active";

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">
          Activation campaign · {campaign.circleName} · {campaign.rewardNetworkLabel}
        </p>
        <h1>{campaign.objective}</h1>
        <dl className="fact-list">
          <div><dt>Action</dt><dd>{actionLabel} {campaign.circleSlug}</dd></div>
          <div>
            <dt>Reward</dt>
            <dd>{campaign.rewardPerCompletion ?? "—"} {campaign.rewardAsset} per verified completion</dd>
          </div>
          <div><dt>Budget paid</dt><dd>{campaign.paidAmount} of {campaign.fundedAmount} {campaign.rewardAsset}</dd></div>
          <div><dt>Remaining</dt><dd>{campaign.remainingAmount} {campaign.rewardAsset}</dd></div>
          <div><dt>Status</dt><dd>{campaign.status}</dd></div>
        </dl>
        {live ? (
          <div className="row">
            <a className="btn primary" href={actionHref}>{actionLabel}</a>
          </div>
        ) : (
          <p className="muted small">This campaign is {campaign.status} and not paying rewards right now.</p>
        )}
      </section>

      <section className="card">
        <h2>Your verified actions</h2>
        {proofs.length === 0 ? (
          <p className="muted small">
            No unused verified {campaign.targetAction} proofs yet. Complete the action above first.
          </p>
        ) : (
          <ul className="proof-list">
            {proofs.map((proof) => (
              <li key={proof.id}>
                <span>{proof.label}</span>
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null || !live}
                  onClick={() => void claim(proof)}
                >
                  {busy === proof.id ? "Claiming…" : `Claim ${campaign.rewardPerCompletion} ${campaign.rewardAsset}`}
                </button>
              </li>
            ))}
          </ul>
        )}
        {notice ? <p className="notice">{notice}</p> : null}
      </section>

      {completions.length > 0 ? (
        <section className="card">
          <h2>Your rewards</h2>
          <ul className="proof-list">
            {completions.map((completion) => (
              <li key={completion.id}>
                <span>
                  {completion.rewardAmount} {completion.rewardAsset} · {completion.status}
                  {completion.payoutExplorerUrl ? (
                    <>
                      {" · "}
                      <a href={completion.payoutExplorerUrl} rel="noreferrer" target="_blank">View payout</a>
                    </>
                  ) : null}
                  {completion.lastError && completion.status !== "paid" ? ` · ${completion.lastError}` : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
