import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { Chip, GlowField, SectionHead } from "@/components/vicus-ui";
import { isDatabaseUnavailableError } from "@/db";
import { DISCOVERY_ONLY_DISCLOSURE } from "@/lib/baskets/config";
import { listBaskets } from "@/lib/baskets/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Curated baskets",
  description: "Discovery-only themed sets of real tokenized assets. Not investable.",
};

export default async function BasketsPage() {
  let baskets: Awaited<ReturnType<typeof listBaskets>> = [];
  let unavailable = false;
  try {
    baskets = await listBaskets();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      unavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["violet", "blue"]} />
          <div className="shell">
            <span className="v-eyebrow">Discover · Curated baskets</span>
            <h1>Baskets</h1>
            <p>Themed sets of real tokenized assets, curated for exploration. {DISCOVERY_ONLY_DISCLOSURE}</p>
          </div>
        </header>

        <div className="shell">
          {unavailable ? (
            <section className="directory-section">
              <DataState title="Baskets are unavailable">
                The database could not provide baskets right now. No fixture fallback is shown.
              </DataState>
            </section>
          ) : (
            <section className="directory-section" aria-label="Curated baskets">
              <SectionHead
                eyebrow={`${baskets.length} themes`}
                title="Browse by theme"
                line="Composition is illustrative. Every member links to its full asset page with live eligibility."
              />
              <div className="pos-hold-grid">
                {baskets.map((basket) => (
                  <article className="pos-hold" key={basket.slug}>
                    <div className="pos-hold-top">
                      <div className="pos-hold-id">
                        <strong className="pos-hold-code">{basket.name}</strong>
                        <span className="pos-hold-net">
                          {basket.memberCount} assets · v{basket.version}
                        </span>
                      </div>
                    </div>
                    <p className="pos-actions-line">{basket.theme}</p>
                    <div className="pos-actions">
                      {basket.memberCodes.map((code) => (
                        <Chip key={code} tone="violet">
                          {code}
                        </Chip>
                      ))}
                    </div>
                    <div className="pos-actions">
                      <Link className="button button-outline button-small" href={`/baskets/${basket.slug}`}>
                        Open theme
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}
