"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, MissionCard, plural } from "@/components/vicus";
import { Glyph, ecosystemMeta, missionTypeMeta } from "@/components/vicus-ui";
import type { MissionRecord } from "@/lib/data/types";
import type { MissionIndexCircle } from "@/lib/data/missions";

export type CenterMission = MissionRecord & { circle: MissionIndexCircle };

const ALL = "all";

const typeOptions = [
  { value: "quiz", label: "Learn" },
  { value: "onchain_action", label: "Use" },
  { value: "text", label: "Contribute" },
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
  const presentTypes = useMemo(() => new Set(missions.map((mission) => mission.type)), [missions]);
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

  return (
    <>
      <div className="m-filters" role="group" aria-label="Filter missions">
        <div aria-label="Filter by mission type" className="x-pills" role="group">
          <button aria-pressed={missionType === ALL} onClick={() => handleParamChange("type", ALL)} type="button">
            All
          </button>
          {typeOptions
            .filter((option) => presentTypes.has(option.value))
            .map((option) => {
              const meta = missionTypeMeta(option.value);
              return (
                <button
                  aria-pressed={missionType === option.value}
                  className={`tone-${meta.tone}`}
                  key={option.value}
                  onClick={() => handleParamChange("type", option.value)}
                  type="button"
                >
                  <Glyph name={meta.icon} size={14} />
                  {option.label}
                </button>
              );
            })}
        </div>
        <div aria-label="Filter by ecosystem" className="x-pills" role="group">
          <button aria-pressed={ecosystem === ALL} onClick={() => handleParamChange("ecosystem", ALL)} type="button">
            All ecosystems
          </button>
          {ecosystemOptions.map((item) => (
            <button
              aria-pressed={ecosystem === item.value}
              className={`tone-${ecosystemMeta(item.value).tone}`}
              key={item.value}
              onClick={() => handleParamChange("ecosystem", item.value)}
              type="button"
            >
              <span aria-hidden="true" className="v-chip-dot" />
              {item.label}
            </button>
          ))}
        </div>
        <span className="directory-count">{plural(filtered.length, "mission")} of {missions.length}</span>
      </div>

      {filtered.length === 0 ? (
        <section className="directory-section">
          <EmptyState title="No missions match these filters">
            Try a different ecosystem or mission type.
          </EmptyState>
        </section>
      ) : (
        <div className="mission-grid m-grid">
          {filtered.map((mission) => (
            <MissionCard circle={mission.circle} key={mission.id} mission={mission} />
          ))}
        </div>
      )}
    </>
  );
}
