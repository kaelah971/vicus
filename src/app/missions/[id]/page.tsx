import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataState, Icon, StatusPill } from "@/components/vicus";
import { Avatar, Chip, GlowField, MetricTile, Orb, StepFlow, EdgeLight, edgeClass, missionTypeMeta } from "@/components/vicus-ui";
import { rewardNetworkLabel } from "@/lib/rewards/display";
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

  const typeMeta = missionTypeMeta(mission.type);
  const isActivation = mission.type === "onchain_action";
  const hasReward = !mission.rewardNote.startsWith("No reward");
  // Stored amounts carry fixed precision ("0.0500000 XLM"); show them the way the rest of Vicus does.
  const rewardDisplay = mission.rewardNote.replace(/^(\d+)\.(\d*?)0+(?=\s)/, (_, whole: string, fraction: string) =>
    fraction ? `${whole}.${fraction}` : whole,
  );
  const rewardNetwork = rewardNetworkLabel();

  return (
    <AppShell active="missions">
      <main className="page-main">
        <header className={`mission-page-header md-hero tone-${typeMeta.tone}`}>
          <GlowField tones={[typeMeta.tone, "violet"]} />
          <div className="shell">
            <div className="breadcrumbs">
              <Link href="/missions">Missions</Link>
              <span>/</span>
              <Link href={`/circles/${mission.circle.slug}`}>{mission.circle.name}</Link>
            </div>
            <div className="md-identity">
              <Orb icon={typeMeta.icon} size="lg" tone={typeMeta.tone} />
              <div>
                <div className="c-chips">
                  <Chip tone={typeMeta.tone}>{typeMeta.label}</Chip>
                  <StatusPill tone={mission.availability === "open" ? "green" : "muted"}>
                    {mission.availability === "open" ? "Open" : mission.availability}
                  </StatusPill>
                  {isActivation ? <Chip icon="globe">Proof · Stellar Mainnet</Chip> : null}
                </div>
                <h1>{mission.title}</h1>
                <p>{mission.description}</p>
              </div>
            </div>
            <div className={`md-panel${isActivation ? ` ${edgeClass("live")} tone-green` : ""}`}>
              {isActivation ? <EdgeLight /> : null}
              {isActivation ? (
                <StepFlow
                  label="Activation steps"
                  steps={[
                    { icon: "bolt", label: "Use", line: "Do it onchain", tone: "green" },
                    { icon: "shield", label: "Prove", line: "Paste the transaction", tone: "blue" },
                    { icon: "gift", label: "Earn", line: `${mission.points} pts${hasReward ? ` + ${rewardDisplay}` : ""}`, tone: "white" },
                  ]}
                  variant="compact"
                />
              ) : null}
              <div className="md-facts">
                <MetricTile icon="star" label="Vicus points" tone="violet" value={String(mission.points)} />
                <MetricTile
                  icon="gift"
                  label={hasReward ? `Reward · ${rewardNetwork ?? "Stellar"}` : "No XLM reward"}
                  tone="white"
                  value={hasReward ? rewardDisplay : "—"}
                />
                <MetricTile icon="check" label="Review" tone="blue" value={mission.reviewMode === "manual" ? "Manual" : "Automatic"} />
                <MetricTile
                  icon="target"
                  label={missionWindowLabel(mission)}
                  tone="green"
                  value={mission.availability === "open" ? "Open" : mission.availability.charAt(0).toUpperCase() + mission.availability.slice(1)}
                />
              </div>
            </div>
          </div>
        </header>

        <div className="shell mission-page-body">
          <div className="md-boundaries">
            <div className="md-identity-chip">
              <Avatar name={mission.viewer.handle ?? "Guest"} size="sm" />
              <span>
                <strong>{mission.viewer.authenticated ? `@${mission.viewer.handle}` : "Connect to participate"}</strong>
                <small>
                  {mission.viewer.authenticated ? "Verified Stellar mainnet wallet" : "No wallet linked to this session"} · cannot authorize money movement
                </small>
              </span>
            </div>
            <details className="md-more">
              <summary>
                Eligibility &amp; boundaries <Icon name="chevron-down" size={15} />
              </summary>
              <p>{mission.eligibilityNote}</p>
              <p>{mission.rewardNote}</p>
              <p>Points are offchain. Approval creates no wallet state, claimable balance, or financial value by itself.</p>
            </details>
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
