"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fallbackMark, getAssetVisual, shortAssetName } from "@/lib/asset-visuals";
import { Glyph, capabilityMeta, ecosystemMeta } from "@/components/vicus-ui";
import { PriceBlock } from "@/components/price-block";

export type SheetAction = {
  kind: string;
  title: string;
  description: string;
  state: string;
  stateLabel: string;
  href: string;
  external: boolean;
  eligibilityNote: string | null;
  sourceUrl?: string;
  eligibilityState?: "available" | "unavailable" | "unknown";
  eligibilityExplanation?: string | null;
  eligibilityNextStep?: { label: string; href: string } | null;
  eligibilityAlternative?: { title: string; href: string; why: string } | null;
};

export type SheetAsset = {
  slug: string;
  code: string;
  name: string;
  issuer?: string | null;
  classLabel?: string | null;
  ecosystem?: string | null;
  ecosystemLabel?: string | null;
  network?: string | null;
  summary?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
};

export type SheetSubject = {
  name: string;
  slug: string;
  type: string;
  siblingSlugs: string[];
} | null;

function ActionGlyph({ kind }: { kind: string }) {
  const meta = capabilityMeta(kind);
  return <Glyph name={meta.icon} size={18} />;
}

/**
 * Responsive preview sheet: bottom sheet on mobile (~two-thirds viewport),
 * centered dialog on desktop. Route-aware — the parent owns `?asset=`
 * state, so browser Back closes the sheet and refresh stays meaningful.
 */
export function AssetSheet({
  asset,
  actions,
  subject,
  campaignActive,
  representationNote,
  onClose,
  openHref,
  openLabel,
}: {
  asset: SheetAsset;
  actions: SheetAction[];
  subject: SheetSubject;
  campaignActive: boolean;
  representationNote?: string | null;
  onClose: () => void;
  openHref: string;
  openLabel: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const visual = getAssetVisual(asset.slug);
  const eco = ecosystemMeta(asset.ecosystem ?? asset.network, asset.ecosystemLabel);
  const stage = visual?.stage ?? "light";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const about = (asset.summary ?? "").trim();
  const shortAbout = about.length > 220 ? `${about.slice(0, 217).trimEnd()}…` : about;

  return (
    <div className="v-sheet-root" data-asset-sheet={asset.slug}>
      <button
        type="button"
        className="v-sheet-backdrop"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        className="v-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${asset.code} preview`}
      >
        <span className="v-sheet-grab" aria-hidden="true" />
        <div className="v-sheet-scroll">
          <div className="v-sheet-hero">
            <span className={`v-sheet-stage v-tile-stage-${stage}`} aria-hidden="true" data-brand={visual?.localSrc ? asset.slug : undefined}>
              {visual?.localSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={visual.localSrc} alt="" className="v-sheet-logo" loading="lazy" />
              ) : (
                <span className="v-tile-mark v-tile-mark-lg">{fallbackMark(asset.code)}</span>
              )}
            </span>
            <span className="v-sheet-title">
              <strong>{asset.code}</strong>
              <span>{shortAssetName(asset.name, asset.code)}</span>
              <small>
                {[visual?.issuerShort ?? asset.issuer, asset.classLabel, eco.label]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <button type="button" className="v-sheet-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          {subject ? (
            <p className="v-sheet-subject">
              {subject.type === "company" ? "Company" : "Issuer"}: {subject.name}
              {subject.siblingSlugs.length > 1 ? (
                <>
                  {" · "}
                  <Link href={`/subjects/${subject.slug}`}>Compare representations</Link>
                </>
              ) : null}
            </p>
          ) : null}

          <h3 className="v-sheet-h">Price</h3>
          <PriceBlock key={asset.slug} slug={asset.slug} />

          <h3 className="v-sheet-h">What you can do</h3>
          {actions.length > 0 ? (
            <div className="v-sheet-actions">
              {actions.map((action) => {
                const open = expanded === action.kind;
                return (
                  <div className={`v-sheet-action${open ? " is-open" : ""}`} key={action.kind}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : action.kind)}
                      aria-expanded={open}
                    >
                      <ActionGlyph kind={action.kind} />
                      <span>
                        <strong>{action.title}</strong>
                        <small>{action.stateLabel}</small>
                      </span>
                      <span className="v-sheet-chev" aria-hidden="true">
                        {open ? "▾" : "▸"}
                      </span>
                    </button>
                    {open ? (
                      <div className="v-sheet-action-detail">
                        <p className="v-sheet-state">
                          {action.eligibilityExplanation ?? `${action.state === "available" ? "Available" : "Permissioned"}${action.eligibilityNote ? ` · ${action.eligibilityNote}` : ""}`}
                        </p>
                        {action.eligibilityNextStep ? (
                          <p className="v-sheet-copy small">
                            Next step: {action.eligibilityNextStep.href.startsWith("http") ? (
                              <a href={action.eligibilityNextStep.href} target="_blank" rel="noreferrer">
                                {action.eligibilityNextStep.label} →
                              </a>
                            ) : (
                              <Link href={action.eligibilityNextStep.href}>{action.eligibilityNextStep.label} →</Link>
                            )}
                          </p>
                        ) : null}
                        {action.eligibilityState && action.eligibilityState !== "available" ? (
                          action.eligibilityAlternative ? (
                            <p className="v-sheet-copy small">
                              Verified alternative: {action.eligibilityAlternative.href.startsWith("http") ? (
                                <a href={action.eligibilityAlternative.href} target="_blank" rel="noreferrer">
                                  {action.eligibilityAlternative.title} →
                                </a>
                              ) : (
                                <Link href={action.eligibilityAlternative.href}>{action.eligibilityAlternative.title} →</Link>
                              )}{" "}
                              <span>({action.eligibilityAlternative.why})</span>
                            </p>
                          ) : (
                            <p className="v-sheet-copy small">No verified alternative for this action right now.</p>
                          )
                        ) : null}
                        {action.description ? <p>{action.description}</p> : null}
                        {action.external ? (
                          <a href={action.href} target="_blank" rel="noreferrer" className="v-sheet-cta">
                            Continue to official flow →
                          </a>
                        ) : (
                          <Link href={action.href} className="v-sheet-cta">
                            Continue to official flow →
                          </Link>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small">No executable actions right now — open the full Circle to learn more.</p>
          )}

          {shortAbout ? (
            <>
              <h3 className="v-sheet-h">About</h3>
              <p className="v-sheet-copy">{shortAbout}</p>
            </>
          ) : null}

          <h3 className="v-sheet-h">Issuer</h3>
          <p className="v-sheet-copy">{visual?.issuerShort ?? asset.issuer ?? "Issuer source review pending"}</p>

          <h3 className="v-sheet-h">Representation</h3>
          <details className="v-sheet-rep">
            <summary>
              {eco.label}
              {representationNote ? ` · ${representationNote}` : ""}
            </summary>
            <p className="v-sheet-copy small">{asset.slug}</p>
            {asset.sourceUrl ? (
              <a href={asset.sourceUrl} target="_blank" rel="noreferrer" className="v-text-link">
                {asset.sourceLabel ?? "Official source"} →
              </a>
            ) : null}
          </details>

          {campaignActive ? (
            <>
              <h3 className="v-sheet-h">Campaign</h3>
              <p className="v-sheet-copy small">
                Active campaign exists for this asset.{" "}
                <Link href={`/circles/${asset.slug}#campaigns`} className="v-text-link">
                  View in full Circle →
                </Link>
              </p>
            </>
          ) : null}

          <div className="v-sheet-foot">
            <Link href={openHref} className="v-sheet-open">
              {openLabel} →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
