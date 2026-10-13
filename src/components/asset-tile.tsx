"use client";

import Link from "next/link";
import { fallbackMark, getAssetVisual, shortAssetName } from "@/lib/asset-visuals";
import { ecosystemMeta } from "@/components/vicus-ui";

export type TileAsset = {
  slug: string;
  code: string;
  name: string;
  issuer?: string | null;
  classLabel?: string | null;
  ecosystem?: string | null;
  ecosystemLabel?: string | null;
  network?: string | null;
  actionLabels?: string[];
};

/**
 * Compact visual tile: large official logo stage first, then ticker,
 * short name, issuer, chain, max 2–3 tiny action labels.
 * No paragraphs, no source-review, no KYC copy — that lives in the sheet.
 */
export function AssetTile({
  asset,
  href,
  onSelect,
}: {
  asset: TileAsset;
  /** Full-detail href (used for share/SEO); sheet opens on tap instead. */
  href: string;
  onSelect?: (slug: string) => void;
}) {
  const visual = getAssetVisual(asset.slug);
  const eco = ecosystemMeta(asset.ecosystem ?? asset.network, asset.ecosystemLabel);
  const issuerShort = visual?.issuerShort ?? asset.issuer ?? null;
  const labels = (asset.actionLabels ?? []).slice(0, 3);
  const stage = visual?.stage ?? "light";

  const body = (
    <>
      <span className={`v-tile-visual v-tile-stage-${stage}`} aria-hidden="true" data-brand={visual?.localSrc ? asset.slug : undefined}>
        {visual?.localSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visual.localSrc} alt="" className="v-tile-logo" loading="lazy" />
        ) : (
          <span className="v-tile-mark">{fallbackMark(asset.code)}</span>
        )}
      </span>
      <span className="v-tile-body">
        <strong>{asset.code}</strong>
        <span className="v-tile-name">{shortAssetName(asset.name, asset.code)}</span>
        {issuerShort ? <small className="v-tile-sub">{issuerShort}</small> : null}
        <small className="v-tile-chain">{eco.label}</small>
      </span>
      {labels.length > 0 ? (
        <span className="v-tile-acts" aria-label="Available actions">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </span>
      ) : null}
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className="v-tile"
        onClick={() => onSelect(asset.slug)}
        aria-label={`Preview ${asset.code} ${shortAssetName(asset.name, asset.code)}`}
        data-asset={asset.slug}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      className="v-tile"
      href={href}
      aria-label={`Preview ${asset.code} ${shortAssetName(asset.name, asset.code)}`}
      data-asset={asset.slug}
    >
      {body}
    </Link>
  );
}
