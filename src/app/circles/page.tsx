import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { AssetTile } from "@/components/asset-tile";
import { isDatabaseUnavailableError } from "@/db";
import { isAssetCircle, listCircles } from "@/lib/data/circles";

export const dynamic = "force-dynamic";

export default async function CirclesDirectoryPage() {
  let circles: Awaited<ReturnType<typeof listCircles>> = [];
  let unavailable = false;
  try {
    circles = (await listCircles(null)).filter(isAssetCircle);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      unavailable = true;
    } else {
      throw error;
    }
  }
  const stellar = circles.filter((circle) => circle.ecosystem === "stellar");
  const beyond = circles.filter((circle) => circle.ecosystem !== "stellar");

  return (
    <AppShell active="circles">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Circles · people and knowledge per asset</p>
              <h1>Asset Circles</h1>
              <p className="muted">
                Every circle gathers questions, insights, theses, campaigns, and people
                around one tokenized asset — Stellar first.
              </p>
            </section>
            {unavailable ? (
              <DataState title="Circles are unavailable">The database could not provide circles right now.</DataState>
            ) : (
              <>
                <section className="card">
                  <h2>Stellar · home ({stellar.length})</h2>
                  <p className="muted small">Visual tiles — open a Circle for people and knowledge.</p>
                  <div className="v-tiles">
                    {stellar.map((circle) => (
                      <AssetTile
                        key={circle.slug}
                        asset={{
                          slug: circle.slug,
                          code: circle.code,
                          name: circle.name,
                          issuer: circle.issuerSource ?? null,
                          classLabel: circle.assetClassLabel ?? circle.category,
                          ecosystem: circle.ecosystem ?? circle.network,
                          ecosystemLabel: circle.ecosystemLabel,
                          network: circle.network,
                        }}
                        href={`/circles/${circle.slug}`}
                      />
                    ))}
                  </div>
                </section>
                {beyond.length > 0 ? (
                  <section className="card">
                    <h2>Beyond Stellar ({beyond.length})</h2>
                    <div className="v-tiles">
                      {beyond.map((circle) => (
                        <AssetTile
                          key={circle.slug}
                          asset={{
                            slug: circle.slug,
                            code: circle.code,
                            name: circle.name,
                            issuer: circle.issuerSource ?? null,
                            classLabel: circle.assetClassLabel ?? circle.category,
                            ecosystem: circle.ecosystem ?? circle.network,
                            ecosystemLabel: circle.ecosystemLabel,
                            network: circle.network,
                          }}
                          href={`/circles/${circle.slug}`}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                <p className="muted small">
                  Looking for utility instead? <Link href="/use">Put assets to work →</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
