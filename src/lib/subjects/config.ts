import "server-only";

/**
 * Subjects + issuers V1 — the layer above individual tokens. Config-only
 * read model: membership always resolves live from the asset registry, so
 * nothing here can drift from source truth. No migration, no new tables.
 */

export type SubjectType = "company" | "issuer" | "fund-family" | "asset-family";

export type SubjectDef = {
  slug: string;
  type: SubjectType;
  name: string;
  /** Short neutral description — never a financial claim. */
  description: string;
  /** Exact member slugs; resolved against the live registry (missing = skipped). */
  representations: string[];
  sourceUrl: string;
};

export const SUBJECTS: readonly SubjectDef[] = [
  {
    slug: "apple",
    type: "company",
    name: "Apple",
    description:
      "Apple exposure exists onchain through multiple distinct products. These representations are not interchangeable: different issuers, networks, contracts, access paths, and restrictions.",
    representations: ["aaplx-on-solana", "aaplc-on-base"],
    sourceUrl: "https://www.base.org/stocks",
  },
  {
    slug: "franklin-templeton",
    type: "issuer",
    name: "Franklin Templeton",
    description: "Issuer of the BENJI tokenized money fund on Stellar.",
    representations: ["benji-on-stellar"],
    sourceUrl:
      "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX",
  },
  {
    slug: "wisdomtree",
    type: "issuer",
    name: "WisdomTree",
    description: "Issuer of tokenized funds on Stellar through WisdomTree Prime.",
    representations: ["wtgxx-on-stellar", "wtsyx-on-stellar", "tipsx-on-stellar", "spxux-on-stellar", "techx-on-stellar"],
    sourceUrl: "https://www.wisdomtree.com/onchain/tokenized-funds",
  },
];

export function getSubjectDef(slug: string): SubjectDef | null {
  return SUBJECTS.find((subject) => subject.slug === slug) ?? null;
}

export function getSubjectForAsset(assetSlug: string): SubjectDef | null {
  return SUBJECTS.find((subject) => subject.representations.includes(assetSlug)) ?? null;
}
