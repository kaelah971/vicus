"use client";

import { useEffect, useState } from "react";

type StudioCampaign = {
  id: string;
  circleSlug: string;
  circleName: string;
  objective: string;
  targetAction: string;
  rewardPerCompletion: string | null;
  participantCap: number | null;
  fundedAmount: string;
  paidAmount: string;
  remainingAmount: string;
  treasuryAccount: string | null;
  fundingTxHash: string | null;
  status: string;
};

type StudioCircle = { id: string; slug: string; name: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ ok: false }))) as {
    ok: boolean;
    campaign?: StudioCampaign;
    message?: string;
  };
}

async function patchJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ ok: false }))) as {
    ok: boolean;
    campaign?: StudioCampaign;
    message?: string;
  };
}

export function CampaignStudio({
  organizationId,
  circles,
}: {
  organizationId: string;
  circles: StudioCircle[];
}) {
  const [campaigns, setCampaigns] = useState<StudioCampaign[]>([]);
  const [circleSlug, setCircleSlug] = useState("");
  const [objective, setObjective] = useState("");
  const [targetAction, setTargetAction] = useState("send");
  const [reward, setReward] = useState("1");
  const [cap, setCap] = useState("100");
  const [funding, setFunding] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/campaigns?organizationId=${organizationId}`, { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; campaigns?: StudioCampaign[] };
        if (!cancelled && data.ok && data.campaigns) setCampaigns(data.campaigns);
      } catch {
        /* studio list stays empty on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  async function refresh() {
    try {
      const response = await fetch(`/api/campaigns?organizationId=${organizationId}`, { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; campaigns?: StudioCampaign[] };
      if (data.ok && data.campaigns) setCampaigns(data.campaigns);
    } catch {
      /* studio list stays as-is on failure */
    }
  }

  async function create() {
    if (busy || !circleSlug.trim() || !objective.trim()) return;
    setBusy(true);
    setNotice(null);
    const hosted = circles.some((entry) => entry.slug === circleSlug.trim());
    const result = await postJson("/api/campaigns", {
      circleSlug: circleSlug.trim(),
      organizationId: hosted ? organizationId : undefined,
      objective: objective.trim(),
      targetAction,
      rewardPerCompletion: reward.trim(),
      participantCap: cap.trim() === "" ? null : cap.trim(),
    });
    setBusy(false);
    if (result.ok && result.campaign) {
      setCircleSlug("");
      setObjective("");
      void refresh();
    } else {
      setNotice(result.message ?? "That campaign could not be created.");
    }
  }

  async function fund(campaign: StudioCampaign) {
    const hash = (funding[campaign.id] ?? "").trim();
    if (!hash || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await postJson(`/api/campaigns/${campaign.id}/manage`, { fundingTxHash: hash });
    setBusy(false);
    if (result.ok) void refresh();
    else setNotice(result.message ?? "That funding transaction did not verify.");
  }

  async function transition(campaign: StudioCampaign, to: "active" | "paused" | "completed") {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await patchJson(`/api/campaigns/${campaign.id}/manage`, { to });
    setBusy(false);
    if (result.ok) void refresh();
    else setNotice(result.message ?? "That transition was rejected.");
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>New activation campaign</h3>
        <p className="muted small">
          Rewards pay in Stellar Testnet USDC from the campaign treasury. A campaign cannot activate until
          Testnet funding verifies onchain.
        </p>
        <label className="field">
          <span>Target Circle slug</span>
          <input
            value={circleSlug}
            onChange={(event) => setCircleSlug(event.target.value)}
            placeholder="benji-on-stellar"
            list="campaign-studio-circles"
          />
          <datalist id="campaign-studio-circles">
            {circles.map((entry) => (
              <option key={entry.id} value={entry.slug}>{entry.name}</option>
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Objective</span>
          <input
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Activate BENJI"
          />
        </label>
        <div className="row">
          <label className="field">
            <span>Qualifying action</span>
            <select value={targetAction} onChange={(event) => setTargetAction(event.target.value)}>
              <option value="send">Send</option>
              <option value="swap">Swap</option>
              <option value="exit">Exit</option>
              <option value="mission">Approved mission</option>
            </select>
          </label>
          <label className="field">
            <span>Reward per completion (USDC)</span>
            <input value={reward} onChange={(event) => setReward(event.target.value)} inputMode="decimal" />
          </label>
          <label className="field">
            <span>Participant cap</span>
            <input value={cap} onChange={(event) => setCap(event.target.value)} inputMode="numeric" />
          </label>
        </div>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void create()}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
        {notice ? <p className="notice">{notice}</p> : null}
      </div>

      {campaigns.map((campaign) => (
        <div className="card" key={campaign.id}>
          <p><strong>{campaign.objective}</strong> <span className="muted small">· {campaign.status}</span></p>
          <p className="muted small">
            {campaign.circleName} · {campaign.targetAction} · {campaign.rewardPerCompletion} USDC ·
            paid {campaign.paidAmount} of {campaign.fundedAmount} · remaining {campaign.remainingAmount}
          </p>
          {campaign.status === "awaiting_funding" && campaign.treasuryAccount ? (
            <div>
              <p className="muted small">
                Send Testnet USDC to <span className="mono">{campaign.treasuryAccount}</span>, then paste the funding hash:
              </p>
              <div className="row">
                <input
                  value={funding[campaign.id] ?? ""}
                  onChange={(event) => setFunding((current) => ({ ...current, [campaign.id]: event.target.value }))}
                  placeholder="funding transaction hash"
                  className="mono"
                />
                <button type="button" className="btn" disabled={busy} onClick={() => void fund(campaign)}>
                  Verify funding
                </button>
              </div>
            </div>
          ) : null}
          <div className="row">
            {campaign.status === "funded" || campaign.status === "paused" ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void transition(campaign, "active")}>
                Activate
              </button>
            ) : null}
            {campaign.status === "active" ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void transition(campaign, "paused")}>
                Pause
              </button>
            ) : null}
            {campaign.status === "active" || campaign.status === "paused" || campaign.status === "exhausted" ? (
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void transition(campaign, "completed")}>
                Complete
              </button>
            ) : null}
            <a className="btn ghost" href={`/campaigns/${campaign.id}`}>Open campaign</a>
          </div>
        </div>
      ))}
    </div>
  );
}
