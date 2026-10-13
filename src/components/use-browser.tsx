"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UTILITY_INTENTS, type UtilityIntent } from "@/lib/utility-discovery/intents";
import { groupByAsset, type AssetGroup } from "@/lib/utility-discovery/grouping";
import type { UtilityDiscovery, UtilityOpportunity } from "@/lib/utility-discovery/service";
import { AssetTile } from "@/components/asset-tile";
import { AssetSheet, type SheetSubject } from "@/components/asset-sheet";

function toSheetActions(actions: UtilityOpportunity[]) {
  return actions.map((action) => ({
    kind: action.kind,
    title: action.title.replace(`${action.assetCode} — `, ""),
    description: action.description,
    state: action.state,
    stateLabel: action.stateLabel,
    href: action.href,
    external: action.href.startsWith("http"),
    eligibilityNote: action.eligibilityNote,
    sourceUrl: action.sourceUrl,
  }));
}

export function UseBrowser({
  discovery,
  subjectMap = {},
}: {
  discovery: UtilityDiscovery;
  subjectMap?: Record<string, SheetSubject>;
}) {
  const [intent, setIntent] = useState<UtilityIntent | "all">("all");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const stellar = useMemo(() => {
    const items = intent === "all" ? discovery.stellar : discovery.stellar.filter((item) => item.intent === intent);
    return groupByAsset(items);
  }, [discovery, intent]);
  const beyond = useMemo(() => {
    const items = intent === "all" ? discovery.beyond : discovery.beyond.filter((item) => item.intent === intent);
    return groupByAsset(items);
  }, [discovery, intent]);

  const allGroups = useMemo(() => [...stellar, ...beyond], [stellar, beyond]);
  const bySlug = useMemo(() => new Map(allGroups.map((group) => [group.slug, group])), [allGroups]);
  const selectedSlug = (searchParams.get("asset") ?? "").trim();
  const selected: AssetGroup<UtilityOpportunity> | null = selectedSlug ? (bySlug.get(selectedSlug) ?? null) : null;

  function openAsset(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("asset", slug);
    router.push(`${pathname}?${params.toString()}`);
  }

  function closeAsset() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("asset");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }

  const renderTiles = (groups: AssetGroup<UtilityOpportunity>[], emptyNote: string) =>
    groups.length === 0 ? (
      <p className="muted">{emptyNote}</p>
    ) : (
      <div className="v-tiles">
        {groups.map((group) => {
          const matched = intent === "all" ? group.actions : group.actions.filter((a) => a.intent === intent);
          const labels = (matched.length > 0 ? matched : group.actions).slice(0, 3).map((a) => {
            const key = a.kind.toLowerCase();
            if (key === "access") return "Access";
            if (key === "send") return "Send";
            if (key === "borrow") return "Borrow";
            if (key === "exit") return "Exit";
            if (key === "swap") return "Swap";
            if (key === "redeem") return "Redeem";
            if (key === "earn") return "Earn";
            return a.title.replace(`${group.code} — `, "");
          });
          const head = group.actions[0];
          return (
            <AssetTile
              key={group.slug}
              asset={{
                slug: group.slug,
                code: group.code,
                name: head?.assetName ?? group.code,
                issuer: head?.issuer ?? null,
                classLabel: group.classLabel,
                ecosystem: head?.ecosystem ?? null,
                network: head?.network ?? null,
                actionLabels: labels,
              }}
              href={`/circles/${group.slug}`}
              onSelect={openAsset}
            />
          );
        })}
      </div>
    );

  return (
    <>
      <div className="x-pills v-filter-tabs" role="group" aria-label="Filter by intent">
        {UTILITY_INTENTS.map((entry) => (
          <button
            key={entry.key}
            aria-pressed={intent === entry.key}
            onClick={() => setIntent(entry.key)}
            type="button"
          >
            {entry.key === "all" ? "All" : entry.label}
          </button>
        ))}
      </div>
      <section className="card">
        <h2>On Stellar ({stellar.length} {stellar.length === 1 ? "asset" : "assets"})</h2>
        {renderTiles(stellar, "No Stellar assets match this intent right now.")}
      </section>
      <section className="card">
        <h2>Beyond Stellar ({beyond.length} {beyond.length === 1 ? "asset" : "assets"})</h2>
        <p className="muted small">Extensions through connected ecosystems — never equal homes.</p>
        {renderTiles(beyond, "No connected-ecosystem assets match this intent right now.")}
      </section>

      {selected ? (
        <AssetSheet
          asset={{
            slug: selected.slug,
            code: selected.code,
            name: selected.actions[0]?.assetName ?? selected.code,
            issuer: selected.actions[0]?.issuer ?? null,
            classLabel: selected.classLabel,
            ecosystem: selected.actions[0]?.ecosystem ?? null,
            network: selected.actions[0]?.network ?? null,
            summary: selected.actions[0]?.description ?? null,
            sourceUrl: selected.actions[0]?.sourceUrl ?? null,
          }}
          actions={toSheetActions(
            intent === "all" ? selected.actions : selected.actions.filter((a) => a.intent === intent).length > 0
              ? selected.actions.filter((a) => a.intent === intent)
              : selected.actions,
          )}
          subject={subjectMap[selected.slug] ?? null}
          campaignActive={selected.campaigns.length > 0}
          onClose={closeAsset}
          openHref={`/circles/${selected.slug}`}
          openLabel={`Open ${selected.code}`}
        />
      ) : null}
    </>
  );
}
