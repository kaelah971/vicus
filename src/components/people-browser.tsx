"use client";

import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, Icon, plural } from "@/components/vicus";
import { PersonCard } from "@/components/person-card";
import type { PersonCard as PersonCardData } from "@/lib/social/service";

const ALL = "all";

export type PeopleCircleOption = {
  id: string;
  slug: string;
  name: string;
  ecosystem: string;
  ecosystemLabel: string;
};

function PeopleBrowser({
  people,
  circles,
  ecosystems,
}: {
  people: PersonCardData[];
  circles: PeopleCircleOption[];
  ecosystems: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedEcosystem = (searchParams.get("ecosystem") ?? "").trim().toLowerCase();
  const ecosystemValues = useMemo(() => new Set(ecosystems.map((option) => option.value)), [ecosystems]);
  const ecosystem = ecosystemValues.has(requestedEcosystem) ? requestedEcosystem : ALL;

  const requestedCircle = (searchParams.get("circle") ?? "").trim();
  const circleIds = useMemo(() => new Set(circles.map((circle) => circle.id)), [circles]);
  const circle = circleIds.has(requestedCircle) ? requestedCircle : ALL;

  const sort = searchParams.get("sort") === "points" ? "points" : "recent";

  function handleParamChange(key: string, value: string, removeWhen: string[] = [ALL, ""]) {
    const params = new URLSearchParams(searchParams.toString());
    if (removeWhen.includes(value)) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  const visibleCircles = ecosystem === ALL ? circles : circles.filter((option) => option.ecosystem === ecosystem);

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filter people">
        <label className="select-field">
          <span className="sr-only">Filter by ecosystem</span>
          <select
            aria-label="Filter by ecosystem"
            onChange={(event) => {
              handleParamChange("ecosystem", event.target.value);
              handleParamChange("circle", ALL);
            }}
            value={ecosystem}
          >
            <option value={ALL}>All ecosystems</option>
            {ecosystems.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <label className="select-field">
          <span className="sr-only">Filter by circle</span>
          <select aria-label="Filter by circle" onChange={(event) => handleParamChange("circle", event.target.value)} value={circle}>
            <option value={ALL}>All circles</option>
            {visibleCircles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <label className="search-field">
          <span className="sr-only">Filter by interest</span>
          <Icon name="search" size={17} />
          <input
            aria-label="Filter by interest"
            onChange={(event) => handleParamChange("interest", event.target.value)}
            placeholder="Interest, e.g. base"
            type="search"
            value={searchParams.get("interest") ?? ""}
          />
        </label>
        <label className="select-field">
          <span className="sr-only">Sort people</span>
          <select aria-label="Sort people" onChange={(event) => handleParamChange("sort", event.target.value, [])} value={sort}>
            <option value="recent">Most recent</option>
            <option value="points">Most points</option>
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <span className="directory-count">
          {plural(people.length, "contributor")}
        </span>
      </div>

      {people.length > 0 ? (
        <div className="mission-grid">
          {people.map((person) => (
            <PersonCard key={person.user.id} person={person} />
          ))}
        </div>
      ) : (
        <section className="directory-section">
          <EmptyState title="No contributors match these filters">
            Try a different ecosystem, circle, or interest. Only approved public contributions are listed.
          </EmptyState>
        </section>
      )}
    </>
  );
}

export function PeopleBrowserSuspense(props: {
  people: PersonCardData[];
  circles: PeopleCircleOption[];
  ecosystems: Array<{ value: string; label: string }>;
}) {
  return (
    <Suspense>
      <PeopleBrowser {...props} />
    </Suspense>
  );
}
