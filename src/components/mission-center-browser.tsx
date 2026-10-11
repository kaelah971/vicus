"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataState, EmptyState, Eyebrow, Icon, MissionCard } from "@/components/vicus";
import type { MissionRecord } from "@/lib/data/types";
import type { MissionIndexCircle } from "@/lib/data/missions";

export type CenterMission = MissionRecord & { circle: MissionIndexCircle };

const ALL = "all";

const typeOptions = [
  { value: "quiz", label: "Quiz" },
  { value: "text", label: "Written contribution" },
  { value: "research", label: "Research" },
];

/**
 * Mission Center filters are URL-driven (?ecosystem=, ?type=) so links, the
 * filter bars, and rendered missions always agree and back/forward works.
 * Only real domain mission types are offered; asset ecosystem and Stellar
 * reward settlement stay visibly distinct on every card.
 */
export function MissionCenterBrowser({ missions }: { missions: CenterMission[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ecosystemOptions = useMemo(
    () =>
      Array.from(
        new Map(missions.map((mission) => [mission.circle.ecosystem, mission.circle.ecosystemLabel])).entries(),
      ).map(([value, label]) => ({ value, label })),
    [missions],
  );
  const ecosystemValues = useMemo(
    () => new Set(ecosystemOptions.map((option) => option.value)),
    [ecosystemOptions],
  );
  const requestedEcosystem = (searchParams.get("ecosystem") ?? "").trim().toLowerCase();
  const ecosystem = ecosystemValues.has(requestedEcosystem) ? requestedEcosystem : ALL;
  const requestedType = (searchParams.get("type") ?? "").trim().toLowerCase();
  const missionType = typeOptions.some((option) => option.value === requestedType) ? requestedType : ALL;

  function handleParamChange(key: "ecosystem" | "type", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  const filtered = missions.filter(
    (mission) =>
      (ecosystem === ALL || mission.circle.ecosystem === ecosystem) &&
      (missionType === ALL || mission.type === missionType),
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, CenterMission[]>();
    for (const mission of filtered) {
      const list = groups.get(mission.type) ?? [];
      list.push(mission);
      groups.set(mission.type, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  function typeLabel(type: string) {
    return typeOptions.find((option) => option.value === type)?.label ?? type;
  }

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filter missions">
        <label className="select-field">
          <span className="sr-only">Filter by ecosystem</span>
          <select aria-label="Filter by ecosystem" onChange={(event) => handleParamChange("ecosystem", event.target.value)} value={ecosystem}>
            <option value={ALL}>All ecosystems</option>
            {ecosystemOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <label className="select-field">
          <span className="sr-only">Filter by mission type</span>
          <select aria-label="Filter by mission type" onChange={(event) => handleParamChange("type", event.target.value)} value={missionType}>
            <option value={ALL}>All mission types</option>
            {typeOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <span className="directory-count">{filtered.length} of {missions.length} missions</span>
      </div>

      {filtered.length === 0 ? (
        <section className="directory-section">
          <EmptyState title="No missions match these filters">
            Try a different ecosystem or mission type. Draft missions stay in Campaign Studio and are never listed here.
          </EmptyState>
        </section>
      ) : (
        grouped.map(([type, items]) => (
          <section aria-labelledby={`mission-group-${type}`} className="mission-center-section" key={type}>
            <div className="section-heading">
              <div>
                <Eyebrow>{typeLabel(type)}</Eyebrow>
                <h2 id={`mission-group-${type}`}>
                  {type === "quiz" ? "Learn with a quiz." : type === "research" ? "Research with sources." : "Contribute in writing."}
                </h2>
              </div>
              <span className="directory-count">{items.length} database-backed missions</span>
            </div>
            <div className="mission-grid">
              {items.map((mission) => (
                <div className="mission-index-card" key={mission.id}>
                  <div className="mission-index-context">
                    <Link href={`/circles/${mission.circle.slug}`}>{mission.circle.name}</Link>
                    <span>{mission.circle.ecosystemLabel} · {mission.reward}</span>
                  </div>
                  <MissionCard mission={mission} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {filtered.length > 0 ? (
        <DataState title="About rewards">
          Points are offchain Vicus records. Where a mission shows an XLM amount, settlement happens on Stellar — the asset ecosystem and the reward network are separate things.
        </DataState>
      ) : null}
    </>
  );
}
