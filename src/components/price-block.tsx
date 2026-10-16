"use client";

import { useEffect, useState } from "react";

/**
 * P1.3 — Verified price presentation. Renders a real price ONLY from
 * server evidence; otherwise renders the intentional "No verified price
 * feed" absence state. Charts render ONLY from a verified series —
 * with no wired historical source, every asset honestly shows the
 * absence state until a real series exists.
 */

type Evidence = {
  slug: string;
  code: string;
  network: string;
  status: "available" | "unavailable";
  priceType: "token_market" | "underlying_reference" | "indicative_quote" | "issuer_nav" | null;
  value: number | null;
  currency: string | null;
  source: { name: string; url: string } | null;
  observedAt: string | null;
  retrievedAt: string;
  freshness: "live" | "stale" | "reference" | "unavailable";
  detail: string;
  reason: string | null;
  series: { t: string; value: number }[];
};

const TYPE_LABELS: Record<string, string> = {
  token_market: "Token market price",
  underlying_reference: "Underlying reference — not the token price",
  indicative_quote: "Indicative swap quote",
  issuer_nav: "Issuer-reported value",
};

const FRESHNESS_LABELS: Record<string, string> = {
  live: "Live",
  stale: "Stale",
  reference: "Reference",
  unavailable: "Unavailable",
};

function formatValue(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function relativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown time";
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const date = new Date(ms);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PriceBlock({ slug }: { slug: string }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/prices?slug=${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (payload?.ok && payload.evidence) setEvidence(payload.evidence as Evidence);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed) {
    return (
      <div className="v-price v-price-empty" data-price-state="error">
        <p className="v-price-title">No verified price feed</p>
        <p className="v-price-sub">Price temporarily unavailable — try again shortly.</p>
      </div>
    );
  }

  if (!evidence) {
    return (
      <div className="v-price v-price-empty" data-price-state="loading" aria-busy="true">
        <p className="v-price-title">Checking verified feeds…</p>
      </div>
    );
  }

  if (evidence.status === "unavailable" || evidence.value === null) {
    return (
      <div className="v-price v-price-empty" data-price-state="unavailable">
        <p className="v-price-title">No verified price feed</p>
        <p className="v-price-sub">{evidence.detail}</p>
      </div>
    );
  }

  const hasChart = evidence.series.length >= 2;
  return (
    <div className="v-price" data-price-state="available" data-price-type={evidence.priceType ?? undefined}>
      <p className="v-price-row">
        <span className="v-price-value">
          {formatValue(evidence.value)} {evidence.currency}
        </span>
        <span className="v-price-fresh" data-freshness={evidence.freshness}>
          {FRESHNESS_LABELS[evidence.freshness] ?? evidence.freshness}
        </span>
      </p>
      <p className="v-price-type">{evidence.priceType ? TYPE_LABELS[evidence.priceType] : null}</p>
      <p className="v-price-sub">{evidence.detail}</p>
      <p className="v-price-meta">
        Source:{" "}
        {evidence.source ? (
          <a href={evidence.source.url} target="_blank" rel="noreferrer">
            {evidence.source.name} →
          </a>
        ) : (
          "—"
        )}{" "}
        · Updated {evidence.observedAt ? relativeTime(evidence.observedAt) : "at an unknown time"}
      </p>
      {hasChart ? (
        <PriceSpark series={evidence.series} />
      ) : (
        <div className="v-chart-empty" data-chart-state="unavailable">
          <p>No verified chart series for this asset — Vicus never draws decorative charts.</p>
        </div>
      )}
    </div>
  );
}

/** Renders ONLY from verified observations; never interpolates gaps. */
function PriceSpark({ series }: { series: { t: string; value: number }[] }) {
  const width = 280;
  const height = 72;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series
    .map((p, i) => `${(i * step).toFixed(1)},${(height - 6 - ((p.value - min) / span) * (height - 12)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      className="v-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Verified price history, ${series.length} observations`}
    >
      <polyline points={points} fill="none" strokeWidth="2" />
    </svg>
  );
}
