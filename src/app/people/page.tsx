import type { Metadata } from "next";
import { DataState, EmptyState, Eyebrow } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { listCircles, listEcosystems } from "@/lib/data/circles";
import { listContributors } from "@/lib/social/service";
import { PeopleBrowserSuspense } from "@/components/people-browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People",
  description: "Find active Vicus contributors around the assets you care about.",
};

type PeoplePageProps = {
  searchParams: Promise<{ ecosystem?: string; circle?: string; interest?: string; sort?: string }>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const params = await searchParams;
  let people: Awaited<ReturnType<typeof listContributors>> = [];
  let circles: Awaited<ReturnType<typeof listCircles>> = [];
  let ecosystems: Awaited<ReturnType<typeof listEcosystems>> = [];
  let databaseUnavailable = false;

  try {
    [circles, ecosystems] = await Promise.all([listCircles(null), listEcosystems()]);
    people = await listContributors({
      ecosystem: params.ecosystem ?? null,
      circleId: params.circle ?? null,
      interest: params.interest ?? null,
      sort: params.sort === "points" ? "points" : "recent",
      limit: 24,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <AppShell>
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>People</Eyebrow>
              <h1>Find contributors around your assets.</h1>
              <p>
                Real people with approved public contributions. Filter by ecosystem, circle, or
                interest — only public records are ever listed.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>
                {databaseUnavailable ? "People unavailable" : `${people.length} active contributors`}
              </strong>
              Open a profile to understand interests, roles, and history — then follow.
            </div>
          </div>
        </header>

        <div className="shell">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="People data is unavailable">
                The database could not provide contributors right now. Try again later.
              </DataState>
            </section>
          ) : (
            <PeopleBrowserSuspense
              circles={circles.map((circle) => ({
                id: circle.id,
                slug: circle.slug,
                name: circle.name,
                ecosystem: circle.ecosystem,
                ecosystemLabel: circle.ecosystemLabel,
              }))}
              ecosystems={ecosystems}
              people={people}
            />
          )}
          {!databaseUnavailable && people.length === 0 ? (
            <section className="directory-section">
              <EmptyState title="No contributors yet">
                Approved public contributions will surface people here.
              </EmptyState>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
