import { fallbackMark, getAssetVisual } from "@/lib/asset-visuals";

/**
 * BrandMark — official brand logo stage for an asset slug.
 *
 * Server-safe and isomorphic: resolves the curated local brand file from
 * `asset-visuals` (exact owner/issuer-supplied files only). When no brand
 * file exists the honest ticker monogram renders instead — never a
 * trademark redraw, never a substituted variant. Owner-supplied logo
 * drop-ins flow through automatically: adding the file plus a
 * `localSrc` entry is the only change needed.
 */
export function BrandMark({
  slug,
  code,
  label,
}: {
  slug: string;
  code: string;
  /** Accessible label for the logo, e.g. the asset name. */
  label?: string;
}) {
  const visual = getAssetVisual(slug);
  const stage = visual?.stage ?? "light";
  return (
    <span
      className={`bsk-brand bsk-stage-${stage}`}
      role="img"
      aria-label={label ?? `${code} logo`}
      data-brand={visual?.localSrc ? slug : undefined}
    >
      {visual?.localSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={visual.localSrc} alt="" loading="lazy" />
      ) : (
        <span className="bsk-brand-mark" aria-hidden="true">
          {fallbackMark(code)}
        </span>
      )}
    </span>
  );
}
