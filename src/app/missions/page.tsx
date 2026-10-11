import type { Metadata } from "next";
import { Suspense } from "react";
import { DataState, EmptyState, Eyebrow } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { listMissions } from "@/lib/data/missions";
import { MissionCenterBrowser } from "@/components/mission-center-browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Missions",
  description: "Complete proof-based missions and build a record of useful participation.",
};

export default async function MissionsPage() {
  let missions: Awaited<ReturnType<typeof listMissions>> = [];
  let databaseUnavailable = false;

  try {
    const session = await getCurrentSession();
    missions = await listMissions(session?.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <AppShell active="missions">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Mission center</Eyebrow>
              <h1>Make understanding useful.</h1>
              <p>
                Read the objective, complete a quiz or contribution, and leave a record that stays
                explicit about review and approval. Filter by ecosystem or mission type to find a
                useful next step.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{databaseUnavailable ? "Mission center unavailable" : `${missions?.length ?? 0} open missions in Vicus`}</strong>
              Browse freely. A verified wallet session is required to submit a response.
            </div>
          </div>
        </header>

        <div className="shell">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Mission data is unavailable">
                The database could not provide the Mission Center right now. Try again later.
              </DataState>
            </section>
          ) : missions && missions.length > 0 ? (
            <Suspense>
              <MissionCenterBrowser missions={missions} />
            </Suspense>
          ) : (
            <section className="directory-section">
              <EmptyState title="No missions configured">
                The database has no missions to show yet. No fixture missions are displayed.
              </EmptyState>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}
