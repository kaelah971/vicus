"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleCard, EmptyState, Icon } from "@/components/vicus";
import { Orb, assetClassMeta, ecosystemMeta } from "@/components/vicus-ui";
import type { Circle } from "@/lib/vicus-data";
import { buildDiscoveryGroups, matchesCircleFilters } from "@/lib/data/circles";

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
  usableSlugs = [],
  campaignSlugs = [],
  actionLabels = {},
}: {
  circles: Circle[];
  useCounts?: Record<string, number>;
  usableSlugs?: string[];
  campaignSlugs?: string[];
  actionLabels?: Record<string, string[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("All statuses");
  const [onlyUsable, setOnlyUsable] = useState(false);
  const [onlyCampaigned, setOnlyCampaigned] = useState(false);

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
  const usableSet = useMemo(() => new Set(usableSlugs), [usableSlugs]);
  const campaignedSet = useMemo(() => new Set(campaignSlugs), [campaignSlugs]);
  const filteredCircles = useMemo(() => {
    const filters = { assetClass, ecosystem, query, state };
    return circles.filter(
      (circle) =>
        matchesCircleFilters(circle, filters) &&
        (!onlyUsable || usableSet.has(circle.slug)) &&
        (!onlyCampaigned || campaignedSet.has(circle.slug)),
    );
  }, [assetClass, circles, ecosystem, query, state, onlyUsable, onlyCampaigned, usableSet, campaignedSet]);

  const groups = useMemo(
    () =>
      buildDiscoveryGroups({
        slugs: filteredCircles.map((circle) => circle.slug),
        categoryOf: (slug) => filteredCircles.find((circle) => circle.slug === slug)?.category ?? "",
        ecosystemOf: (slug) => filteredCircles.find((circle) => circle.slug === slug)?.ecosystem ?? "",
        usableSlugs: usableSet,
        campaignSlugs: campaignedSet,
      }),
    [filteredCircles, usableSet, campaignedSet],
  );
  const bySlug = useMemo(() => new Map(filteredCircles.map((circle) => [circle.slug, circle])), [filteredCircles]);
  const stellarCircles = groups.stellar.map((slug) => bySlug.get(slug)!).filter(Boolean);
  const beyondCircles = groups.beyond.map((slug) => bySlug.get(slug)!).filter(Boolean);

  const [lead, ...others] = stellarCircles;
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
          <Link className="button button-outline button-small" href="/use">Explore what you can do →</Link>
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
        <div className="x-toggles" role="group" aria-label="Availability filters">
          <button aria-pressed={onlyUsable} onClick={() => setOnlyUsable((value) => !value)} type="button">
            Can use now
          </button>
          <button aria-pressed={onlyCampaigned} onClick={() => setOnlyCampaigned((value) => !value)} type="button">
            Has campaign
          </button>
        </div>
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

      {groups.collections.length > 0 ? (
        <div aria-label="Browse by what you want" className="x-collections" role="group">
          {groups.collections.map((collection) => (
            <button
              key={collection.key}
              onClick={() => {
                if (collection.classValue) {
                  handleAssetClassChange(assetClass === collection.classValue ? ALL_CLASSES : collection.classValue);
                } else if (collection.key === "can-use") {
                  setOnlyUsable((value) => !value);
                } else if (collection.key === "campaigns") {
                  setOnlyCampaigned((value) => !value);
                }
              }}
              type="button"
            >
              <strong>{collection.label}</strong>
              <small>{collection.slugs.length}</small>
            </button>
          ))}
        </div>
      ) : null}

      {lead ? (
        <section aria-label="Stellar home assets">
          <div className="x-block-head">
            <h2>Stellar · home</h2>
            <span>Your home for tokenized assets</span>
          </div>
          <div className={`x-featured${side.length === 0 ? " x-featured-solo" : ""}`}>
            <CircleCard
              circle={lead}
              useCount={useCounts[lead.slug] ?? 0}
              variant="feature"
              issuer={(lead as { issuerSource?: string }).issuerSource}
              actionLabels={actionLabels[lead.slug]}
            />
            {side.length > 0 ? (
              <div className="x-featured-side">
                {side.map((circle) => (
                  <CircleCard
                    circle={circle}
                    key={circle.slug}
                    useCount={useCounts[circle.slug] ?? 0}
                    issuer={(circle as { issuerSource?: string }).issuerSource}
                    actionLabels={actionLabels[circle.slug]}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {rest.length > 0 ? (
            <div className="x-more">
              <div className="x-block-head">
                <h2>More on Stellar</h2>
                <span>{rest.length}</span>
              </div>
              <div className="x-rail">
                {rest.map((circle) => (
                  <CircleCard
                    circle={circle}
                    key={circle.slug}
                    useCount={useCounts[circle.slug] ?? 0}
                    variant="compact"
                    issuer={(circle as { issuerSource?: string }).issuerSource}
                    actionLabels={actionLabels[circle.slug]}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {beyondCircles.length > 0 ? (
        <section aria-label="Assets beyond Stellar">
          <div className="x-block-head">
            <h2>Beyond Stellar</h2>
            <span>Additional assets through connected ecosystems</span>
          </div>
          <div className="x-rail">
            {beyondCircles.map((circle) => (
              <CircleCard circle={circle} key={circle.slug} useCount={useCounts[circle.slug] ?? 0} variant="compact" />
            ))}
          </div>
        </section>
      ) : null}
      {!lead && beyondCircles.length === 0 ? (
        <EmptyState title="No matching assets">
          Try a different search or clear one of the filters.
        </EmptyState>
      ) : null}
    </section>
  );
}
