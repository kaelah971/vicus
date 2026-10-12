import type { Metadata } from "next";
import { Suspense } from "react";
import { DataState, EmptyState } from "@/components/vicus";
import { GlowField, MetricTile, MissionStrip } from "@/components/vicus-ui";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { listMissions } from "@/lib/data/missions";
import { rewardNetworkLabel } from "@/lib/rewards/display";
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

  const rewardNetwork = rewardNetworkLabel();
  const activations = missions.filter((mission) => mission.type === "onchain_action" && !mission.submissionStatus);
  const totalPoints = missions.reduce((sum, mission) => sum + mission.points, 0);
  const rewarded = missions.filter((mission) => mission.reward !== "No reward configured").length;
  const completed = missions.filter((mission) => mission.submissionStatus === "approved").length;

  return (
    <AppShell active="missions">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["green", "violet"]} />
          <div className="shell">
            <span className="v-eyebrow">Challenges</span>
            <h1>Missions</h1>
            <p>Learn, use, contribute — and earn for it.</p>
            {!databaseUnavailable ? (
              <div className="v-head-metrics">
                <MetricTile icon="target" label="Open missions" tone="green" value={String(missions.length)} />
                <MetricTile icon="star" label="Points available" tone="violet" value={String(totalPoints)} />
                <MetricTile
                  hint={rewardNetwork ? `XLM rewards settle on ${rewardNetwork}` : undefined}
                  icon="gift"
                  label={rewardNetwork ? `XLM rewards · ${rewardNetwork}` : "XLM rewards"}
                  tone="white"
                  value={String(rewarded)}
                />
                {completed > 0 ? <MetricTile icon="check" label="You completed" tone="blue" value={String(completed)} /> : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className="shell m-body">
          {activations.map((mission) => (
            <MissionStrip
              context={`${mission.circle.name} · ${mission.circle.ecosystemLabel}`}
              href={`/missions/${mission.id}`}
              key={mission.id}
              points={mission.points}
              reward={mission.reward}
              rewardNetwork={rewardNetwork}
              title={mission.title}
            />
          ))}

          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Mission data is unavailable">
                The database could not provide the Mission Center right now. Try again later.
              </DataState>
            </section>
          ) : missions.length > 0 ? (
            <Suspense>
              <MissionCenterBrowser missions={missions} />
            </Suspense>
          ) : (
            <section className="directory-section">
              <EmptyState title="No missions right now">New missions appear here once published.</EmptyState>
            </section>
          )}

          <p className="control-note m-note">
            Points are offchain Vicus records. XLM rewards settle on {rewardNetwork ?? "Stellar"} — the asset&apos;s
            ecosystem and the reward network are separate. A verified wallet session is required to submit.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
