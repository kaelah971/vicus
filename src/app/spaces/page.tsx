import type { Metadata } from "next";
import Link from "next/link";
import { DataState, EmptyState, Eyebrow, MetricCard } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { listSpaces } from "@/lib/organizations/service";

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

  return (
    <AppShell active="spaces">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Spaces</Eyebrow>
              <h1>Projects with a home on Vicus.</h1>
              <p>
                Every Space hosts asset communities, publishes lessons, and runs missions.
                Open one to learn, contribute, and meet its people.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>
                {databaseUnavailable ? "Spaces unavailable" : `${spaces.length} ${spaces.length === 1 ? "Space" : "Spaces"}`}
              </strong>
              Real projects only — no fabricated entries.
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Spaces data is unavailable">
                The database could not provide Spaces right now. Try again later.
              </DataState>
            </section>
          ) : spaces.length > 0 ? (
            <div className="mission-grid">
              {spaces.map((space) => (
                <article className="mission-card" key={space.id}>
                  <div className="mission-card-header">
                    <span className="mission-type">
                      {space.ecosystemFocus ? `${space.ecosystemFocus} focus` : "Multi-ecosystem"}
                    </span>
                  </div>
                  <h3>
                    <Link href={`/spaces/${space.slug}`}>{space.name}</Link>
                  </h3>
                  <p>{space.description}</p>
                  <div className="profile-metrics">
                    <MetricCard detail="Hosted asset communities" label="Circles" value={String(space.hostedCircleCount)} />
                    <MetricCard detail="Published lessons" label="Lessons" value={String(space.publishedLessonCount)} />
                    <MetricCard detail="Open missions" label="Missions" value={String(space.openMissionCount)} accent />
                    <MetricCard detail="Approved contributions" label="Contributions" value={String(space.approvedContributionCount)} />
                  </div>
                  <div className="mission-footer">
                    <Link className="mission-action-link" href={`/spaces/${space.slug}`}>
                      Enter Space
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="directory-section">
              <EmptyState title="No Spaces yet">
                Approved project Spaces will appear here. Projects can apply from the Host page.
              </EmptyState>
            </section>
          )}

          <p className="control-note" style={{ marginTop: 16 }}>
            Running a project? <Link href="/host">Host on Vicus</Link>
          </p>
        </div>
      </main>
    </AppShell>
  );
}
