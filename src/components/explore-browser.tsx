"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleCard, EmptyState, Icon } from "@/components/vicus";
import { Orb, assetClassMeta, ecosystemMeta } from "@/components/vicus-ui";
import type { Circle } from "@/lib/vicus-data";
import { matchesCircleFilters } from "@/lib/data/circles";

const ALL_ECOSYSTEMS = "all";
const ALL_CLASSES = "all";

const ASSET_CLASS_ORDER = [
  "stablecoin",
  "treasury_fund",
  "equity_fund",
  "fixed_income",
  "commodity",
  "private_credit",
  "alternative",
  "real_estate",
  "other_financial",
] as const;

const ASSET_CLASS_FILTER_LABELS: Record<string, string> = {
  stablecoin: "Stablecoins",
  treasury_fund: "Treasuries & Funds",
  equity_fund: "Equities",
  fixed_income: "Fixed Income",
  commodity: "Commodities",
  private_credit: "Private Credit",
  alternative: "Alternatives",
  real_estate: "Real Estate",
  other_financial: "Other",
};

/**
 * The URL (?ecosystem=, ?class=) is the source of truth for both filter
 * dimensions: sidebar links, back/forward, and the dropdowns all read and
 * write it, so a client-side navigation can never leave stale results from
 * another chain or class on screen. Search/status remain local field state.
 */
export function ExploreBrowser({
  circles,
  useCounts = {},
}: {
  circles: Circle[];
  useCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
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

  function updateParams(key: string, value: string, allValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === allValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  function handleEcosystemChange(value: string) {
    updateParams("ecosystem", value, ALL_ECOSYSTEMS);
  }

  function handleAssetClassChange(value: string) {
    updateParams("class", value, ALL_CLASSES);
  }

  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const circle of circles) counts.set(circle.category, (counts.get(circle.category) ?? 0) + 1);
    return counts;
  }, [circles]);
  const classOptions = useMemo(
    () =>
      ASSET_CLASS_ORDER.filter((value) => classCounts.has(value)).map((value: string) => ({
        value,
        label: ASSET_CLASS_FILTER_LABELS[value] ?? value,
      })),
    [classCounts],
  );
  const classValues = useMemo(() => new Set(classOptions.map((option) => option.value)), [classOptions]);
  const requestedClass = (searchParams.get("class") ?? "").trim().toLowerCase();
  const assetClass = classValues.has(requestedClass) ? requestedClass : ALL_CLASSES;

  const states = useMemo(
    () => Array.from(new Set(circles.map((circle) => circle.stateLabel))),
    [circles],
  );
  const filteredCircles = useMemo(() => {
    const filters = { assetClass, ecosystem, query, state };
    return circles.filter((circle) => matchesCircleFilters(circle, filters));
  }, [assetClass, circles, ecosystem, query, state]);

  const [lead, ...others] = filteredCircles;
  const side = others.slice(0, 2);
  const rest = others.slice(2);

  return (
    <section aria-labelledby="circle-directory-title" className="x-browser" id="circle-directory">
      <h2 className="sr-only" id="circle-directory-title">
        Asset directory
      </h2>
      <div className="x-filters">
        <label className="search-field">
          <span className="sr-only">Search circles</span>
          <Icon name="search" size={17} />
          <input
            aria-label="Search circles"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            type="search"
            value={query}
          />
        </label>
        <div aria-label="Filter by ecosystem" className="x-pills" role="group">
          <button aria-pressed={ecosystem === ALL_ECOSYSTEMS} onClick={() => handleEcosystemChange(ALL_ECOSYSTEMS)} type="button">
            All
          </button>
          {ecosystemOptions.map((item) => (
            <button
              aria-pressed={ecosystem === item.value}
              className={`tone-${ecosystemMeta(item.value).tone}`}
              key={item.value}
              onClick={() => handleEcosystemChange(item.value)}
              type="button"
            >
              <span aria-hidden="true" className="v-chip-dot" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-label="Filter by asset class" className="x-class-rail" role="group">
        {ASSET_CLASS_ORDER.map((value) => {
          const meta = assetClassMeta(value);
          const count = classCounts.get(value) ?? 0;
          const active = assetClass === value;
          return (
            <button
              aria-pressed={active}
              className={`x-class tone-${meta.tone}`}
              disabled={count === 0 && !active}
              key={value}
              onClick={() => handleAssetClassChange(active ? ALL_CLASSES : value)}
              type="button"
            >
              <Orb icon={meta.icon} size="sm" tone={meta.tone} />
              <span>
                <strong>{ASSET_CLASS_FILTER_LABELS[value]}</strong>
                <small>{count > 0 ? count : "None yet"}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="x-result-bar">
        <span className="directory-count">
          {filteredCircles.length} of {circles.length} assets
          {assetClass !== ALL_CLASSES ? ` · ${classOptions.find((item) => item.value === assetClass)?.label ?? ""}` : ""}
        </span>
        <label className="select-field select-field-compact">
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

      {lead ? (
        <>
          <div className={`x-featured${side.length === 0 ? " x-featured-solo" : ""}`}>
            <CircleCard circle={lead} useCount={useCounts[lead.slug] ?? 0} variant="feature" />
            {side.length > 0 ? (
              <div className="x-featured-side">
                {side.map((circle) => (
                  <CircleCard circle={circle} key={circle.slug} useCount={useCounts[circle.slug] ?? 0} />
                ))}
              </div>
            ) : null}
          </div>
          {rest.length > 0 ? (
            <div className="x-more">
              <div className="x-block-head">
                <h2>More assets</h2>
                <span>{rest.length}</span>
              </div>
              <div className="x-rail">
                {rest.map((circle) => (
                  <CircleCard circle={circle} key={circle.slug} useCount={useCounts[circle.slug] ?? 0} variant="compact" />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState title="No matching assets">
          Try a different search or clear one of the filters.
        </EmptyState>
      )}
    </section>
  );
}
