import type { Metadata } from "next";
import Link from "next/link";
import {
  ButtonLink,
  DataState,
  EmptyState,
  Eyebrow,
  MetricCard,
  StatusPill,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { ProfileEditor } from "@/components/profile-editor";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { RewardClaimCard } from "@/components/reward-claim-card";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession, isSessionUnavailableError } from "@/lib/auth/session";
import { listEcosystems } from "@/lib/data/circles";
import { getUserProfileById } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My profile",
  description: "Authenticated Vicus profile and mission contribution history.",
};

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function contributionStatusLabel(status: string) {
  return status === "needs_revision"
    ? "Needs revision"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VC";
}

type ProfileActivity = {
  kind: "WATCHED" | "MISSION" | "REWARD";
  title: string;
  detail: string;
  date: Date;
};

export default async function MyProfilePage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error) || isSessionUnavailableError(error)) {
      return (
        <AppShell active="profile">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Session temporarily unavailable">
                Vicus could not verify the current session right now. Your wallet has not been disconnected.
                <br />
                <Link className="button button-outline button-small" href="/profile/me">Retry session lookup</Link>
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session) {
    return (
      <AppShell active="profile">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Connect a wallet to view your profile">
              Your profile is created only after Vicus verifies a signed Stellar mainnet message.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let profile;
  try {
    profile = await getUserProfileById(session.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="profile">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Profile data temporarily unavailable">
                The database could not provide this profile right now. No fallback profile is shown.
                <br />
                <Link className="button button-outline button-small" href="/profile/me">Retry profile load</Link>
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
      <AppShell active="profile">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Profile not found">The signed-in Vicus account is no longer available.</DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  const displayName = profile.user.displayName === "Stellar member" ? "Vicus member" : profile.user.displayName;
  const primaryWallet = profile.wallets[0]?.publicKey;
  let ecosystems: Array<{ value: string; label: string }> = [];
  try {
    ecosystems = await listEcosystems();
  } catch {
    ecosystems = [];
  }
  const activity: ProfileActivity[] = [
    ...profile.memberships.map((membership) => ({
      kind: "WATCHED" as const,
      title: `Started watching ${membership.circle.name}`,
      detail: membership.circle.ecosystemLabel,
      date: membership.joinedAt,
    })),
    ...profile.contributions.map((contribution) => ({
      kind: "MISSION" as const,
      title: `${contributionStatusLabel(contribution.status)} · ${contribution.missionTitle}`,
      detail: `${contribution.circleName} · ${contribution.status === "approved" ? `+${contribution.points} Vicus points` : "Review state recorded"}`,
      date: contribution.reviewedAt ?? contribution.submittedAt,
    })),
    ...profile.rewards
      .filter((reward) => reward.status === "confirmed" && reward.confirmedAt)
      .map((reward) => ({
        kind: "REWARD" as const,
        title: `Claimed ${reward.amount} XLM`,
        detail: `${reward.missionTitle} · ${reward.network === "testnet" ? "Stellar Testnet" : "Stellar Public Network"}`,
        date: new Date(reward.confirmedAt as string),
      })),
  ].sort((left, right) => right.date.getTime() - left.date.getTime());
  const attentionRewards = profile.rewards.filter((reward) => ["eligible", "claimable", "submitted", "failed"].includes(reward.status));
  const confirmedRewards = profile.rewards.filter((reward) => reward.status === "confirmed" && reward.id);
  const verifiedRoles = profile.memberships.filter((membership) => ["verified-holder", "verified-trustline"].includes(membership.role));

  return (
    <AppShell active="profile">
      <main className="page-main">
        <header className="profile-header">
          <div className="shell">
            <Eyebrow>Authenticated profile</Eyebrow>
            <div className="profile-header-grid">
              <div className="profile-identity">
                <div aria-hidden="true" className="avatar-orb">{initials(displayName)}</div>
                <div>
                  <h1>{displayName}</h1>
                  <div className="profile-identity-meta">
                    {primaryWallet ? <span className="profile-wallet-address">{shortenAddress(primaryWallet)}</span> : null}
                    <span className="profile-verified-status">
                      <span aria-hidden="true" className="verified-indicator" />
                      Stellar wallet verified
                    </span>
                  </div>
                  {profile.user.bio ? <p className="profile-bio">{profile.user.bio}</p> : null}
                  <ProfileEditor
                    initialAssetInterests={profile.user.assetInterests}
                    initialBio={profile.user.bio ?? ""}
                    initialDisplayName={displayName}
                    initialPreferredEcosystems={profile.user.preferredEcosystems}
                    ecosystems={ecosystems}
                  />
                  {[...profile.user.preferredEcosystems.map((value) => ecosystems.find((item) => item.value === value)?.label ?? value), ...profile.user.assetInterests].length > 0 ? (
                    <div className="profile-preference-chips" aria-label="Profile preferences">
                      {[...profile.user.preferredEcosystems.map((value) => ecosystems.find((item) => item.value === value)?.label ?? value), ...profile.user.assetInterests].map((preference) => (
                        <span className="profile-preference-chip" key={preference}>{preference}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="shell profile-body">
          <div className="profile-metrics">
            <MetricCard detail="Active watched-asset relationships" label="Watched assets" value={String(profile.memberships.length)} />
            <MetricCard detail="Approved participation · offchain" label="Vicus points" value={String(profile.approvedPoints)} accent />
            <MetricCard detail="Pending, approved, and reviewed records" label="Contributions" value={String(profile.contributions.length)} />
            <MetricCard detail="Eligible and claimed reward states" label="Rewards" value={String(profile.rewards.length)} />
          </div>

          <section className="hairline-card profile-watched-panel">
            <div className="profile-reward-heading">
              <div>
                <Eyebrow>Watched assets</Eyebrow>
                <h2>Keep the Circles that matter close.</h2>
              </div>
              <ButtonLink href="/discover" variant="text">Discover assets</ButtonLink>
            </div>
            {profile.memberships.length > 0 ? (
              <div className="fixture-list">
                {profile.memberships.map((membership) => (
                  <div className="fixture-row" key={membership.id}>
                    <span className="fixture-row-main">
                      <Link href={`/circles/${membership.circle.slug}`}>
                        <strong>{membership.circle.name}</strong>
                      </Link>
                      <span>{membership.circle.ecosystemLabel} · {membership.circle.category} · {membership.circle.stateLabel}</span>
                    </span>
                    <StatusPill tone="violet">Watching</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="You are not watching any assets yet">
                Discover an Asset Circle to start following it in Vicus.
                <ButtonLink href="/discover" variant="outline">Discover assets</ButtonLink>
              </EmptyState>
            )}
          </section>

          <section className="hairline-card profile-panel profile-activity-panel">
            <Eyebrow>Your activity</Eyebrow>
            <h2>Watch, learn, contribute, repeat.</h2>
            {activity.length > 0 ? (
              <div className="profile-activity-list">
                {activity.map((item, index) => (
                  <div className="profile-activity-row" key={`${item.kind}-${item.title}-${item.date.toISOString()}-${index}`}>
                    <span className="profile-activity-kind">{item.kind}</span>
                    <span className="profile-activity-main">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <time dateTime={item.date.toISOString()}>{item.date.toISOString().slice(0, 10)}</time>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No activity yet">Watch an asset or start a mission to build your Vicus history.</EmptyState>
            )}
          </section>

          {attentionRewards.length > 0 ? (
            <section className="hairline-card profile-reward-panel">
              <div className="profile-reward-heading">
                <div>
                  <Eyebrow>Reward action</Eyebrow>
                  <h2>A reward is ready for your next step.</h2>
                </div>
                <span className="field-help">Native XLM only · network shown on every reward</span>
              </div>
              <div className="profile-reward-list">
                {attentionRewards.map((reward) => <RewardClaimCard key={reward.submissionId} reward={reward} />)}
              </div>
            </section>
          ) : null}

          <div className="profile-section-grid">
            <section className="hairline-card profile-panel">
              <Eyebrow>Verified roles</Eyebrow>
              <h2>Proof when a role is supported.</h2>
              {verifiedRoles.length > 0 ? (
                <div className="fixture-list">
                  {verifiedRoles.map((membership) => (
                    <div className="fixture-row" key={membership.id}>
                      <span className="fixture-row-main">
                        <strong>{membership.role}</strong>
                        <span>{membership.circle.name} · {membership.circle.ecosystemLabel}</span>
                      </span>
                      <StatusPill tone="green">Verified</StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No onchain roles verified yet">
                  Supported Stellar role checks will appear here when they are recorded for this account.
                </EmptyState>
              )}
            </section>

            <section className="hairline-card profile-panel">
              <Eyebrow>Mission contributions</Eyebrow>
              <h2>Understanding has a record.</h2>
              {profile.contributions.length > 0 ? (
                <div className="contribution-list">
                  {profile.contributions.map((contribution) => (
                    <Link className="contribution-row" href={`/missions/${contribution.missionId}`} key={contribution.id}>
                      <span className="contribution-row-main">
                        <strong>{contribution.missionTitle}</strong>
                        <span>{contribution.circleName} · {contribution.submittedAt.toISOString().slice(0, 10)}</span>
                      </span>
                      <span className="contribution-row-state">
                        <StatusPill tone={contribution.status === "approved" ? "green" : contribution.status === "pending" ? "blue" : contribution.status === "needs_revision" ? "violet" : "muted"}>
                          {contributionStatusLabel(contribution.status)}
                        </StatusPill>
                        <small>{contribution.status === "approved" ? `${contribution.points} points` : "0 points until approval"}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mission submissions yet">Start an open mission from a circle to create a contribution record.</EmptyState>
              )}
            </section>
          </div>

          <section className="hairline-card profile-panel reward-history-panel">
            <Eyebrow>Reward history</Eyebrow>
            <h2>Earned participation, clearly.</h2>
            {confirmedRewards.length > 0 ? (
              <div className="fixture-list">
                {confirmedRewards.map((reward) => (
                  <div className="fixture-row" key={reward.id}>
                    <span className="fixture-row-main">
                      <strong>{reward.amount} XLM</strong>
                      <span>{reward.missionTitle} · {reward.network === "testnet" ? "Stellar Testnet" : "Stellar Public Network"}</span>
                    </span>
                    <Link className="mission-action-link" href={`/rewards/${reward.id}`}>View receipt</Link>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No confirmed rewards yet">
                Eligible rewards become history after a real settlement is confirmed.
              </EmptyState>
            )}
          </section>

          <section className="hairline-card profile-panel profile-wallet-security">
            <Eyebrow>Wallet &amp; security</Eyebrow>
            <h2>Proof without exposure.</h2>
            <div className="fixture-row">
              <span className="fixture-row-main">
                <strong>{primaryWallet ? shortenAddress(primaryWallet) : "No wallet linked"}</strong>
                <span>{primaryWallet ? "Stellar mainnet · verified wallet control" : "Connect a wallet to link identity"}</span>
              </span>
              {primaryWallet ? <StatusPill tone="green">Verified</StatusPill> : null}
            </div>
            <p className="profile-contribution-copy">
              Vicus stores the linked public key, never a secret or balance. Role checks return only the minimum result needed for supported Circles.
            </p>
          </section>

          <section className="profile-boundary-note">
            Vicus points stay offchain. They are derived participation state, not money, a claimable balance, or a blockchain reward.
          </section>
        </div>
      </main>
    </AppShell>
  );
}
