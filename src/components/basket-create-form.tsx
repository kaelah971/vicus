"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type BasketAssetOption = {
  slug: string;
  code: string;
  issuer: string;
  network: string;
};

const MAX_ASSETS = 12;

/**
 * Personal basket creator (discovery only). All validation re-runs on the
 * server; this form only previews composition. Nothing here acquires
 * assets, spends funds, or creates holdings.
 */
export function BasketCreateForm({ assets }: { assets: BasketAssetOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [rationale, setRationale] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () =>
      Object.entries(picked)
        .filter(([, weight]) => weight.trim().length > 0)
        .map(([slug, weight]) => ({ slug, weightBps: Number(weight) * 100 })),
    [picked],
  );
  const total = selected.reduce((sum, entry) => sum + (Number.isFinite(entry.weightBps) ? entry.weightBps : 0), 0);
  const totalValid = selected.length > 0 && selected.length <= MAX_ASSETS && total === 10000;

  function toggleAsset(slug: string, on: boolean) {
    setPicked((prev) => {
      if (!on) {
        const next = { ...prev };
        delete next[slug];
        return next;
      }
      if (!(slug in prev) && Object.keys(prev).length >= MAX_ASSETS) return prev;
      return { ...prev, [slug]: prev[slug] ?? "" };
    });
  }

  function setWeight(slug: string, value: string) {
    const cleaned = value.replace(/[^0-9.]/g, "");
    setPicked((prev) => {
      if (!(slug in prev)) return prev;
      return { ...prev, [slug]: cleaned };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/baskets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          theme,
          rationale,
          constituents: Object.entries(picked).map(([slug, weight]) => ({
            slug,
            weightBps: Math.round(Number(weight) * 100),
          })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.basket?.slug) {
        setError(typeof body?.message === "string" ? body.message : "That basket could not be saved.");
        return;
      }
      router.push(`/baskets/${body.basket.slug}`);
    } catch {
      setError("That basket could not be saved. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="content-panel" onSubmit={handleSubmit}>
      <label className="field" htmlFor="basket-name">
        <span>Name</span>
        <input
          id="basket-name"
          autoComplete="off"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="Stellar income themes"
          value={name}
        />
      </label>
      <label className="field" htmlFor="basket-theme">
        <span>Theme</span>
        <input
          id="basket-theme"
          autoComplete="off"
          maxLength={500}
          onChange={(event) => setTheme(event.target.value)}
          placeholder="What ties these assets together?"
          value={theme}
        />
      </label>
      <label className="field" htmlFor="basket-rationale">
        <span>Why these assets?</span>
        <input
          id="basket-rationale"
          autoComplete="off"
          maxLength={1000}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="One or two sentences on the editorial idea."
          value={rationale}
        />
      </label>
      <fieldset className="field">
        <legend>Assets (percent weights must total 100%)</legend>
        <div className="pos-hold-grid">
          {assets.map((asset) => {
            const active = asset.slug in picked;
            return (
              <div className="pos-hold" key={asset.slug}>
                <span className="pos-hold-top">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => toggleAsset(asset.slug, event.target.checked)}
                    aria-label={`Include ${asset.code}`}
                  />
                  <span className="pos-hold-id">
                    <strong className="pos-hold-code">{asset.code}</strong>
                    <span className="pos-hold-net">
                      {asset.issuer} · {asset.network}
                    </span>
                  </span>
                  {active ? (
                    <input
                      className="pos-weight"
                      inputMode="decimal"
                      aria-label={`${asset.code} weight percent`}
                      onChange={(event) => setWeight(asset.slug, event.target.value)}
                      placeholder="0"
                      value={picked[asset.slug] ?? ""}
                    />
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="field-help" role="status">
        {selected.length === 0
          ? "Pick 1–12 assets from the catalogue."
          : `Total: ${(total / 100).toFixed(total % 100 === 0 ? 0 : 2)}%${totalValid ? " — ready to save." : " — weights must total exactly 100%."}`}
      </p>
      <p>
        <button className="button button-violet button-small" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save basket"}
        </button>
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="field-help">Discovery only — saving never acquires assets or spends funds.</p>
    </form>
  );
}
