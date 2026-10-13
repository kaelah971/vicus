import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { isDatabaseUnavailableError } from "@/db";
import { compareRepresentations, SubjectsError } from "@/lib/subjects/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare representations",
  description: "Compare exact verified onchain representations side by side.",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ assets?: string }>;
}) {
  const { assets } = await searchParams;
  const [a, b] = (assets ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!a || !b) {
    return (
      <AppShell active="discover">
        <main className="page-main">
          <div className="shell circle-page-body">
            <div className="stack">
              <section className="card">
                <p className="eyebrow">Compare</p>
                <h1>Compare representations</h1>
                <p className="muted">Pick two verified representations. Every value comes from shared registry, lifecycle, and Action Engine truth.</p>
                <div className="row">
                  <Link className="button button-outline button-small" href="/compare?assets=aaplx-on-solana,aaplc-on-base">AAPLx vs AAPLc</Link>
                  <Link className="button button-outline button-small" href="/compare?assets=benji-on-stellar,wtgxx-on-stellar">BENJI vs WTGXX</Link>
                </div>
              </section>
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  let compared;
  try {
    compared = await compareRepresentations(a, b);
  } catch (error) {
    if (error instanceof SubjectsError) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell circle-page-body">
              <DataState title="Comparison unavailable">{error.message}</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Comparison unavailable">The database could not provide this comparison right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Compare · no scores, no winners</p>
              <h1>{compared.left.code} vs {compared.right.code}</h1>
              <p className="muted">Distinct products — different issuers, networks, contracts, access, and restrictions. Nothing here is interchangeable.</p>
            </section>
            <section className="card">
              {compared.rows.map((row) => (
                <div key={row.field} className="watch-row">
                  <div>
                    <p className="muted small">{row.field}</p>
                    <p><strong>{row.values[0]}</strong></p>
                  </div>
                  <div>
                    <p className="muted small">{row.field}</p>
                    <p><strong>{row.values[1]}</strong></p>
                  </div>
                </div>
              ))}
              <div className="row">
                <Link className="button button-outline button-small" href={compared.left.openHref}>Open {compared.left.code}</Link>
                <Link className="button button-outline button-small" href={compared.right.openHref}>Open {compared.right.code}</Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
