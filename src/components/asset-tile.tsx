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
  /** Raw registry category (treasury_fund, equity_fund, stablecoin, …). */
  category?: string | null;
  ecosystem?: string | null;
  ecosystemLabel?: string | null;
  network?: string | null;
  actionLabels?: string[];
};

export type TileVariant = "equity" | "fund" | "stable" | "other";

const VARIANT_META: Record<TileVariant, { label: string; tone: string }> = {
  equity: { label: "Equity", tone: "orange" },
  fund: { label: "Fund", tone: "violet" },
  stable: { label: "Stable", tone: "green" },
  other: { label: "Asset", tone: "white" },
};

/** Category variant drives the card accent — never issuer identity. */
export function tileVariantFor(category: string | null | undefined): TileVariant {
  const normalized = (category ?? "").toLowerCase();
  if (normalized.includes("equity")) return "equity";
  if (normalized.includes("treasury") || normalized.includes("fixed_income") || normalized.includes("fixed income")) return "fund";
  if (normalized.includes("stable")) return "stable";
  return "other";
}

/**
 * Premium compact tile: modest brand stage, then ticker + category chip,
 * one issuer · network line (name shown only when it adds information),
 * max 2–3 tiny action labels. No paragraphs, no source-review, no KYC
 * copy — that lives in the sheet.
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
  const variant = tileVariantFor(asset.category ?? asset.classLabel);
  const meta = VARIANT_META[variant];
  const displayName = shortAssetName(asset.name, asset.code);
  const showName = displayName.toUpperCase() !== asset.code.toUpperCase();

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
        <span className="v-tile-top">
          <strong>{asset.code}</strong>
          <span className={`v-chip tone-${meta.tone} v-tile-var`}>{meta.label}</span>
        </span>
        {showName ? <span className="v-tile-name">{displayName}</span> : null}
        <small className="v-tile-sub">
          {[issuerShort, eco.label].filter(Boolean).join(" · ")}
        </small>
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

  const tileProps = {
    className: "v-tile",
    "aria-label": `Preview ${asset.code}${showName ? ` ${displayName}` : ""}`,
    "data-asset": asset.slug,
    "data-variant": variant,
  };

  if (onSelect) {
    return (
      <button type="button" {...tileProps} onClick={() => onSelect(asset.slug)}>
        {body}
      </button>
    );
  }

  return (
    <Link {...tileProps} href={href}>
      {body}
    </Link>
  );
}
