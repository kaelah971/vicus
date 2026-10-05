import type { Metadata } from "next";
import Link from "next/link";
import {
  AppShell,
  Badge,
  DataState,
  EmptyState,
  Eyebrow,
  Icon,
  MetricCard,
  RewardState,
  StatusPill,
} from "@/components/vicus";
import { isDatabaseUnavailableError } from "@/db";
import { getUserProfileByHandle } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo profile",
  description: "The unauthenticated demo participant profile for Vicus mission contributions.",
};

function badgeLabel(badgeType: string) {
  return badgeType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function badgeTone(badgeType: string): "violet" | "blue" | "muted" | "green" {
  if (badgeType.includes("research")) return "blue";
  if (badgeType.includes("early")) return "green";
  if (badgeType.includes("watch")) return "muted";
  return "violet";
}

function contributionStatusLabel(status: string) {
  if (status === "needs_revision") return "Needs revision";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function DemoProfilePage() {
  let profile;

  try {
    profile = await getUserProfileByHandle("demo");
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell>
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Profile data is unavailable">
                The database could not provide this profile right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!profile) {
    return (
      <AppShell>
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Demo profile not found">
              The requested profile does not exist in the database. No fallback profile is being shown.
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="page-main">
        <header className="profile-header">
          <div className="shell">
            <Eyebrow>Public profile</Eyebrow>
            <div className="profile-header-grid">
              <div className="profile-identity">
                <div aria-hidden="true" className="avatar-orb">VC</div>
                <div>
                  <h1>{profile.user.displayName}</h1>
                  <p>@{profile.user.handle} · demo participant · not authenticated · no wallet linked</p>
                </div>
              </div>
              <p className="fixture-note">
                Demo participant identity only. It is not authenticated, is not linked to a wallet, and
                cannot authorize money movement. Mission points are offchain Vicus participation state.
              </p>
            </div>
          </div>
        </header>

        <div className="shell profile-body">
          <div className="profile-metrics">
            <MetricCard
              detail="Seeded preview memberships"
              label="Circles watched"
              value={String(profile.memberships.length)}
            />
            <MetricCard detail="Persistent asset-role records deferred" label="Verified roles" value="—" accent />
            <MetricCard detail="Approved mission points · offchain" label="Vicus points" value={String(profile.approvedPoints)} />
            <MetricCard detail="Pending, approved, and reviewed records" label="Contributions" value={String(profile.contributions.length)} />
          </div>

          <div className="profile-section-grid">
            <section className="hairline-card profile-panel">
              <Eyebrow>Circles watched</Eyebrow>
              <h2>Places to return to.</h2>
              <div className="fixture-list">
                {profile.memberships.length > 0 ? (
                  profile.memberships.map((membership) => (
                    <Link
                      className="fixture-row"
                      href={`/circles/${membership.circle.slug}`}
                      key={membership.id}
                    >
                      <span className="fixture-row-main">
                        <strong>{membership.circle.name}</strong>
                        <span>
                          {membership.role} · {membership.source} · seeded preview
                        </span>
                      </span>
                      <Icon name="arrow-up-right" size={16} />
                    </Link>
                  ))
                ) : (
                  <EmptyState title="No watched circles">
                    This profile has no active membership records in the database.
                  </EmptyState>
                )}
              </div>
            </section>

            <section className="hairline-card profile-panel">
              <Eyebrow>Role badges</Eyebrow>
              <h2>Proof without exposure.</h2>
              <div className="badge-rack">
                {profile.badges.length > 0 ? (
                  profile.badges.map((badge) => (
                    <Badge demo key={badge.id} tone={badgeTone(badge.badgeType)}>
                      {badgeLabel(badge.badgeType)}
                    </Badge>
                  ))
                ) : (
                  <StatusPill tone="muted">No badges</StatusPill>
                )}
              </div>
              <p className="admin-footnote">
                Role badges describe participation or contribution. Stellar verification remains
                separate from mission submissions, and no exact wallet balance is shown.
              </p>
            </section>
          </div>

          <div className="profile-section-grid">
            <section className="hairline-card profile-panel">
              <Eyebrow>Mission contributions</Eyebrow>
              <h2>Understanding has a record.</h2>
              {profile.contributions.length > 0 ? (
                <div className="contribution-list">
                  {profile.contributions.map((contribution) => (
                    <Link
                      className="contribution-row"
                      href={`/missions/${contribution.missionId}`}
                      key={contribution.id}
                    >
                      <span className="contribution-row-main">
                        <strong>{contribution.missionTitle}</strong>
                        <span>
                          {contribution.circleName} · {contribution.missionType} · {contribution.submittedAt.toISOString().slice(0, 10)}
                        </span>
                      </span>
                      <span className="contribution-row-state">
                        <StatusPill tone={contribution.status === "approved" ? "green" : contribution.status === "pending" ? "blue" : contribution.status === "needs_revision" ? "violet" : "muted"}>
                          {contributionStatusLabel(contribution.status)}
                        </StatusPill>
                        <small>
                          {contribution.status === "approved"
                            ? `${contribution.points} points`
                            : "0 points until approval"}
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mission submissions yet">
                  Start an open mission from a circle to create a contribution record.
                </EmptyState>
              )}
            </section>

            <section className="hairline-card profile-panel">
              <Eyebrow>Contribution state</Eyebrow>
              <h2>Useful work, reviewed clearly.</h2>
              <p className="profile-contribution-copy">
                Approved mission points are derived from approved submissions. They are an offchain
                Vicus participation score, not money or a blockchain reward.
              </p>
              {profile.contributions.some((contribution) => contribution.revisionReason) ? (
                <div className="profile-revision-list">
                  {profile.contributions.filter((contribution) => contribution.revisionReason).map((contribution) => (
                    <div className="profile-revision" key={`${contribution.id}-reason`}>
                      <span className="field-label">{contribution.missionTitle}</span>
                      <p>{contribution.revisionReason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="section-note">Review notes appear here when a response needs revision or is rejected.</div>
              )}
            </section>
          </div>

          <section className="hairline-card profile-panel reward-history-panel" id="reward-history">
            <Eyebrow>Reward history</Eyebrow>
            <h2>Receipts should tell the whole story.</h2>
            <RewardState />
          </section>
        </div>
      </main>
    </AppShell>
  );
}
