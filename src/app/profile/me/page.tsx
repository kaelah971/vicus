import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, DataState, EmptyState, Icon, StatusPill } from "@/components/vicus";
import { AssetToken, Avatar, GlowField, MetricTile, Orb, SectionHead, StepFlow } from "@/components/vicus-ui";
import { AppShell } from "@/components/app-shell";
import { ProfileEditor } from "@/components/profile-editor";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { RewardClaimCard } from "@/components/reward-claim-card";
import { ReceiveSettings } from "@/components/receive-settings";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession, isSessionUnavailableError } from "@/lib/auth/session";
import { getFollowCounts } from "@/lib/social/service";
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

type ProfileActivity = {
  kind: "WATCHED" | "MISSION" | "REWARD" | "ROLE";
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
    ...profile.verifiedRoles.map((entry) => ({
      kind: "ROLE" as const,
      title: `Verified ${entry.role === "verified-holder" ? "Holder" : "Trustline"} · ${entry.circle.name}`,
      detail: `${entry.ecosystem === "stellar" ? "Stellar" : entry.ecosystem} · Last verified ${entry.lastCheckedAt.toISOString().slice(0, 10)}`,
      date: entry.lastCheckedAt,
    })),
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
  const verifiedRoles = profile.verifiedRoles;
  let followCounts = { followers: 0, following: 0 };
  try {
    followCounts = await getFollowCounts(profile.user.id);
  } catch {
    followCounts = { followers: 0, following: 0 };
  }

  function verifiedRoleLabel(role: string) {
    if (role === "verified-holder") return "Verified Holder";
    if (role === "verified-trustline") return "Verified Trustline";
    return role;
  }

  // Journey derived only from recorded activity — nothing is marked complete without a record.
  const approvedTypes = new Set(
    profile.contributions.filter((contribution) => contribution.status === "approved").map((contribution) => contribution.missionType),
  );
  const journeyDone = {
    discover: profile.memberships.length > 0,
    learn: approvedTypes.has("quiz"),
    use: verifiedRoles.length > 0 || approvedTypes.has("onchain_action"),
    contribute: approvedTypes.has("text") || approvedTypes.has("research"),
    earn: confirmedRewards.length > 0 || profile.approvedPoints > 0,
  };
  const journeyOrder = ["discover", "learn", "use", "contribute", "earn"] as const;
  const nextStep = journeyOrder.find((key) => !journeyDone[key]);
  const journeyState = (key: (typeof journeyOrder)[number]) =>
    journeyDone[key] ? ("done" as const) : key === nextStep ? ("active" as const) : ("todo" as const);
  const preferences = [
    ...profile.user.preferredEcosystems.map((value) => ecosystems.find((item) => item.value === value)?.label ?? value),
    ...profile.user.assetInterests,
  ];
  const activityIcon = { WATCHED: "eye", MISSION: "target", REWARD: "gift", ROLE: "shield" } as const;
  const activityTone = { WATCHED: "violet", MISSION: "blue", REWARD: "white", ROLE: "green" } as const;

  return (
    <AppShell active="profile">
      <main className="page-main">
        <header className="profile-header p-hero">
          <GlowField tones={["violet", "white"]} />
          <div className="shell">
            <div className="p-identity">
              <Avatar name={displayName} size="lg" tone="violet" />
              <div className="p-identity-main">
                <h1>{displayName}</h1>
                <div className="profile-identity-meta">
                  <span className="p-handle">@{profile.user.handle}</span>
                  {primaryWallet ? <span className="profile-wallet-address">{shortenAddress(primaryWallet)}</span> : null}
                  <span className="profile-verified-status">
                    <span aria-hidden="true" className="verified-indicator" />
                    Stellar wallet verified
                  </span>
                </div>
                {profile.user.bio ? <p className="profile-bio">{profile.user.bio}</p> : null}
                {preferences.length > 0 ? (
                  <div className="profile-preference-chips" aria-label="Profile preferences">
                    {preferences.map((preference) => (
                      <span className="v-chip" key={preference}>{preference}</span>
                    ))}
                  </div>
                ) : null}
                <div className="p-identity-actions">
                  <ProfileEditor
                    initialAssetInterests={profile.user.assetInterests}
                    initialBio={profile.user.bio ?? ""}
                    initialDisplayName={displayName}
                    initialPreferredEcosystems={profile.user.preferredEcosystems}
                    ecosystems={ecosystems}
                  />
                  <Link className="v-text-link" href={`/u/${profile.user.handle}`}>
                    Public profile <Icon name="arrow-right" size={14} />
                  </Link>
                </div>
              </div>
            </div>
            <div className="p-metrics">
              <MetricTile hint="Approved participation · offchain" icon="star" label="Points" tone="white" value={String(profile.approvedPoints)} />
              <MetricTile icon="chat" label="Contributions" tone="pink" value={String(profile.contributions.length)} />
              <MetricTile icon="users" label="Followers" tone="blue" value={String(followCounts.followers)} />
              <MetricTile icon="gift" label="Rewards" tone="green" value={String(profile.rewards.length)} />
              <MetricTile icon="eye" label="Watching" tone="violet" value={String(profile.memberships.length)} />
              <MetricTile icon="user" label="Following" tone="orange" value={String(followCounts.following)} />
            </div>
          </div>
        </header>

        <div className="shell profile-body">
          <section className="p-journey" aria-labelledby="journey-title">
            <div className="p-journey-head">
              <span className="v-eyebrow">Your journey</span>
              <h2 id="journey-title">{nextStep ? "Keep going." : "Full loop complete."}</h2>
            </div>
            <StepFlow
              label="Participation progress"
              steps={[
                { icon: "compass", label: "Discover", line: journeyDone.discover ? "Watching assets" : "Watch an asset", tone: "blue", state: journeyState("discover") },
                { icon: "book", label: "Learn", line: journeyDone.learn ? "Quiz approved" : "Pass a quiz", tone: "violet", state: journeyState("learn") },
                { icon: "bolt", label: "Use", line: journeyDone.use ? "Proven onchain" : "Verify or activate", tone: "green", state: journeyState("use") },
                { icon: "chat", label: "Contribute", line: journeyDone.contribute ? "Contribution approved" : "Write or research", tone: "pink", state: journeyState("contribute") },
                { icon: "gift", label: "Earn", line: journeyDone.earn ? "Points earned" : "Earn points", tone: "white", state: journeyState("earn") },
              ]}
            />
          </section>

          <section className="p-section" id="rewards" aria-labelledby="rewards-title">
            <SectionHead eyebrow="Rewards" id="rewards-title" line="Native XLM only · network shown on every reward." title="Your rewards" />
            {attentionRewards.length > 0 ? (
              <div className="profile-reward-list">
                {attentionRewards.map((reward) => <RewardClaimCard key={reward.submissionId} reward={reward} />)}
              </div>
            ) : null}
            {confirmedRewards.length > 0 ? (
              <div className="v-list">
                {confirmedRewards.map((reward) => (
                  <Link className="v-row" href={`/rewards/${reward.id}`} key={reward.id}>
                    <Orb icon="gift" size="md" tone="white" />
                    <span className="v-row-main">
                      <strong>{reward.amount} XLM</strong>
                      <small>{reward.missionTitle} · {reward.network === "testnet" ? "Stellar Testnet" : "Stellar Public Network"}</small>
                    </span>
                    <span className="v-text-link">Receipt</span>
                  </Link>
                ))}
              </div>
            ) : attentionRewards.length === 0 ? (
              <EmptyState title="No rewards yet">Reward-enabled missions unlock XLM after approval.</EmptyState>
            ) : null}
          </section>

          <section className="p-section" aria-labelledby="watched-title">
            <SectionHead
              action={<span className="row"><ButtonLink href="/watch" variant="glass">Watch Center</ButtonLink><ButtonLink href="/discover" variant="glass">Explore assets</ButtonLink></span>}
              eyebrow="Watching"
              id="watched-title"
              title="Your assets"
            />
            {profile.memberships.length > 0 ? (
              <div className="x-rail">
                {profile.memberships.map((membership) => (
                  <Link className="p-asset" href={`/circles/${membership.circle.slug}`} key={membership.id}>
                    <AssetToken code={membership.circle.code} ecosystem={membership.circle.ecosystem} size="md" />
                    <span>
                      <strong>{membership.circle.name}</strong>
                      <small>{membership.circle.assetClassLabel ?? membership.circle.category} · {membership.circle.ecosystemLabel}</small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Not watching any assets yet">Watch an asset to keep it close.</EmptyState>
            )}
          </section>

          <section className="p-section" aria-labelledby="receive-title">
            <SectionHead
              action={<ButtonLink href="/contacts" variant="glass">Contacts</ButtonLink>}
              eyebrow="Receive"
              id="receive-title"
              line="Private. Nothing here is public until you enable it."
              title="Where you can receive"
            />
            <ReceiveSettings />
          </section>

          <div className="p-split">
            <section className="p-section" aria-labelledby="activity-title">
              <SectionHead eyebrow="Activity" id="activity-title" title="Timeline" />
              {activity.length > 0 ? (
                <ol className="p-timeline">
                  {activity.map((item, index) => (
                    <li key={`${item.kind}-${item.title}-${item.date.toISOString()}-${index}`}>
                      <Orb icon={activityIcon[item.kind]} size="sm" tone={activityTone[item.kind]} />
                      <span className="v-row-main">
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <time dateTime={item.date.toISOString()}>{item.date.toISOString().slice(0, 10)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title="No activity yet">Watch an asset or start a mission.</EmptyState>
              )}
            </section>

            <div className="p-side">
              <section className="p-section" aria-labelledby="contributions-title">
                <SectionHead eyebrow="Missions" id="contributions-title" title="Contributions" />
                {profile.contributions.length > 0 ? (
                  <div className="v-list">
                    {profile.contributions.map((contribution) => (
                      <Link className="v-row" href={`/missions/${contribution.missionId}`} key={contribution.id}>
                        <span className="v-row-main">
                          <strong>{contribution.missionTitle}</strong>
                          <small>{contribution.circleName} · {contribution.submittedAt.toISOString().slice(0, 10)}</small>
                        </span>
                        <span className="contribution-row-state">
                          <StatusPill tone={contribution.status === "approved" ? "green" : contribution.status === "pending" ? "blue" : contribution.status === "needs_revision" ? "violet" : "muted"}>
                            {contributionStatusLabel(contribution.status)}
                          </StatusPill>
                          <small>{contribution.status === "approved" ? `${contribution.points} pts` : "0 pts until approval"}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No submissions yet">Start an open mission to create a record.</EmptyState>
                )}
              </section>

              <section className="p-section" aria-labelledby="roles-title">
                <SectionHead eyebrow="Verified roles" id="roles-title" title="Proof" />
                {verifiedRoles.length > 0 ? (
                  <div className="v-list">
                    {verifiedRoles.map((entry) => (
                      <Link className="v-row" href={`/circles/${entry.circle.slug}`} key={entry.id}>
                        <Orb icon="shield" size="md" tone="green" />
                        <span className="v-row-main">
                          <strong>{verifiedRoleLabel(entry.role)} · {entry.circle.name}</strong>
                          <small>{entry.ecosystem === "stellar" ? "Stellar" : entry.ecosystem} · {entry.network} · {entry.lastCheckedAt.toISOString().slice(0, 10)}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No roles verified yet">Supported Stellar role checks appear here.</EmptyState>
                )}
              </section>

              <section className="p-section p-security" aria-labelledby="security-title">
                <div className="v-row">
                  <Orb icon="lock" size="md" tone="blue" />
                  <span className="v-row-main">
                    <strong id="security-title">{primaryWallet ? shortenAddress(primaryWallet) : "No wallet linked"}</strong>
                    <small>{primaryWallet ? "Stellar mainnet · verified wallet control" : "Connect a wallet to link identity"}</small>
                  </span>
                  {primaryWallet ? <StatusPill tone="green">Verified</StatusPill> : null}
                </div>
                <p className="profile-contribution-copy">
                  Vicus stores your public key — never a secret or balance. Points stay offchain: participation state, not money.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
