import type { Metadata } from "next";
import { AppShell, DataState, Eyebrow } from "@/components/vicus";
import { ExploreBrowser } from "@/components/explore-browser";
import { isDatabaseUnavailableError } from "@/db";
import { listCircles } from "@/lib/data/circles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore circles",
  description: "Browse educational asset circles and read the source-led Vicus Passport.",
};

export default async function ExplorePage() {
  let circleData;
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
    <AppShell active="explore">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <Eyebrow>Asset circles</Eyebrow>
              <h1>Find a place to begin.</h1>
              <p>
                Browse seeded circles, understand what each entry is for, and keep your first step
                watch-first. No wallet is needed to explore.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>Read before you act.</strong>
              Every entry is labelled as an education, source-review, or community fixture. No
              issuer approval, balance, purchase, or reward is implied.
            </div>
          </div>
        </header>

        <div className="shell">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Circle data is unavailable">
                The database could not provide the directory right now. No fixture fallback is being shown.
              </DataState>
            </section>
          ) : (
            <ExploreBrowser circles={circleData ?? []} />
          )}

          <section className="missions-intro" id="missions">
            <div className="missions-intro-grid">
              <div>
                <Eyebrow>Missions</Eyebrow>
                <h2>Useful understanding comes before a claim.</h2>
              </div>
              <div>
                <p>
                  Missions will eventually give circles a structured way to learn, explain, and
                  contribute. In this slice they are preview surfaces only: no response is stored,
                  reviewed, or rewarded.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
