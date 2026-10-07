import type { Metadata } from "next";
import { AppShell, DataState, Eyebrow } from "@/components/vicus";
import { ExploreBrowser } from "@/components/explore-browser";
import { isDatabaseUnavailableError } from "@/db";
import { listCircles } from "@/lib/data/circles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Circles",
  description: "Browse Vicus asset circles and their source-led Passports.",
};

export default async function CirclesPage() {
  let circleData: Awaited<ReturnType<typeof listCircles>> = [];
  let databaseUnavailable = false;

  try {
    circleData = await listCircles();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <AppShell active="circles">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Asset circles</Eyebrow>
              <h1>Find the community around the asset.</h1>
              <p>
                Browse every database-backed circle, compare its source status, and open a Passport
                before deciding whether to watch or verify.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{databaseUnavailable ? "Circle directory unavailable" : `${circleData?.length ?? 0} circles in Vicus`}</strong>
              The directory is live data. No fixture fallback is shown when the database is unavailable.
            </div>
          </div>
        </header>

        <div className="shell">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Circle data is unavailable">
                The database could not provide the Circle directory right now. Try again later.
              </DataState>
            </section>
          ) : (
            <ExploreBrowser circles={circleData ?? []} />
          )}
        </div>
      </main>
    </AppShell>
  );
}
