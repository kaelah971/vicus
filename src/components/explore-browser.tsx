"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, Icon } from "@/components/vicus";
import { ecosystemMeta } from "@/components/vicus-ui";
import { AssetTile } from "@/components/asset-tile";
import { AssetSheet, type SheetAction, type SheetSubject } from "@/components/asset-sheet";
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
const CATEGORY_SHORTCUTS = [
  { value: ALL_CLASSES, label: "All" },
  { value: "treasury_fund", label: "Funds" },
  { value: "fixed_income", label: "Treasury" },
  { value: "equity_fund", label: "Equity" },
  { value: "stablecoin", label: "Stable" },
] as const;

/**
 * The URL (?ecosystem=, ?class=) is the source of truth for both filter
 * dimensions: sidebar links, back/forward, and the dropdowns all read and
 * write it, so a client-side navigation can never leave stale results from
 * another chain or class on screen. Search/status remain local field state.
 * `?asset=` opens the preview sheet over the grid; Back closes it.
 */
export function ExploreBrowser({
  circles,
  usableSlugs = [],
  campaignSlugs = [],
  actionsBySlug = {},
  subjectMap = {},
}: {
  circles: Circle[];
  usableSlugs?: string[];
  campaignSlugs?: string[];
  actionsBySlug?: Record<string, SheetAction[]>;
  subjectMap?: Record<string, SheetSubject>;
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

  const requestedClass = (searchParams.get("class") ?? "").trim().toLowerCase();
  const knownClasses = useMemo(
    () => new Set<string>([...CATEGORY_SHORTCUTS.map((entry) => entry.value), ...ASSET_CLASS_ORDER]),
    [],
  );
  const assetClass = requestedClass && knownClasses.has(requestedClass) ? requestedClass : ALL_CLASSES;

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

  const selectedSlug = (searchParams.get("asset") ?? "").trim();
  const selected = selectedSlug ? bySlug.get(selectedSlug) ?? circles.find((c) => c.slug === selectedSlug) ?? null : null;

  const renderTiles = (items: Circle[]) => (
    <div className="v-tiles">
      {items.map((circle) => (
        <AssetTile
          key={circle.slug}
          asset={{
            slug: circle.slug,
            code: circle.code,
            name: circle.name,
            issuer: (circle as { issuerSource?: string }).issuerSource ?? null,
            classLabel: circle.assetClassLabel ?? circle.category,
            ecosystem: circle.ecosystem ?? circle.network,
            ecosystemLabel: circle.ecosystemLabel,
            network: circle.network,
          }}
          href={`/circles/${circle.slug}`}
          onSelect={openAsset}
        />
      ))}
    </div>
  );

  return (
    <section aria-labelledby="circle-directory-title" className="x-browser" id="circle-directory">
      <h2 className="sr-only" id="circle-directory-title">
        Asset directory
      </h2>
      <div className="x-filters v-filter-tabs">
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
        <div aria-label="Browse by category" className="x-pills" role="group">
          {CATEGORY_SHORTCUTS.map((entry) => (
            <button
              aria-pressed={assetClass === entry.value}
              key={entry.value}
              onClick={() => handleAssetClassChange(entry.value)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
          <details className="x-filters-more">
            <summary>Filters</summary>
            <div className="x-filters-panel">
              <div aria-label="Filter by ecosystem" className="x-pills" role="group">
                <button aria-pressed={ecosystem === ALL_ECOSYSTEMS} onClick={() => handleEcosystemChange(ALL_ECOSYSTEMS)} type="button">
                  All chains
                </button>
                {ecosystemOptions.map((item) => (
                  <button
                    aria-pressed={ecosystem === item.value}
                    className={`tone-${ecosystemMeta(item.value).tone}`}
                    key={item.value}
                    onClick={() => handleEcosystemChange(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
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
          </details>
        </div>
      </div>

      {/* Stellar · home */}
      {stellarCircles.length > 0 ? (
        <section aria-label="Stellar home assets">
          <div className="x-block-head">
            <h2>Stellar</h2>
            <span>Tokenized assets, starting at home</span>
          </div>
          {renderTiles(stellarCircles)}
        </section>
      ) : null}
      {beyondCircles.length > 0 ? (
        <section aria-label="Assets beyond Stellar" className="x-beyond">
          <div className="x-block-head">
            <h2>Beyond Stellar</h2>
            <span>More across connected ecosystems</span>
          </div>
          {renderTiles(beyondCircles)}
        </section>
      ) : null}
      {stellarCircles.length === 0 && beyondCircles.length === 0 ? (
        <EmptyState title="No matching assets">
          Try a different search or clear one of the filters.
        </EmptyState>
      ) : null}

      {selected ? (
        <AssetSheet
          asset={{
            slug: selected.slug,
            code: selected.code,
            name: selected.name,
            issuer: (selected as { issuerSource?: string }).issuerSource ?? null,
            classLabel: selected.assetClassLabel ?? selected.category,
            ecosystem: selected.ecosystem ?? selected.network,
            ecosystemLabel: selected.ecosystemLabel,
            network: selected.network,
            summary: selected.summary,
            sourceUrl: selected.sourceUrl,
            sourceLabel: selected.sourceLabel,
          }}
          actions={actionsBySlug[selected.slug] ?? []}
          subject={subjectMap[selected.slug] ?? null}
          campaignActive={campaignedSet.has(selected.slug)}
          onClose={closeAsset}
          openHref={`/circles/${selected.slug}`}
          openLabel="Open full asset"
        />
      ) : null}
    </section>
  );
}
