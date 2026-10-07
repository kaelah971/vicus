import type { Metadata } from "next";
import Link from "next/link";
import { AppShell, DataState, EmptyState, Eyebrow, MissionCard } from "@/components/vicus";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { listMissions } from "@/lib/data/missions";

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
                explicit about review and approval.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{databaseUnavailable ? "Mission center unavailable" : `${missions?.length ?? 0} missions in Vicus`}</strong>
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
            <section aria-labelledby="mission-center-title" className="mission-center-section">
              <div className="section-heading">
                <div>
                  <Eyebrow>Current missions</Eyebrow>
                  <h2 id="mission-center-title">Choose a useful next step.</h2>
                </div>
                <span className="directory-count">{missions.length} database-backed missions</span>
              </div>
              <div className="mission-grid">
                {missions.map((mission) => (
                  <div className="mission-index-card" key={mission.id}>
                    <div className="mission-index-context">
                      <Link href={`/circles/${mission.circle.slug}`}>{mission.circle.name}</Link>
                      <span>{mission.reward}</span>
                    </div>
                    <MissionCard mission={mission} />
                  </div>
                ))}
              </div>
            </section>
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
