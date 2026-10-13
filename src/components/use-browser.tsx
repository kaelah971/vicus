"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { UtilityIntent } from "@/lib/utility-discovery/intents";
import { groupByAsset, type AssetGroup } from "@/lib/utility-discovery/grouping";
import type { UtilityDiscovery, UtilityOpportunity } from "@/lib/utility-discovery/service";
import { AssetSheet, type SheetSubject } from "@/components/asset-sheet";
import { Glyph, capabilityMeta, type GlyphName, type Tone } from "@/components/vicus-ui";

type IntentKey = Exclude<UtilityIntent, "all">;

const INTENT_ORDER: IntentKey[] = ["access", "send", "earn", "borrow", "redeem", "exit", "rewards", "use"];

const INTENT_LABEL: Record<IntentKey, string> = {
  access: "Access",
  send: "Send",
  earn: "Earn",
  borrow: "Borrow",
  redeem: "Redeem",
  exit: "Exit",
  rewards: "Rewards",
  use: "Other",
};

function intentStyle(intent: IntentKey): { tone: Tone; icon: GlyphName } {
  if (intent === "exit") return { tone: "orange", icon: "arrow-up-right" };
  if (intent === "rewards") return { tone: "pink", icon: "gift" };
  if (intent === "use") return { tone: "white", icon: "spark" };
  return capabilityMeta(intent);
}

function cleanTitle(action: UtilityOpportunity): string {
  return action.title.replace(`${action.assetCode} — `, "");
}

function toSheetActions(actions: UtilityOpportunity[]) {
  return actions.map((action) => ({
    kind: action.kind,
    title: cleanTitle(action),
    description: action.description,
    state: action.state,
    stateLabel: action.stateLabel,
    href: action.href,
    external: action.href.startsWith("http"),
    eligibilityNote: action.eligibilityNote,
    sourceUrl: action.sourceUrl,
  }));
}

/**
 * Use is action-first: pick what you want to do, then see the eligible
 * assets as compact rows. Never an asset catalogue — that is Discover.
 */
export function ActionIntentGrid({
  counts,
  active,
  onPick,
}: {
  counts: Record<string, number>;
  active: IntentKey | null;
  onPick: (intent: IntentKey | null) => void;
}) {
  const intents = INTENT_ORDER.filter((key) => (counts[key] ?? 0) > 0);
  if (intents.length === 0) return null;
  return (
    <div className="u-intent-grid" role="group" aria-label="What do you want to do?">
      {intents.map((key) => {
        const style = intentStyle(key);
        const pressed = active === key;
        return (
          <button
            key={key}
            type="button"
            className={`u-intent tone-${style.tone}${pressed ? " is-active" : ""}`}
            aria-pressed={pressed}
            onClick={() => onPick(pressed ? null : key)}
          >
            <Glyph name={style.icon} size={26} />
            <strong>{INTENT_LABEL[key]}</strong>
            <small>
              {counts[key]} {counts[key] === 1 ? "path" : "paths"}
            </small>
          </button>
        );
      })}
    </div>
  );
}

export function UseBrowser({
  discovery,
  subjectMap = {},
}: {
  discovery: UtilityDiscovery;
  subjectMap?: Record<string, SheetSubject>;
}) {
  const [intent, setIntent] = useState<IntentKey | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const all = useMemo(() => [...discovery.stellar, ...discovery.beyond], [discovery]);
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of all) map[item.intent] = (map[item.intent] ?? 0) + 1;
    return map;
  }, [all]);

  const availableNow = useMemo(
    () =>
      [...discovery.stellar.filter((i) => i.state === "available"), ...discovery.beyond.filter((i) => i.state === "available")].slice(0, 4),
    [discovery],
  );

  const matchedGroups = useMemo(() => {
    if (!intent) return [];
    return groupByAsset(all.filter((item) => item.intent === intent));
  }, [all, intent]);

  const bySlug = useMemo(() => new Map(groupByAsset(all).map((group) => [group.slug, group])), [all]);
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

  return (
    <>
      <p className="u-question">What do you want to do?</p>
      <ActionIntentGrid counts={counts} active={intent} onPick={setIntent} />

      {!intent ? (
        <section className="card u-available" aria-label="Available now">
          <h2>Available now</h2>
          {availableNow.length === 0 ? (
            <p className="muted">Nothing executable right now — check back soon.</p>
          ) : (
            <ul className="u-now-list">
              {availableNow.map((item) => (
                <li key={item.id}>
                  {item.href.startsWith("http") ? (
                    <a href={item.href} target="_blank" rel="noreferrer">
                      <strong>{cleanTitle(item)}</strong>
                      <small>
                        {item.assetCode} · {item.network}
                      </small>
                    </a>
                  ) : (
                    <Link href={item.href}>
                      <strong>{cleanTitle(item)}</strong>
                      <small>
                        {item.assetCode} · {item.network}
                      </small>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="card u-results" aria-label={`${INTENT_LABEL[intent]} assets`}>
          <h2>
            {INTENT_LABEL[intent]} · {matchedGroups.length} {matchedGroups.length === 1 ? "asset" : "assets"}
          </h2>
          {matchedGroups.length === 0 ? (
            <p className="muted">No assets support this right now.</p>
          ) : (
            <ul className="u-result-rows">
              {matchedGroups.map((group) => {
                const first = group.actions[0] ?? group.campaigns[0];
                return (
                  <li key={group.slug} className="u-result-row">
                    <button type="button" onClick={() => openAsset(group.slug)} aria-label={`Preview ${group.code}`}>
                      <span className="u-result-main">
                        <strong>{group.code}</strong>
                        <small>
                          {group.classLabel} · {first?.network ?? group.network}
                        </small>
                        {first ? <small className="u-result-state">{first.stateLabel}</small> : null}
                      </span>
                      <span className="u-result-open">Open →</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {selected ? (
        <AssetSheet
          asset={{
            slug: selected.slug,
            code: selected.code,
            name: selected.actions[0]?.assetName ?? selected.campaigns[0]?.assetName ?? selected.code,
            issuer: selected.actions[0]?.issuer ?? selected.campaigns[0]?.issuer ?? null,
            classLabel: selected.classLabel,
            ecosystem: selected.actions[0]?.ecosystem ?? selected.campaigns[0]?.ecosystem ?? null,
            network: selected.actions[0]?.network ?? selected.campaigns[0]?.network ?? null,
            summary: selected.actions[0]?.description ?? null,
            sourceUrl: selected.actions[0]?.sourceUrl ?? null,
          }}
          actions={toSheetActions(
            intent ? selected.actions.filter((a) => a.intent === intent) : selected.actions,
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
