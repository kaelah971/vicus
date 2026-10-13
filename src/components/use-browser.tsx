"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UTILITY_INTENTS, type UtilityIntent } from "@/lib/utility-discovery/intents";
import { groupByAsset, type AssetGroup } from "@/lib/utility-discovery/grouping";
import type { UtilityDiscovery, UtilityOpportunity } from "@/lib/utility-discovery/service";
import { AssetToken, Orb, capabilityMeta } from "@/components/vicus-ui";

function ActionIcon({ kind }: { kind: string }) {
  const meta = capabilityMeta(kind);
  return <Orb icon={meta.icon} size="sm" tone={meta.tone} />;
}

function ActionRow({ action }: { action: UtilityOpportunity }) {
  const label = actionCtaLabel(action.kind, action.title);
  const cta = action.state === "available" || action.state === "permissioned" ? (
    action.href.startsWith("http") ? (
      <a className="button button-outline button-small" href={action.href} target="_blank" rel="noreferrer">
        {action.state === "available" ? label : "Official flow"}
      </a>
    ) : (
      <Link className="button button-outline button-small" href={action.href}>
        {action.state === "available" ? label : "Official flow"}
      </Link>
    )
  ) : null;
  const hasDetail = Boolean(action.description || action.eligibilityNote);
  return (
    <div className="use-action" key={action.id}>
      <ActionIcon kind={action.kind} />
      <span className="use-action-main">
        <strong>{label}</strong>
        <small>{action.stateLabel}</small>
      </span>
      {cta}
      {hasDetail ? (
        <details className="use-action-detail">
          <summary>Why</summary>
          {action.description ? <p className="muted small">{action.description}</p> : null}
          {action.eligibilityNote ? <p className="muted small">{action.eligibilityNote}</p> : null}
        </details>
      ) : null}
    </div>
  );
}

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
    <div className="watch-card use-card" data-asset={group.slug}>
      <div className="use-card-head">
        <AssetToken code={group.code} ecosystem={group.network} size="lg" />
        <span>
          <strong>{group.code}</strong>
          <small>{group.classLabel}</small>
        </span>
        {group.held ? <span className="pill">You hold this</span> : null}
      </div>
      {group.actions.length > 0 ? (
        <div className="use-actions">
          {group.actions.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </div>
      ) : null}
      {group.campaigns.map((item) => (
        <div className="watch-row" key={item.id}>
          <div>
            <p><strong>Verified action reward</strong></p>
            <p className="muted small">
              Reward: {item.campaign!.rewardPerCompletion ?? "?"} {item.campaign!.rewardAsset}
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
