"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UTILITY_INTENTS, type UtilityIntent } from "@/lib/utility-discovery/intents";
import { groupByAsset, type AssetGroup } from "@/lib/utility-discovery/grouping";
import type { UtilityDiscovery, UtilityOpportunity } from "@/lib/utility-discovery/service";

function actionCtaLabel(kind: string, title: string): string {
  const key = kind.toLowerCase();
  if (key === "access") return "Access";
  if (key === "send") return "Send";
  if (key === "borrow") return "Borrow";
  if (key === "exit") return "Exit";
  if (key === "swap") return "Swap";
  if (key === "redeem") return "Redeem";
  if (key === "earn") return "Earn";
  return title;
}

function AssetCard({ group }: { group: AssetGroup<UtilityOpportunity> }) {
  return (
    <div className="watch-card" data-asset={group.slug}>
      <p>
        <strong>{group.code}</strong>
        <span className="muted"> · {group.network}</span>
        {group.held ? <span className="pill">You hold this</span> : null}
      </p>
      <p className="muted small">{group.classLabel} · {group.issuer}</p>
      {group.actions.length > 0 ? (
        <div className="stack">
          <p className="muted small"><strong>Available utility</strong></p>
          {group.actions.map((action) => (
            <div className="watch-row" key={action.id}>
              <div>
                <p><strong>{action.title.split("—")[1]?.trim() ?? action.title}</strong></p>
                <p className="muted small">{action.description}</p>
                <p className="muted small">{action.stateLabel}</p>
                {action.eligibilityNote ? <p className="muted small">{action.eligibilityNote}</p> : null}
              </div>
              <div className="watch-row-side">
                {action.state === "available" || action.state === "permissioned" ? (
                  action.href.startsWith("http") ? (
                    <a className="button button-outline button-small" href={action.href} target="_blank" rel="noreferrer">
                      {action.state === "available" ? actionCtaLabel(action.kind, action.title) : "View official flow"}
                    </a>
                  ) : (
                    <Link className="button button-outline button-small" href={action.href}>
                      {action.state === "available" ? actionCtaLabel(action.kind, action.title) : "View official flow"}
                    </Link>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {group.campaigns.map((item) => (
        <div className="watch-row" key={item.id}>
          <div>
            <p><strong>Verified action reward</strong></p>
            <p className="muted small">
              {item.description} Reward: {item.campaign!.rewardPerCompletion ?? "?"} {item.campaign!.rewardAsset}
            </p>
          </div>
          <div className="watch-row-side">
            <Link className="button button-outline button-small" href={item.href}>View campaign</Link>
          </div>
        </div>
      ))}
      <div className="row">
        <Link className="button button-outline button-small" href={`/circles/${group.slug}`}>Open {group.code}</Link>
      </div>
    </div>
  );
}

export function UseBrowser({ discovery }: { discovery: UtilityDiscovery }) {
  const [intent, setIntent] = useState<UtilityIntent | "all">("all");

  const stellar = useMemo(() => {
    const items = intent === "all" ? discovery.stellar : discovery.stellar.filter((item) => item.intent === intent);
    return groupByAsset(items);
  }, [discovery, intent]);
  const beyond = useMemo(() => {
    const items = intent === "all" ? discovery.beyond : discovery.beyond.filter((item) => item.intent === intent);
    return groupByAsset(items);
  }, [discovery, intent]);

  const renderSection = (groups: AssetGroup<UtilityOpportunity>[], emptyNote: string) =>
    groups.length === 0 ? (
      <p className="muted">{emptyNote}</p>
    ) : (
      <div className="watch-grid">
        {groups.map((group) => (
          <AssetCard key={group.slug} group={group} />
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
        <h2>On Stellar ({stellar.length} {stellar.length === 1 ? "asset" : "assets"})</h2>
        {renderSection(stellar, "No Stellar assets match this intent right now.")}
      </section>
      <section className="card">
        <h2>Beyond Stellar ({beyond.length} {beyond.length === 1 ? "asset" : "assets"})</h2>
        <p className="muted small">Extensions through connected ecosystems — never equal homes.</p>
        {renderSection(beyond, "No connected-ecosystem assets match this intent right now.")}
      </section>
    </>
  );
}
