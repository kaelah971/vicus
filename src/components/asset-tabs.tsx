"use client";

import { useEffect, useState, type ReactNode } from "react";

export type AssetTabPanel = {
  id: "overview" | "actions" | "circle" | "details";
  label: string;
  node: ReactNode;
};

/** Map legacy deep-link hashes onto the new four tabs. */
function tabForHash(hash: string): AssetTabPanel["id"] | null {
  switch (hash) {
    case "use":
      return "actions";
    case "campaigns":
    case "missions":
    case "community":
    case "conviction":
    case "people":
    case "activity":
      return "circle";
    case "passport":
    case "sources":
    case "lifecycle":
    case "details":
      return "details";
    case "overview":
      return "overview";
    default:
      return null;
  }
}

/**
 * Segmented mobile sections for an asset page. All panels stay mounted
 * (deep links keep working); only the active one is shown.
 */
export function AssetTabs({ panels }: { panels: AssetTabPanel[] }) {
  const [active, setActive] = useState<AssetTabPanel["id"]>(() => {
    if (typeof window === "undefined") return "overview";
    const tab = tabForHash(window.location.hash.replace("#", ""));
    return tab && panels.some((panel) => panel.id === tab) ? tab : "overview";
  });

  useEffect(() => {
    const onHashChange = () => {
      const tab = tabForHash(window.location.hash.replace("#", ""));
      if (tab) setActive(tab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="a-tabs">
      <div className="a-tabbar" role="tablist" aria-label="Asset sections">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={active === panel.id}
            className={active === panel.id ? "is-active" : undefined}
            onClick={() => setActive(panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {panels.map((panel) => (
        <div
          key={panel.id}
          role="tabpanel"
          hidden={active !== panel.id}
          className="a-tabpanel"
        >
          {panel.node}
        </div>
      ))}
    </div>
  );
}
