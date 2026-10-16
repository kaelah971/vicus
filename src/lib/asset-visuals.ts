/**
 * Asset visuals — official brand imagery served from local files.
 *
 * Sourcing rule: every file under `public/assets/brands/` was fetched from
 * an official company/product/issuer domain (or its official CDN referenced
 * by that domain), or supplied directly by the Vicus owner (`*-owner.jpeg`
 * files from the owner asset pack). `officialSource` records the exact file
 * URL or the owner pack name; `sourcePage` records the official page that
 * references it. Random logo sites, image search, AI generation, and
 * trademark redraws are forbidden.
 *
 * Only BENJI remains ticker-fallback for a genuine reason: every official
 * Franklin Templeton endpoint returns Akamai Bot Manager 403 to automated
 * fetch. Its entry keeps `localSrc: null` with an `unavailableNote` — a
 * human with a real browser can drop the file in and set `localSrc`
 * without any other code change. Tesla was in the same position until the
 * owner supplied `tesla-owner.jpeg` directly.
 */

export type LogoStage = "light" | "dark";

export type AssetVisualEntry = {
  slug: string;
  /** Local approved file under /public, or null when genuinely unobtainable. */
  localSrc: string | null;
  /** Exact file URL the local copy was obtained from (or attempted). */
  officialSource: string;
  /** Official page referencing the asset, for human re-verification. */
  sourcePage: string;
  /** Short issuer identity shown under the ticker. */
  issuerShort: string;
  /** Backdrop tone the mark needs: white Apple mark → dark, dark marks → light. */
  stage: LogoStage;
  /** Set only when localSrc is null: why the official visual is missing. */
  unavailableNote?: string;
};

const APPLE_PAGE = "https://www.apple.com";
const TESLA_PAGE = "https://www.tesla.com";
const NVIDIA_PAGE = "https://www.nvidia.com/en-us/about-nvidia/logo-brand/";
const FRANKLIN_PAGE =
  "https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX";
const WISDOMTREE_PAGE = "https://www.wisdomtree.com";
const CIRCLE_PAGE = "https://www.circle.com/";
const PAYPAL_PAGE = "https://www.paypal.com/pyusd";
const ONDO_PAGE = "https://www.ondo.finance/";

const FRANKLIN_BLOCKED =
  "Franklin Templeton infrastructure returns Akamai 403 to automated fetch on every official endpoint tested (.com/.co.uk/.ca/.com.au/.de/.lu, franklinresources.com, templeton.com, benjiinvestments.com, ftidocuments.com); re-fetch with a real browser.";

export const ASSET_VISUALS: Record<string, AssetVisualEntry> = {
  "aaplx-on-solana": {
    slug: "aaplx-on-solana",
    localSrc: "/assets/brands/apple-owner.jpeg",
    officialSource: "Owner-supplied asset pack (vicus-owner-logo-assets.zip): apple-owner.jpeg",
    sourcePage: APPLE_PAGE,
    issuerShort: "Backed",
    stage: "light",
  },
  "aaplc-on-base": {
    slug: "aaplc-on-base",
    localSrc: "/assets/brands/apple-owner.jpeg",
    officialSource: "Owner-supplied asset pack (vicus-owner-logo-assets.zip): apple-owner.jpeg",
    sourcePage: APPLE_PAGE,
    issuerShort: "Coinbase",
    stage: "light",
  },
  "tslax-on-solana": {
    slug: "tslax-on-solana",
    localSrc: "/assets/brands/tesla-owner.jpeg",
    officialSource: "Owner-supplied asset pack (vicus-owner-logo-assets.zip): tesla-owner.jpeg",
    sourcePage: TESLA_PAGE,
    issuerShort: "Backed",
    stage: "light",
  },
  "nvdac-on-base": {
    slug: "nvdac-on-base",
    localSrc: "/assets/brands/nvidia-owner.jpeg",
    officialSource: "Owner-supplied asset pack (vicus-owner-logo-assets.zip): nvidia-owner.jpeg",
    sourcePage: NVIDIA_PAGE,
    issuerShort: "Coinbase",
    stage: "light",
  },
  "benji-on-stellar": {
    slug: "benji-on-stellar",
    localSrc: null,
    officialSource: "https://www.franklintempleton.com/favicon-32x32.png",
    sourcePage: FRANKLIN_PAGE,
    issuerShort: "Franklin Templeton",
    stage: "light",
    unavailableNote: FRANKLIN_BLOCKED,
  },
  "wtgxx-on-stellar": {
    slug: "wtgxx-on-stellar",
    localSrc: "/assets/brands/wisdomtree.png",
    officialSource: "https://www.wisdomtree.com/images/wisdomtree-logo.png",
    sourcePage: WISDOMTREE_PAGE,
    issuerShort: "WisdomTree",
    stage: "light",
  },
  "wtsyx-on-stellar": {
    slug: "wtsyx-on-stellar",
    localSrc: "/assets/brands/wisdomtree.png",
    officialSource: "https://www.wisdomtree.com/images/wisdomtree-logo.png",
    sourcePage: WISDOMTREE_PAGE,
    issuerShort: "WisdomTree",
    stage: "light",
  },
  "tipsx-on-stellar": {
    slug: "tipsx-on-stellar",
    localSrc: "/assets/brands/wisdomtree.png",
    officialSource: "https://www.wisdomtree.com/images/wisdomtree-logo.png",
    sourcePage: WISDOMTREE_PAGE,
    issuerShort: "WisdomTree",
    stage: "light",
  },
  "spxux-on-stellar": {
    slug: "spxux-on-stellar",
    localSrc: "/assets/brands/wisdomtree.png",
    officialSource: "https://www.wisdomtree.com/images/wisdomtree-logo.png",
    sourcePage: WISDOMTREE_PAGE,
    issuerShort: "WisdomTree",
    stage: "light",
  },
  "techx-on-stellar": {
    slug: "techx-on-stellar",
    localSrc: "/assets/brands/wisdomtree.png",
    officialSource: "https://www.wisdomtree.com/images/wisdomtree-logo.png",
    sourcePage: WISDOMTREE_PAGE,
    issuerShort: "WisdomTree",
    stage: "light",
  },
  "usdc-on-stellar": {
    slug: "usdc-on-stellar",
    localSrc: "/assets/brands/circle-usdc.svg",
    officialSource:
      "https://cdn.prod.website-files.com/668c08d1b8a9330bd1d786ad/669a20df8ac2810a6dd50e67_favicon-256.svg",
    sourcePage: CIRCLE_PAGE,
    issuerShort: "Circle",
    stage: "light",
  },
  "usdc-on-base": {
    slug: "usdc-on-base",
    localSrc: "/assets/brands/circle-usdc.svg",
    officialSource:
      "https://cdn.prod.website-files.com/668c08d1b8a9330bd1d786ad/669a20df8ac2810a6dd50e67_favicon-256.svg",
    sourcePage: CIRCLE_PAGE,
    issuerShort: "Circle",
    stage: "light",
  },
  "usdc-on-solana": {
    slug: "usdc-on-solana",
    localSrc: "/assets/brands/circle-usdc.svg",
    officialSource:
      "https://cdn.prod.website-files.com/668c08d1b8a9330bd1d786ad/669a20df8ac2810a6dd50e67_favicon-256.svg",
    sourcePage: CIRCLE_PAGE,
    issuerShort: "Circle",
    stage: "light",
  },
  "usdc-on-ethereum": {
    slug: "usdc-on-ethereum",
    localSrc: "/assets/brands/circle-usdc.svg",
    officialSource:
      "https://cdn.prod.website-files.com/668c08d1b8a9330bd1d786ad/669a20df8ac2810a6dd50e67_favicon-256.svg",
    sourcePage: CIRCLE_PAGE,
    issuerShort: "Circle",
    stage: "light",
  },
  "pyusd-on-stellar": {
    slug: "pyusd-on-stellar",
    localSrc: "/assets/brands/paypal-pyusd.svg",
    officialSource:
      "https://www.paypalobjects.com/marketing/web/logos/paypal-mark-color_new.svg",
    sourcePage: PAYPAL_PAGE,
    issuerShort: "PayPal",
    stage: "light",
  },
  "usdy-on-stellar": {
    slug: "usdy-on-stellar",
    localSrc: "/assets/brands/ondo-usdy.svg",
    officialSource: "https://ondo.finance/icon.svg",
    sourcePage: ONDO_PAGE,
    issuerShort: "Ondo",
    stage: "light",
  },
};

export function getAssetVisual(slug: string): AssetVisualEntry | null {
  return ASSET_VISUALS[slug] ?? null;
}

/** Slugs with a real local brand file (everything else is honest fallback). */
export function brandedSlugs(): string[] {
  return Object.values(ASSET_VISUALS)
    .filter((entry) => entry.localSrc !== null)
    .map((entry) => entry.slug);
}

/** Short display name without ecosystem suffix ("USDC on Stellar" → "USDC"). */
export function shortAssetName(name: string, code: string): string {
  const trimmed = name.replace(/\s+on\s+(Stellar|Solana|Base|Ethereum)\s*$/i, "").trim();
  if (trimmed.length === 0) return code;
  if (trimmed.toUpperCase() === code.toUpperCase()) return code;
  return trimmed;
}

/** Fallback monogram: first 2–4 ticker chars, never a trademark redraw. */
export function fallbackMark(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.slice(0, 4) || "•";
}
