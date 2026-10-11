import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ActivityItem,
  CircleCard,
  DataState,
  EmptyState,
  Eyebrow,
  MetricCard,
  MissionCard,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getEcosystemHub } from "@/lib/data/ecosystems";
import { getEcosystemPeople } from "@/lib/social/service";
import { PersonCard } from "@/components/person-card";

type HubPageProps = {
  params: Promise<{ ecosystem: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: HubPageProps): Promise<Metadata> {
  const { ecosystem } = await params;

  try {
    const hub = await getEcosystemHub(ecosystem);
    if (!hub) return { title: "Ecosystem" };
    return {
      title: `${hub.label} ecosystem`,
      description: `Explore ${hub.label} Asset Circles, open missions, and participation in Vicus.`,
    };
  } catch {
    return { title: "Ecosystem" };
  }
}

export default async function EcosystemHubPage({ params }: HubPageProps) {
  const { ecosystem } = await params;
  let hub;

  try {
    const session = await getCurrentSession();
    hub = await getEcosystemHub(ecosystem, session?.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="ecosystems" activeEcosystem={ecosystem.trim().toLowerCase()}>
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Ecosystem data is unavailable">
                The database could not provide this ecosystem hub right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!hub) notFound();

  const verificationAvailable = hub.circles.some((circle) => circle.verification.enabled);

  let hubPeople: Awaited<ReturnType<typeof getEcosystemPeople>> = [];
  try {
    hubPeople = await getEcosystemPeople(hub.value, 4);
  } catch {
    hubPeople = [];
  }

  return (
    <AppShell active="ecosystems" activeEcosystem={hub.value}>
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href="/discover">Discover</Link>
                <span>/</span>
                <span>{hub.label}</span>
              </nav>
              <Eyebrow>Ecosystem hub</Eyebrow>
              <h1>{hub.label}</h1>
              <p>
                Explore {hub.label} Asset Circles, learn through open missions, and contribute with
                a record. Watching and learning are open to everyone; a verified Stellar wallet is
                required to submit a response.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{`${hub.totals.circles} Circles · ${hub.totals.openMissions} open missions`}</strong>
              Asset ecosystem and reward settlement are separate: rewards settle as XLM on Stellar.
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          <div className="profile-metrics">
            <MetricCard detail="Asset Circles in this ecosystem" label="Circles" value={String(hub.totals.circles)} />
            <MetricCard detail="Participant-visible missions" label="Open missions" value={String(hub.totals.openMissions)} accent />
            <MetricCard detail="Persisted Watch relationships" label="Watchers" value={String(hub.totals.watchers)} />
            <MetricCard detail="Approved mission responses" label="Contributions" value={String(hub.totals.contributions)} />
          </div>

          <section className="circle-section" id="assets" aria-labelledby="hub-assets-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Assets to explore</Eyebrow>
                <h2 id="hub-assets-title">Circles on {hub.label}.</h2>
              </div>
              <p>
                Every Circle here is backed by a real {hub.label} asset record. Open one to read its
                Passport, watch it, and find its missions.
              </p>
            </div>
            {hub.circles.length > 0 ? (
              <div className="circle-grid">
                {hub.circles.map((circle) => (
                  <CircleCard circle={circle} key={circle.slug} />
                ))}
              </div>
            ) : (
              <EmptyState title="No circles in this ecosystem">
                The database has no Asset Circles for this ecosystem yet.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="missions" aria-labelledby="hub-missions-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Learn and participate</Eyebrow>
                <h2 id="hub-missions-title">Open missions on {hub.label}.</h2>
              </div>
              <p>
                Real missions attached to {hub.label} Circles, with your authenticated submission
                state. Drafts stay in Campaign Studio and never appear here.
              </p>
            </div>
            {hub.missions.length > 0 ? (
              <div className="mission-grid">
                {hub.missions.map((mission) => (
                  <div className="mission-index-card" key={mission.id}>
                    <div className="mission-index-context">
                      <Link href={`/circles/${mission.circle.slug}`}>{mission.circle.name}</Link>
                      <span>{mission.reward}</span>
                    </div>
                    <MissionCard mission={mission} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No open missions in this ecosystem">
                There are no participant-visible missions on {hub.label} right now.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="pulse" aria-labelledby="hub-pulse-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Community pulse</Eyebrow>
                <h2 id="hub-pulse-title">Participation on {hub.label}.</h2>
              </div>
              <p>Derived from persisted Vicus records only — no synthetic users, posts, or counts.</p>
            </div>
            <div className="profile-metrics">
              <MetricCard detail="Persisted holder/trustline checks" label="Role verifications" value={String(hub.totals.verifications)} />
              <MetricCard
                detail={
                  verificationAvailable
                    ? "At least one Circle here supports Stellar holder verification"
                    : "Holder verification is not supported on this ecosystem"
                }
                label="Verification"
                value={verificationAvailable ? "Available" : "Watch and learn"}
              />
            </div>
            {hub.recentContributions.length > 0 ? (
              <div className="content-panel" style={{ marginTop: 16 }}>
                {hub.recentContributions.map((entry, index) => (
                  <ActivityItem
                    detail={`${entry.circleName} · ${entry.submittedAt.slice(0, 10)}`}
                    key={`${entry.missionTitle}-${entry.participantHandle}-${index}`}
                    label={`@${entry.participantHandle}`}
                    title={entry.missionTitle}
                  />
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <EmptyState title="No approved contributions yet">
                  Approved responses on {hub.label} will appear here.
                </EmptyState>
              </div>
            )}
          </section>

          <section className="circle-section" id="people" aria-labelledby="hub-people-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>People</Eyebrow>
                <h2 id="hub-people-title">Active in {hub.label}.</h2>
              </div>
              <p>
                Contributors and watchers across {hub.label} Circles.{" "}
                <Link href={`/people?ecosystem=${hub.value}`}>Browse all contributors</Link>
              </p>
            </div>
            {hubPeople.length > 0 ? (
              <div className="mission-grid">
                {hubPeople.slice(0, 4).map((person) => (
                  <PersonCard key={person.user.id} person={person} />
                ))}
              </div>
            ) : (
              <EmptyState title="No active people yet">
                Watch a {hub.label} Circle or complete a mission to appear here.
              </EmptyState>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
