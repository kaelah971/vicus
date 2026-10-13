"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UTILITY_INTENTS, type UtilityIntent } from "@/lib/utility-discovery/intents";
import type { UtilityDiscovery } from "@/lib/utility-discovery/service";
export function UseBrowser({ discovery }: { discovery: UtilityDiscovery }) {
  const [intent, setIntent] = useState<UtilityIntent | "all">("all");
  const matches = useMemo(
    () => (intent === "all" ? null : new Set([intent] as string[])),
    [intent],
  );
  const stellar = useMemo(
    () => (matches ? discovery.stellar.filter((item) => matches.has(item.intent)) : discovery.stellar),
    [discovery, matches],
  );
  const beyond = useMemo(
    () => (matches ? discovery.beyond.filter((item) => matches.has(item.intent)) : discovery.beyond),
    [discovery, matches],
  );

  const renderGroup = (items: typeof stellar, emptyNote: string) =>
    items.length === 0 ? (
      <p className="muted">{emptyNote}</p>
    ) : (
      <div className="watch-grid">
        {items.map((item) => (
          <div className="watch-card" key={item.id}>
            <p>
              <strong>{item.assetCode}</strong>
              <span className="muted"> · {item.network}</span>
              {item.held ? <span className="pill">You hold this</span> : null}
            </p>
            <p><strong>{item.title.split("—")[1]?.trim() ?? item.title}</strong></p>
            <p className="muted small">{item.description}</p>
            <p className="muted small">{item.stateLabel}</p>
            {item.campaign ? (
              <p className="muted small">
                Reward: {item.campaign.rewardPerCompletion ?? "?"} {item.campaign.rewardAsset} · {item.campaign.status}
              </p>
            ) : null}
            {item.eligibilityNote ? <p className="muted small">{item.eligibilityNote}</p> : null}
            <div className="row">
              {item.href.startsWith("http") ? (
                <a className="button button-outline button-small" href={item.href} target="_blank" rel="noreferrer">Open</a>
              ) : (
                <Link className="button button-outline button-small" href={item.href}>Open</Link>
              )}
              <Link className="button button-outline button-small" href={`/circles/${item.assetSlug}`}>Asset</Link>
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <>
      <div className="x-pills" role="group" aria-label="Filter by intent">
        {UTILITY_INTENTS.map((entry) => (
          <button
            key={entry.key}
            aria-pressed={intent === entry.key}
            onClick={() => setIntent(entry.key)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <section className="card">
        <h2>On Stellar ({stellar.length})</h2>
        {renderGroup(stellar, "No Stellar utility matches this intent right now.")}
      </section>
      <section className="card">
        <h2>Beyond Stellar ({beyond.length})</h2>
        <p className="muted small">Extensions through connected ecosystems — never equal homes.</p>
        {renderGroup(beyond, "No connected-ecosystem utility matches this intent right now.")}
      </section>
    </>
  );
}
