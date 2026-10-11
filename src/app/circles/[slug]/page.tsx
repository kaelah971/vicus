import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ActivityItem,
  AssetPassport,
  DataState,
  EmptyState,
  Eyebrow,
  Icon,
  MetricCard,
  MissionCard,
  StatusPill,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WatchButton } from "@/components/watch-button";
import { RoleVerification } from "@/components/role-verification";
import { getCircleBySlug } from "@/lib/data/circles";
import { getCircleParticipation, getRoleVerificationForCircle } from "@/lib/data/roles";

type CirclePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CirclePageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const circle = await getCircleBySlug(slug);

    return {
      title: circle?.name ?? "Circle",
      description: circle?.summary,
    };
  } catch {
    return { title: "Circle" };
  }
}

export default async function CirclePage({ params }: CirclePageProps) {
  const { slug } = await params;
  let circle;
  let authenticated = false;
  let initialVerification: {
    id: string;
    role: string;
    lastState: string;
    ecosystem: string;
    network: string;
    lastCheckedAt: string;
  } | null = null;

  try {
    const session = await getCurrentSession();
    circle = await getCircleBySlug(slug, session?.user.id);
    authenticated = Boolean(session);
    if (session) {
      try {
        const row = await getRoleVerificationForCircle(session.user.id, slug);
        initialVerification = row
          ? {
              id: row.id,
              role: row.role,
              lastState: row.lastState,
              ecosystem: row.ecosystem,
              network: row.network,
              lastCheckedAt: row.lastCheckedAt.toISOString(),
            }
          : null;
      } catch {
        initialVerification = null;
      }
    }
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Circle data is unavailable">
                The database could not provide this circle right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!circle) notFound();

  let participation = { watcherCount: 0, verificationCount: 0, approvedContributionCount: 0 };
  try {
    participation = await getCircleParticipation(circle.id);
  } catch {
    // Participation counts stay zeroed rather than blocking the circle.
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/discover">Discover</Link>
            <span>/</span>
            <span>{circle.name}</span>
          </nav>

          <header className="circle-identity">
            <div>
              <StatusPill tone={circle.state === "education" ? "blue" : "muted"}>
                {circle.stateLabel}
              </StatusPill>
              <h1>{circle.name}</h1>
              <p className="circle-identity-meta">
                {circle.ecosystemLabel} · {circle.category} · {circle.sourceStatus}
              </p>
              <p>{circle.summary}</p>
            </div>
            <div className="circle-page-actions">
              <WatchButton circleSlug={circle.slug} initialWatched={circle.watched} />
              <span className="control-note">
                Watching is a persisted Vicus relationship, not proof of ownership.
              </span>
            </div>
          </header>

          <AssetPassport circle={circle} />

          {circle.verification.enabled && circle.verification.assetCode && circle.verification.network ? (
            <RoleVerification
              circleSlug={circle.slug}
              circleName={circle.name}
              assetCode={circle.verification.assetCode}
              network={circle.verification.network}
              sourceUrl={circle.verification.sourceUrl}
              initialAuthenticated={authenticated}
              initialVerification={initialVerification}
            />
          ) : (
            <section className="content-panel role-deferred-panel" aria-labelledby="role-deferred-title">
              <Eyebrow>Role verification</Eyebrow>
              <h2 id="role-deferred-title">Watch and learn, without a live check.</h2>
              <p>
                {circle.ecosystem === "stellar"
                  ? "This circle does not have an enabled classic Stellar asset check. No wallet, balance, or issuer approval is inferred here."
                  : `Onchain holder verification for ${circle.ecosystemLabel} is not supported yet. Watch, Passport, missions, and Stellar-settled rewards remain available; no wallet, balance, or holder status is inferred here.`}
              </p>
            </section>
          )}

          <section className="circle-section" id="missions">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Missions</Eyebrow>
                <h2>Participate with a record.</h2>
              </div>
              <p>
                Real missions for this circle, with your authenticated submission state. Approval creates
                offchain Vicus points only.
              </p>
            </div>
            <div className="mission-grid">
              {circle.missions.length > 0 ? (
                circle.missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)
              ) : (
                <EmptyState title="No missions configured">
                  This circle has no mission records yet. No fallback mission is being shown.
                </EmptyState>
              )}
            </div>
          </section>

          <section className="circle-section" id="participation">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Participation</Eyebrow>
                <h2>Derived state, nothing synthetic.</h2>
              </div>
              <p>Counts only — no chat, no comments, no synthetic users, no wallet identities.</p>
            </div>
            <div className="profile-metrics">
              <MetricCard
                detail="Persisted Watch relationships"
                label="Watchers"
                value={String(participation.watcherCount)}
              />
              <MetricCard
                detail="Approved mission responses in this circle"
                label="Contributions"
                value={String(participation.approvedContributionCount)}
              />
              <MetricCard
                detail="Supported persisted Stellar role checks"
                label="Verified roles"
                value={String(participation.verificationCount)}
                accent
              />
            </div>
            <div className="content-panel" style={{ marginTop: 16 }}>
              {circle.activity.length > 0 ? (
                <div className="activity-list">
                  {circle.activity.map((activity) => (
                    <ActivityItem key={activity.id} {...activity} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No activity yet">
                  This circle has no activity events in the database.
                </EmptyState>
              )}
            </div>
          </section>

          <section className="circle-section" id="sources">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Official sources & disclosures</Eyebrow>
                <h2>Check, don&apos;t trust.</h2>
              </div>
              <p>{circle.riskNote}</p>
            </div>
            <div className="content-panel">
              <Eyebrow>Sources</Eyebrow>
              <p>
                {circle.issuerSource}. {circle.sourceStatus}.{" "}
                {circle.verification.enabled
                  ? "The role check uses the canonical asset identifiers stored for this circle and returns a role without exposing an exact balance."
                  : "Role verification remains deferred here; this page is watch-and-learn only."}
              </p>
              {circle.sourceUrl ? (
                <a className="source-link" href={circle.sourceUrl} rel="noreferrer" target="_blank">
                  {circle.sourceLabel} <Icon name="external" size={14} />
                </a>
              ) : (
                <span className="source-status">No source is attached to this education-only circle.</span>
              )}
              <div className="section-note" style={{ marginTop: 12 }}>
                Eligibility: {circle.eligibilityNote} Watch is never proof of ownership. Pasted-address
                checks are read-only and never stored.
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
