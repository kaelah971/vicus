import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DataState, Eyebrow } from "@/components/vicus";
import { ExploreBrowser } from "@/components/explore-browser";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession, isSessionUnavailableError } from "@/lib/auth/session";
import { listCircles } from "@/lib/data/circles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover source-backed tokenized asset Circles across real ecosystems.",
};

export default async function DiscoverPage() {
  let circleData: Awaited<ReturnType<typeof listCircles>> = [];
  let databaseUnavailable = false;

  try {
    const session = await getCurrentSession();
    circleData = await listCircles(session?.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error) || isSessionUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Discover</Eyebrow>
              <h1>Find the assets worth understanding.</h1>
              <p>
                Explore every source-backed Asset Circle in Vicus — what assets exist, across all
                ecosystems. Then enter an ecosystem hub to learn, participate, and contribute.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{databaseUnavailable ? "Discover unavailable" : `${circleData.length} Asset Circles`}</strong>
              Ecosystem labels describe where an asset exists. They are not wallet or holder verification.
            </div>
          </div>
        </header>

        <div className="shell">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Discover data is unavailable">
                The database or session service could not provide Discover right now. No fixture fallback is shown.
              </DataState>
            </section>
          ) : (
            <Suspense>
              <ExploreBrowser circles={circleData} />
            </Suspense>
          )}
        </div>
      </main>
    </AppShell>
  );
}
