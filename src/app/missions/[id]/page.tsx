import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DataState,
  Eyebrow,
  Icon,
  StatusPill,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { MissionExperience } from "@/components/mission-experience";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getMissionById } from "@/lib/data/missions";
import { WalletConnectPrompt } from "@/components/wallet-auth";

type MissionPageProps = {
  params: Promise<{ id: string }>;
};

function missionWindowLabel(mission: {
  availability: string;
  startsAt: string | null;
  endsAt: string | null;
}) {
  if (mission.availability === "scheduled" && mission.startsAt) {
    return `Opens ${mission.startsAt.slice(0, 10)}`;
  }

  if (mission.endsAt) {
    return `Closes ${mission.endsAt.slice(0, 10)}`;
  }

  return mission.availability === "open" ? "Open until further notice" : "Not accepting responses";
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: MissionPageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const mission = await getMissionById(id);
    return {
      title: mission?.title ?? "Mission",
      description: mission?.description,
    };
  } catch {
    return { title: "Mission" };
  }
}

export default async function MissionPage({ params }: MissionPageProps) {
  const { id } = await params;
  let mission;

  try {
    const session = await getCurrentSession();
    mission = await getMissionById(id, session?.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="missions">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Mission data is unavailable">
                The database could not provide this mission right now. No submission was changed.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!mission) {
    notFound();
  }

  return (
    <AppShell active="missions">
      <main className="page-main">
        <header className="mission-page-header">
          <div className="shell">
            <div className="breadcrumbs">
              <Link href={`/circles/${mission.circle.slug}`}>{mission.circle.name}</Link>
              <span>/</span>
              <span>{mission.title}</span>
            </div>
            <div className="mission-page-header-grid">
              <div>
                <StatusPill tone={mission.availability === "open" ? "green" : "muted"}>
                  {mission.availability === "open" ? "Open mission" : mission.availability}
                </StatusPill>
                <h1>{mission.title}</h1>
                <p>{mission.description}</p>
              </div>
              <div className="mission-participation-identity">
                <Eyebrow>Participation identity</Eyebrow>
                {mission.viewer.authenticated ? (
                  <>
                    <strong>@{mission.viewer.handle}</strong>
                    <span>Signed in with a verified Stellar mainnet wallet</span>
                  </>
                ) : (
                  <>
                    <strong>Connect to participate</strong>
                    <span>No wallet is linked to this browser session</span>
                  </>
                )}
                <span>Cannot authorize money movement</span>
              </div>
            </div>
          </div>
        </header>

        <div className="shell mission-page-body">
          <div className="mission-detail-grid">
            <section className="content-panel">
              <Eyebrow>Mission brief</Eyebrow>
              <h2>Understand the reason before you respond.</h2>
              <p>{mission.description}</p>
              <dl className="mission-detail-meta">
                <div>
                  <dt>Circle</dt>
                  <dd>{mission.circle.name}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{mission.type}</dd>
                </div>
                <div>
                  <dt>Points</dt>
                  <dd>{mission.points} Vicus points</dd>
                </div>
                <div>
                  <dt>Review</dt>
                  <dd>{mission.reviewMode === "manual" ? "Manual review" : "Automatic grading"}</dd>
                </div>
                <div>
                  <dt>Mission window</dt>
                  <dd>{missionWindowLabel(mission)}</dd>
                </div>
              </dl>
            </section>
            <section className="content-panel mission-boundary-panel">
              <Eyebrow>Eligibility and boundaries</Eyebrow>
              <h2>Participation is offchain.</h2>
              <p>{mission.eligibilityNote}</p>
              <p>{mission.rewardNote}</p>
              <div className="section-note">
                Approval creates no wallet state, claimable balance, transaction, or financial value.
              </div>
            </section>
          </div>

          <MissionExperience mission={mission} />

          {!mission.viewer.authenticated ? <WalletConnectPrompt /> : null}

          <div className="mission-page-footer">
            <Icon name="lock" size={15} />
            <span>Responses are stored against the signed-in Vicus account. Wallet signing never submits a transaction or moves funds.</span>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
