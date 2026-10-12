import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, DataState, EmptyState, Icon } from "@/components/vicus";
import { AssetToken, GlowField, EdgeLight, MetricTile, Orb, edgeClass } from "@/components/vicus-ui";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getOrganizationBySlug, listSpaces } from "@/lib/organizations/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spaces",
  description: "Projects hosting asset communities, lessons, and missions on Vicus.",
};

export default async function SpacesPage() {
  let spaces: Awaited<ReturnType<typeof listSpaces>> = [];
  let databaseUnavailable = false;

  try {
    spaces = await listSpaces();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  const ranked = [...spaces].sort(
    (a, b) =>
      b.hostedCircleCount + b.openMissionCount + b.publishedLessonCount -
      (a.hostedCircleCount + a.openMissionCount + a.publishedLessonCount),
  );
  const [featured, ...others] = ranked;
  const featuredDetail = featured ? await getOrganizationBySlug(featured.slug).catch(() => null) : null;

  return (
    <AppShell active="spaces">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["violet", "pink"]} />
          <div className="shell v-page-head-row">
            <div>
              <span className="v-eyebrow">Project storefronts</span>
              <h1>Spaces</h1>
              <p>Projects hosting their assets, lessons, and missions.</p>
            </div>
            <ButtonLink href="/host" variant="glass">
              Host on Vicus <Icon name="arrow-right" size={15} />
            </ButtonLink>
          </div>
        </header>

        <div className="shell s-body">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Spaces data is unavailable">
                The database could not provide Spaces right now. Try again later.
              </DataState>
            </section>
          ) : featured ? (
            <>
              <Link className={`space-feature space-feature-lg ${edgeClass("slow")}`} href={`/spaces/${featured.slug}`}>
                <EdgeLight />
                <span aria-hidden="true" className="space-feature-banner">
                  <GlowField tones={["violet", "pink", "blue"]} />
                </span>
                <span className="space-monogram">{featured.name.slice(0, 1)}</span>
                <span className="space-feature-body">
                  <strong>{featured.name}</strong>
                  <small>{featured.ecosystemFocus ? `${featured.ecosystemFocus} focus` : "Multi-ecosystem"}</small>
                  <span className="space-feature-line">{featured.description}</span>
                </span>
                <span className="space-feature-metrics">
                  <MetricTile icon="coins" label="Assets" tone="blue" value={String(featured.hostedCircleCount)} />
                  <MetricTile icon="target" label="Missions" tone="green" value={String(featured.openMissionCount)} />
                  <MetricTile icon="book" label="Lessons" tone="violet" value={String(featured.publishedLessonCount)} />
                  <MetricTile icon="chat" label="Contributions" tone="pink" value={String(featured.approvedContributionCount)} />
                </span>
                {featuredDetail && featuredDetail.circles.length > 0 ? (
                  <span className="space-feature-assets">
                    {featuredDetail.circles.slice(0, 6).map((circle) => (
                      <AssetToken code={circle.code} ecosystem={circle.ecosystem} key={circle.slug} size="sm" />
                    ))}
                    <small>Hosted assets</small>
                  </span>
                ) : null}
                <span className="space-feature-cta">
                  Enter Space <Icon name="arrow-right" size={15} />
                </span>
              </Link>

              <div className="s-grid">
                {others.map((space) => (
                  <Link className="space-panel" href={`/spaces/${space.slug}`} key={space.id}>
                    <span className="space-panel-top">
                      <span className="space-monogram space-monogram-sm">{space.name.slice(0, 1)}</span>
                      <span>
                        <strong>{space.name}</strong>
                        <small>{space.ecosystemFocus ? `${space.ecosystemFocus} focus` : "Multi-ecosystem"}</small>
                      </span>
                    </span>
                    <span className="space-panel-line">{space.description}</span>
                    <span className="space-panel-stats">
                      <span><strong>{space.hostedCircleCount}</strong> assets</span>
                      <span><strong>{space.openMissionCount}</strong> missions</span>
                      <span><strong>{space.publishedLessonCount}</strong> lessons</span>
                    </span>
                    <span className="space-panel-cta">
                      Enter Space <Icon name="arrow-right" size={14} />
                    </span>
                  </Link>
                ))}
                <Link className={`space-panel space-panel-host ${edgeClass("slow")}`} href="/host">
                  <EdgeLight />
                  <Orb icon="spark" size="lg" tone="white" />
                  <strong>Your project here</strong>
                  <span className="space-panel-line">Host assets, publish lessons, run missions.</span>
                  <span className="space-panel-cta">
                    Host on Vicus <Icon name="arrow-right" size={14} />
                  </span>
                </Link>
              </div>
            </>
          ) : (
            <section className="directory-section">
              <EmptyState title="No Spaces yet">
                Approved project Spaces will appear here. Projects can apply from the Host page.
              </EmptyState>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}
