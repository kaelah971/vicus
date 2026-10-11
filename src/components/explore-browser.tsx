"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleCard, EmptyState, Icon } from "@/components/vicus";
import type { Circle } from "@/lib/vicus-data";

const ALL_ECOSYSTEMS = "all";

/**
 * The URL (?ecosystem=) is the source of truth for the ecosystem dimension:
 * sidebar links, back/forward, and the dropdown all read and write it, so a
 * client-side navigation can never leave stale results from another chain on
 * screen. Search/category/status remain local field state.
 */
export function ExploreBrowser({ circles }: { circles: Circle[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [state, setState] = useState("All statuses");

  const ecosystemOptions = useMemo(
    () =>
      Array.from(
        new Map(
          circles.map((circle) => [
            circle.ecosystem ?? circle.network,
            circle.ecosystemLabel ?? circle.ecosystem ?? circle.network,
          ]),
        ),
      ).map(([value, label]) => ({ value, label })),
    [circles],
  );
  const ecosystemValues = useMemo(
    () => new Set(ecosystemOptions.map((option) => option.value)),
    [ecosystemOptions],
  );
  const requestedEcosystem = (searchParams.get("ecosystem") ?? "").trim().toLowerCase();
  const ecosystem = ecosystemValues.has(requestedEcosystem) ? requestedEcosystem : ALL_ECOSYSTEMS;

  function handleEcosystemChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_ECOSYSTEMS) {
      params.delete("ecosystem");
    } else {
      params.set("ecosystem", value);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }
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
      const matchesEcosystem =
        ecosystem === ALL_ECOSYSTEMS || (circle.ecosystem ?? circle.network) === ecosystem;
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
          <select aria-label="Filter by ecosystem" onChange={(event) => handleEcosystemChange(event.target.value)} value={ecosystem}>
            <option value={ALL_ECOSYSTEMS}>All ecosystems</option>
            {ecosystemOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
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
