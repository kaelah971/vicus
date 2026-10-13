/** Client-safe asset grouping for utility discovery (no server imports). */

export type GroupableOpportunity = {
  id: string;
  assetSlug: string;
  assetCode: string;
  assetName: string;
  assetClassLabel: string;
  issuer: string;
  network: string;
  kind: string;
  held: boolean;
};

export type AssetGroup<T extends GroupableOpportunity = GroupableOpportunity> = {
  slug: string;
  code: string;
  name: string;
  classLabel: string;
  issuer: string;
  network: string;
  held: boolean;
  actions: T[];
  campaigns: T[];
};

/** One card per asset: engine actions plus embedded campaign rewards. */
export function groupByAsset<T extends GroupableOpportunity>(items: T[]): AssetGroup<T>[] {
  const map = new Map<string, AssetGroup<T>>();
  for (const item of items) {
    let group = map.get(item.assetSlug);
    if (!group) {
      group = {
        slug: item.assetSlug,
        code: item.assetCode,
        name: item.assetName,
        classLabel: item.assetClassLabel,
        issuer: item.issuer,
        network: item.network,
        held: false,
        actions: [],
        campaigns: [],
      };
      map.set(item.assetSlug, group);
    }
    group.held = group.held || item.held;
    if (item.kind === "campaign-reward") group.campaigns.push(item);
    else group.actions.push(item);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}
