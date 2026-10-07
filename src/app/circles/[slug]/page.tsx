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
  MissionCard,
  RewardState,
  StatusPill,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WatchButton } from "@/components/watch-button";
import { RoleVerification } from "@/components/role-verification";
import { getCircleBySlug } from "@/lib/data/circles";

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

  try {
    const session = await getCurrentSession();
    circle = await getCircleBySlug(slug, session?.user.id);
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

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="circle-page-header">
          <div className="shell">
            <div className="breadcrumbs">
              <Link href="/discover">Discover</Link>
              <span>/</span>
              <span>{circle.name}</span>
            </div>
            <div className="circle-page-header-grid">
              <div>
                <StatusPill tone={circle.state === "education" ? "blue" : "muted"}>
                  {circle.stateLabel}
                </StatusPill>
                <h1>{circle.name}</h1>
                <p>{circle.description}</p>
              </div>
              <div className="circle-page-actions">
                <WatchButton circleSlug={circle.slug} initialWatched={circle.watched} />
                <span className="control-note">
                  Watching is a persisted Vicus relationship, not proof of ownership.
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          <AssetPassport circle={circle} />

          <div className="circle-detail-grid">
            <section className="content-panel">
              <Eyebrow>Issuer / source</Eyebrow>
              <h2>Start with what can be checked.</h2>
              <p>
                {circle.issuerSource}. {circle.verification.enabled
                  ? "The role check uses the canonical asset identifiers stored for this circle."
                  : "Role verification remains deferred here; this page is watch-and-learn only."}
              </p>
              {circle.sourceUrl ? (
                <a className="source-link" href={circle.sourceUrl} rel="noreferrer" target="_blank">
                  {circle.sourceLabel} <Icon name="external" size={14} />
                </a>
              ) : (
                <span className="source-status">No source is attached to this education-only circle.</span>
              )}
            </section>
            <section className="content-panel source-panel">
              <div>
                <Eyebrow>Supported Vicus actions</Eyebrow>
                <h2>Clear steps, no hidden state.</h2>
              </div>
              <ul className="action-list">
                {circle.actions.map((action) => (
                  <li key={action}>
                    <Icon name="check" size={15} /> {action}
                  </li>
                ))}
                {!circle.verification.enabled ? (
                  <li>
                    <Icon name="lock" size={15} /> Role verification · deferred
                  </li>
                ) : null}
              </ul>
            </section>
          </div>

          {circle.verification.enabled && circle.verification.assetCode && circle.verification.network ? (
            <RoleVerification
              circleSlug={circle.slug}
              assetCode={circle.verification.assetCode}
              network={circle.verification.network}
              sourceUrl={circle.verification.sourceUrl}
            />
          ) : (
            <section className="content-panel role-deferred-panel" aria-labelledby="role-deferred-title">
              <Eyebrow>Role verification</Eyebrow>
              <h2 id="role-deferred-title">Watch and learn, without a live check.</h2>
              <p>
                This circle does not have an enabled classic Stellar asset check. No wallet, balance,
                or issuer approval is inferred here.
              </p>
            </section>
          )}

          <section className="circle-section" id="missions">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Learn and participate</Eyebrow>
                <h2>Missions with a reason to exist.</h2>
              </div>
              <p>Quiz results are automatic; text contributions wait for admin review. No blockchain rewards are live.</p>
            </div>
            <div className="mission-grid">
              {circle.missions.length > 0 ? (
                circle.missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)
              ) : (
                <EmptyState title="No missions configured">
                  This circle has no mission records yet. No fallback mission is being shown.
                </EmptyState>
              )}
              <div className="content-panel">
                <Eyebrow>Eligibility note</Eyebrow>
                <h2>Understand the boundary.</h2>
                <p>{circle.eligibilityNote}</p>
                <div className="section-note">
                  Mission state is stored in Neon. Approval creates offchain Vicus points only; it does not
                  create a wallet transaction or reward claim.
                </div>
              </div>
            </div>
          </section>

          <section className="circle-section" id="pulse">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Pulse</Eyebrow>
                <h2>Activity with provenance.</h2>
              </div>
              <p>No live feed is connected to this static circle.</p>
            </div>
            <div className="circle-lower-grid">
              <div className="content-panel">
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
              <div className="content-panel">
                <Eyebrow>Community / contributors</Eyebrow>
                <h2>Useful contributions have a home.</h2>
                <EmptyState title="No live contributors yet">
                  No connected submissions or approved research are associated with this circle yet.
                  Approved mission responses remain explicit about their review state.
                </EmptyState>
              </div>
            </div>
          </section>

          <section className="circle-section" id="reward-state">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Reward state</Eyebrow>
                <h2>Nothing is claimed by implication.</h2>
              </div>
              <p>{circle.riskNote}</p>
            </div>
            <div className="circle-lower-grid">
              <RewardState />
              <div className="content-panel">
                <Eyebrow>Privacy by default</Eyebrow>
                <h2>Show a role, not a balance.</h2>
                <p>
                  {circle.verification.enabled
                    ? "The optional check returns a role without exposing an exact balance or unrelated assets."
                    : "Future verification can return the minimum result needed for a circle or campaign."} Public
                  profile fixtures never display an exact wallet balance.
                </p>
                <div className="role-card-footer">
                  <Icon name="lock" size={15} /> {circle.verification.enabled
                    ? "No wallet connection or address is saved."
                    : "Address reads and settlement are not wired."}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
