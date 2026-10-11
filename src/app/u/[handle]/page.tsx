import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ActivityItem,
  DataState,
  EmptyState,
  Eyebrow,
  MetricCard,
  StatusPill,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getPublicProfileByHandle } from "@/lib/social/service";
import { getUserCommunityContributions } from "@/lib/community/service";
import { FollowButton } from "@/components/follow-button";
import { personInitials } from "@/components/person-card";

type PublicProfilePageProps = {
  params: Promise<{ handle: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { handle } = await params;

  try {
    const profile = await getPublicProfileByHandle(handle);
    if (!profile) return { title: "Person" };
    return {
      title: `${profile.user.displayName} (@${profile.user.handle}) on Vicus`,
      description: profile.user.bio ?? `Public Vicus contributions by ${profile.user.displayName}.`,
    };
  } catch {
    return { title: "Person" };
  }
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { handle } = await params;
  let profile;
  let viewerId: string | null = null;

  try {
    const session = await getCurrentSession();
    viewerId = session?.user.id ?? null;
    profile = await getPublicProfileByHandle(handle, viewerId);
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

  if (!profile) notFound();

  let community: Awaited<ReturnType<typeof getUserCommunityContributions>> = [];
  try {
    community = await getUserCommunityContributions(profile.user.handle);
  } catch {
    community = [];
  }

  const isSelf = viewerId === profile.user.id;

  return (
    <AppShell>
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href="/people">People</Link>
                <span>/</span>
                <span>@{profile.user.handle}</span>
              </nav>
              <div aria-hidden="true" className="avatar-orb">
                {personInitials(profile.user.displayName)}
              </div>
              <h1>{profile.user.displayName}</h1>
              <p className="circle-identity-meta">@{profile.user.handle}</p>
              {profile.user.bio ? <p>{profile.user.bio}</p> : null}
              {profile.affiliations.length > 0 ? (
                <p className="circle-identity-meta">
                  {profile.affiliations.map((affiliation) => (
                    <span key={affiliation.organizationSlug}>
                      {affiliation.role === "owner" || affiliation.role === "admin" || affiliation.role === "editor"
                        ? `${affiliation.role.charAt(0).toUpperCase() + affiliation.role.slice(1)} at `
                        : null}
                      <Link href={`/spaces/${affiliation.organizationSlug}`}>
                        {affiliation.organizationName}
                      </Link>{" "}
                    </span>
                  ))}
                </p>
              ) : null}
              {(profile.user.preferredEcosystems.length > 0 || profile.user.assetInterests.length > 0) && (
                <div className="mission-meta">
                  {[...profile.user.preferredEcosystems, ...profile.user.assetInterests].map((interest) => (
                    <StatusPill key={interest} tone="muted">
                      {interest}
                    </StatusPill>
                  ))}
                </div>
              )}
            </div>
            <div className="page-intro-note">
              <strong>{`${profile.followers} followers · ${profile.following} following`}</strong>
              {viewerId && !isSelf ? (
                <FollowButton handle={profile.user.handle} initialFollowing={profile.viewerFollowing} />
              ) : null}
              {isSelf ? "This is your public profile." : "Approved contributions only. No wallet details are shown."}
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          <div className="profile-metrics">
            <MetricCard detail="Approved mission points" label="Vicus points" value={String(profile.approvedPoints)} accent />
            <MetricCard detail="Approved mission responses" label="Contributions" value={String(profile.approvedContributionCount)} />
            <MetricCard detail="Actively watched asset communities" label="Watching" value={String(profile.watchedCircleCount)} />
            <MetricCard detail="Supported persisted role checks" label="Verified roles" value={String(profile.verifiedRoles.length)} />
          </div>

          <section className="circle-section" aria-labelledby="person-contributions-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Public history</Eyebrow>
                <h2 id="person-contributions-title">Approved contributions.</h2>
              </div>
              <p>Only approved work appears here. Pending, rejected, and revision states stay private.</p>
            </div>
            {profile.contributions.length > 0 ? (
              <div className="content-panel">
                {profile.contributions.map((contribution) => (
                  <ActivityItem
                    detail={`${contribution.circleName} · ${contribution.points} points · ${contribution.submittedAt.slice(0, 10)}`}
                    key={contribution.id}
                    label={contribution.missionType}
                    title={contribution.missionTitle}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No approved contributions yet">
                Approved mission responses will appear here.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" aria-labelledby="person-community-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Community</Eyebrow>
                <h2 id="person-community-title">Questions, insights, sources, answers.</h2>
              </div>
              <p>Only active public content. Removed content never appears here.</p>
            </div>
            {community.length > 0 ? (
              <div className="content-panel">
                {community.slice(0, 10).map((item) => (
                  <ActivityItem
                    detail={`${item.circleSlug} · ${item.createdAt.slice(0, 10)}`}
                    href={`/circles/${item.circleSlug}/community/${item.postId}`}
                    key={`${item.kind}-${item.id}`}
                    label={item.kind === "post" ? (item.type ?? "post") : "answer"}
                    title={item.title}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No community contributions yet">
                Questions, insights, sources, and answers will appear here.
              </EmptyState>
            )}
          </section>

          {profile.verifiedRoles.length > 0 ? (
            <section className="circle-section" aria-labelledby="person-roles-title">
              <div className="circle-section-heading">
                <div>
                  <Eyebrow>Verified roles</Eyebrow>
                  <h2 id="person-roles-title">Supported holder checks.</h2>
                </div>
                <p>Role without wallet details — verification state only.</p>
              </div>
              <div className="mission-grid">
                {profile.verifiedRoles.map((verified) => (
                  <article className="mission-card" key={verified.id}>
                    <div className="mission-card-header">
                      <StatusPill tone="green">
                        {verified.role === "verified-holder" ? "Verified Holder" : "Verified Trustline"}
                      </StatusPill>
                      <span className="mission-type">{verified.network}</span>
                    </div>
                    <h3>
                      <Link href={`/circles/${verified.circle.slug}`}>{verified.circle.name}</Link>
                    </h3>
                    <p>
                      Verified {verified.verifiedAt.toISOString().slice(0, 10)} · checked{" "}
                      {verified.lastCheckedAt.toISOString().slice(0, 10)} · {verified.lastState}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {profile.watchedCircles.length > 0 ? (
            <section className="circle-section" aria-labelledby="person-watching-title">
              <div className="circle-section-heading">
                <div>
                  <Eyebrow>Watching</Eyebrow>
                  <h2 id="person-watching-title">Circles being followed.</h2>
                </div>
                <p>Active Watch relationships. Watching is interest, not proof of ownership.</p>
              </div>
              <div className="mission-grid">
                {profile.watchedCircles.map(({ circle }) => (
                  <article className="mission-card" key={circle.slug}>
                    <h3>
                      <Link href={`/circles/${circle.slug}`}>{circle.name}</Link>
                    </h3>
                    <p>{circle.summary}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {profile.activity.length > 0 ? (
            <section className="circle-section" aria-labelledby="person-activity-title">
              <div className="circle-section-heading">
                <div>
                  <Eyebrow>Recent activity</Eyebrow>
                  <h2 id="person-activity-title">Latest public events.</h2>
                </div>
                <p>Derived from safe records only.</p>
              </div>
              <div className="content-panel">
                {profile.activity.map((item, index) => (
                  <ActivityItem
                    detail={`${item.detail} · ${item.at.slice(0, 10)}`}
                    key={`${item.kind}-${item.title}-${index}`}
                    label={item.label}
                    title={item.title}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
