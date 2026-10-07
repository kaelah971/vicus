"use client";

import { useMemo, useState } from "react";
import { CircleCard, EmptyState, Icon } from "@/components/vicus";
import type { Circle } from "@/lib/vicus-data";

export function ExploreBrowser({
  circles,
  initialEcosystem = null,
}: {
  circles: Circle[];
  initialEcosystem?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [ecosystem, setEcosystem] = useState(initialEcosystem ?? "All ecosystems");
  const [category, setCategory] = useState("All categories");
  const [state, setState] = useState("All statuses");

  const ecosystems = useMemo(
    () => Array.from(new Set(circles.map((circle) => circle.ecosystemLabel ?? circle.ecosystem ?? circle.network))),
    [circles],
  );
  const categories = useMemo(
    () => Array.from(new Set(circles.map((circle) => circle.category))),
    [circles],
  );
  const states = useMemo(
    () => Array.from(new Set(circles.map((circle) => circle.stateLabel))),
    [circles],
  );
  const filteredCircles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return circles.filter((circle) => {
      const matchesQuery = normalizedQuery
        ? [circle.name, circle.code, circle.category, circle.summary]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true;
      const matchesEcosystem = ecosystem === "All ecosystems" || (circle.ecosystemLabel ?? circle.ecosystem ?? circle.network) === ecosystem;
      const matchesCategory = category === "All categories" || circle.category === category;
      const matchesState = state === "All statuses" || circle.stateLabel === state;

      return matchesQuery && matchesEcosystem && matchesCategory && matchesState;
    });
  }, [category, circles, ecosystem, query, state]);

  return (
    <section aria-labelledby="circle-directory-title" className="directory-section" id="circle-directory">
      <div className="directory-toolbar">
        <div>
          <span className="field-label" id="circle-directory-title">
            Circle directory
          </span>
          <p>Content is loaded from the Vicus database. Source review is still required before any entry can be treated as official.</p>
        </div>
        <span className="directory-count">{filteredCircles.length} of {circles.length} entries</span>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <span className="sr-only">Search circles</span>
          <Icon name="search" size={17} />
          <input
            aria-label="Search circles"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets or circles"
            type="search"
            value={query}
          />
        </label>
        <label className="select-field">
          <span className="sr-only">Filter by ecosystem</span>
          <select aria-label="Filter by ecosystem" onChange={(event) => setEcosystem(event.target.value)} value={ecosystem}>
            <option>All ecosystems</option>
            {ecosystems.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <label className="select-field">
          <span className="sr-only">Filter by category</span>
          <select aria-label="Filter by category" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option>All categories</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <label className="select-field">
          <span className="sr-only">Filter by status</span>
          <select aria-label="Filter by status" onChange={(event) => setState(event.target.value)} value={state}>
            <option>All statuses</option>
            {states.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
      </div>

      {filteredCircles.length > 0 ? (
        <div className="circle-grid">
          {filteredCircles.map((circle) => (
            <CircleCard circle={circle} key={circle.slug} />
          ))}
        </div>
      ) : (
        <EmptyState title="No matching circles">
          Try a different search or clear one of the filters. The database returned no matching circle.
        </EmptyState>
      )}
    </section>
  );
}
