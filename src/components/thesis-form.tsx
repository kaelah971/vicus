"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type EvidencePost = { id: string; title: string; type: string };

export function ThesisForm({
  circleSlug,
  posts,
  linkableAssets,
}: {
  circleSlug: string;
  posts: EvidencePost[];
  linkableAssets: { slug: string; code: string }[];
}) {
  const [title, setTitle] = useState("");
  const [claim, setClaim] = useState("");
  const [timeframe, setTimeframe] = useState("30d");
  const [confidence, setConfidence] = useState("70");
  const [checkedPosts, setCheckedPosts] = useState<string[]>([]);
  const [linkPosition, setLinkPosition] = useState(false);
  const [linkedAsset, setLinkedAsset] = useState(linkableAssets[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/circles/${circleSlug}/theses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          claim: claim.trim(),
          timeframe,
          confidence: Number(confidence),
          evidence: checkedPosts.map((postId) => {
            const post = posts.find((entry) => entry.id === postId);
            return { kind: "post", label: post?.title.slice(0, 160) ?? "Circle post", postId };
          }),
          linkPosition,
          linkedAssetSlug: linkPosition ? linkedAsset : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
        thesis?: { id: string };
        message?: string;
      };
      if (data.ok && data.thesis) {
        setCreatedId(data.thesis.id);
        setNotice("Paper thesis published. No money at risk; confidence is yours alone.");
      } else {
        setNotice(data.message ?? "That thesis could not be published.");
      }
    } catch {
      setNotice("That thesis could not be published.");
    }
    setBusy(false);
  }

  if (createdId) {
    return (
      <div className="stack">
        <p className="muted">{notice}</p>
        <a className="button button-outline button-small" href={`/circles/${circleSlug}/conviction/${createdId}`}>
          Open thesis
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} placeholder="AAPLx stays the usable xStock" />
      </label>
      <label className="field">
        <span>Claim</span>
        <textarea value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={2000} rows={4} placeholder="State the claim precisely." />
      </label>
      <div className="row">
        <label className="field">
          <span>Timeframe</span>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="6m">6 months</option>
          </select>
        </label>
        <label className="field">
          <span>Your confidence (0–100)</span>
          <input value={confidence} onChange={(e) => setConfidence(e.target.value)} inputMode="numeric" placeholder="70" />
        </label>
      </div>
      {posts.length > 0 ? (
        <div className="field">
          <span>Cite Circle evidence (optional)</span>
          {posts.slice(0, 8).map((post) => (
            <label className="check" key={post.id}>
              <input
                type="checkbox"
                checked={checkedPosts.includes(post.id)}
                onChange={(e) =>
                  setCheckedPosts((prev) => (e.target.checked ? [...prev, post.id] : prev.filter((id) => id !== post.id)))
                }
              />
              <span>[{post.type}] {post.title.slice(0, 80)}</span>
            </label>
          ))}
        </div>
      ) : null}
      {linkableAssets.length > 0 ? (
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={linkPosition} onChange={(e) => setLinkPosition(e.target.checked)} />
            <span>Link verified Stellar holding (proves existence only — never the amount)</span>
          </label>
          {linkPosition ? (
            <select value={linkedAsset} onChange={(e) => setLinkedAsset(e.target.value)} aria-label="Asset held">
              {linkableAssets.map((asset) => (
                <option key={asset.slug} value={asset.slug}>{asset.code}</option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
      <button type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish paper thesis"}</button>
      {notice && <p className="muted">{notice}</p>}
    </form>
  );
}
