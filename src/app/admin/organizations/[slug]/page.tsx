import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DataState, EmptyState, Eyebrow, MetricCard, StatusPill } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { listCircles } from "@/lib/data/circles";
import {
  getOrganizationBySlug,
  getUserRoleInOrg,
  isGlobalAdmin,
  listOrgLessons,
  listOrgMembers,
  listOrgMissions,
  getOrgIdBySlugOrThrow,
  getOrgReviewQueue,
} from "@/lib/organizations/service";
import { AdminReviewQueue } from "@/components/admin-review-queue";
import { MissionCreateForm } from "@/components/mission-create-form";
import { LessonForm } from "@/components/lesson-form";
import { AdminMissionStatusControl } from "@/components/admin-mission-status-control";
import { OrgCircleClaimForm, OrgMemberForm } from "@/components/org-studio-forms";

type OrgStudioPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organization studio",
  description: "Manage hosted Circles, lessons, missions, and reviews for an organization.",
};

export default async function OrgStudioPage({ params }: OrgStudioPageProps) {
  const { slug } = await params;

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Studio data is unavailable">
                The database could not provide the signed-in session.
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
      <AppShell active="admin">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Sign in to open this studio">
              Organization studios require a signed-in member or global admin.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let org;
  try {
    org = await getOrganizationBySlug(slug, session.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Studio data is unavailable">
                The database could not provide this organization right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!org) notFound();

  const globalAdmin = await isGlobalAdmin(session.user.id).catch(() => false);
  const membershipRole = globalAdmin ? null : await getUserRoleInOrg(session.user.id, org.id).catch(() => null);
  if (!globalAdmin && !membershipRole) {
    return (
      <AppShell active="admin">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="This studio is restricted">
              Only members of {org.name} and global admins can open this studio.
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  const role = globalAdmin ? "global-admin" : membershipRole;
  const canManage = globalAdmin || role === "owner" || role === "admin";
  const canReview = canManage;

  let lessons: Awaited<ReturnType<typeof listOrgLessons>> = [];
  let missions: Awaited<ReturnType<typeof listOrgMissions>> = [];
  let queue: Awaited<ReturnType<typeof getOrgReviewQueue>> = [];
  let members: Awaited<ReturnType<typeof listOrgMembers>> = [];
  let allCircles: Awaited<ReturnType<typeof listCircles>> = [];
  try {
    const orgId = await getOrgIdBySlugOrThrow(slug);
    [lessons, missions] = await Promise.all([
      listOrgLessons(orgId, session.user.id),
      listOrgMissions(orgId, session.user.id),
    ]);
    if (canReview) {
      queue = await getOrgReviewQueue(orgId, session.user.id);
    }
    if (canManage) {
      [members, allCircles] = await Promise.all([
        listOrgMembers(orgId, session.user.id),
        listCircles(session.user.id),
      ]);
    }
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Studio data is unavailable">
                The database could not provide studio records right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  const hostedIds = new Set(org.circles.map((circle) => circle.id));
  const studioCircles = org.circles.map((circle) => ({
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    ecosystemLabel: circle.ecosystemLabel,
  }));
  const claimOptions = allCircles.map((circle) => ({
    id: circle.id,
    name: circle.name,
    hosted: hostedIds.has(circle.id),
  }));

  return (
    <AppShell active="admin">
      <main className="page-main">
        <div className="shell circle-page-body">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/admin/organizations">Organizations</Link>
            <span>/</span>
            <span>{org.name}</span>
          </nav>

          <header className="circle-identity">
            <div>
              <StatusPill tone="blue">
                {role === "global-admin" ? "Global admin view" : `${role} access`}
              </StatusPill>
              <h1>{org.name}</h1>
              <p className="circle-identity-meta">
                <Link href={`/organizations/${org.slug}`}>Public page</Link>
                {org.websiteUrl ? (
                  <>
                    {" · "}
                    <a href={org.websiteUrl} rel="noreferrer" target="_blank">
                      Official website
                    </a>
                  </>
                ) : null}
              </p>
              <p>{org.description}</p>
            </div>
          </header>

          <div className="profile-metrics">
            <MetricCard detail="Asset communities hosted" label="Circles" value={String(org.circles.length)} />
            <MetricCard detail="Draft + published lessons" label="Lessons" value={String(lessons.length)} accent />
            <MetricCard detail="Draft + open missions" label="Missions" value={String(missions.length)} />
            <MetricCard detail="Waiting for review" label="Pending" value={String(queue.length)} />
          </div>

          <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Hosted Circles</Eyebrow>
                <h2>Communities under this organization.</h2>
              </div>
              <p>Circles keep their existing Passport, missions, and rewards. Hosting only adds attribution.</p>
            </div>
            {org.circles.length > 0 ? (
              <ul>
                {org.circles.map((circle) => (
                  <li key={circle.id}>
                    <Link href={`/circles/${circle.slug}`}>{circle.name}</Link>
                    {" · "}{circle.ecosystemLabel}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No hosted Circles yet">
                Associate a Circle below to start hosting a community.
              </EmptyState>
            )}
            {canManage ? (
              <div style={{ marginTop: 16 }}>
                <OrgCircleClaimForm orgSlug={org.slug} circles={claimOptions} />
              </div>
            ) : null}
          </section>

          <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Lessons</Eyebrow>
                <h2>Read first, then do.</h2>
              </div>
              <p>Drafts stay organization-visible. Published lessons are participant-readable with sources.</p>
            </div>
            {lessons.length > 0 ? (
              <ul>
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link href={`/lessons/${lesson.slug}`}>{lesson.title}</Link>
                    {" · "}
                    <StatusPill tone={lesson.status === "published" ? "green" : "muted"}>{lesson.status}</StatusPill>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No lessons yet">
                Publish the first lesson for this organization below.
              </EmptyState>
            )}
            <div style={{ marginTop: 16 }}>
              <Eyebrow>New lesson</Eyebrow>
              <LessonForm orgSlug={org.slug} circles={studioCircles} />
            </div>
            {lessons.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <Eyebrow>Edit lessons</Eyebrow>
                {lessons.map((lesson) => (
                  <details key={lesson.id}>
                    <summary>
                      Edit “{lesson.title}” ({lesson.status})
                    </summary>
                    <LessonForm
                      circles={studioCircles}
                      initial={{
                        id: lesson.id,
                        title: lesson.title,
                        slug: lesson.slug,
                        summary: lesson.summary,
                        body: lesson.body,
                        circleId: lesson.circleId,
                        status: lesson.status,
                        sources: lesson.sources,
                      }}
                      orgSlug={org.slug}
                    />
                  </details>
                ))}
              </div>
            ) : null}
          </section>

          <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Missions</Eyebrow>
                <h2>Do, prove, contribute.</h2>
              </div>
              <p>Organization missions reuse Vicus grading, review, points, rewards, and Draft/Open lifecycle.</p>
            </div>
            {missions.length > 0 ? (
              <ul>
                {missions.map((mission) => (
                  <li key={mission.id}>
                    <Link href={`/admin/missions/${mission.id}`}>{mission.title}</Link>
                    {" · "}{mission.circleName} · {mission.status} · {mission.points} points
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No missions yet">
                Create the first mission for a hosted Circle below.
              </EmptyState>
            )}
            {studioCircles.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <Eyebrow>New mission</Eyebrow>
                <MissionCreateForm circles={studioCircles} endpoint={`/api/orgs/${org.slug}/missions`} />
              </div>
            ) : (
              <p className="control-note">Host a Circle before creating missions.</p>
            )}
            {canReview && missions.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <Eyebrow>Lifecycle</Eyebrow>
                {missions.map((mission) => (
                  <div className="admin-panel" key={mission.id}>
                    <p className="control-note">
                      {mission.title} — currently {mission.status}.
                    </p>
                    <AdminMissionStatusControl missionId={mission.id} status={mission.status} />
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {canReview ? (
            <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Reviews</Eyebrow>
                  <h2>Every response, one state.</h2>
                </div>
                <p>Only submissions to this organization&apos;s missions appear here.</p>
              </div>
              {queue.length > 0 ? (
                <AdminReviewQueue actionBase={`/api/orgs/${org.slug}/submissions`} submissions={queue} />
              ) : (
                <EmptyState title="No submissions waiting">
                  Responses to this organization&apos;s missions will appear here for review.
                </EmptyState>
              )}
            </section>
          ) : null}

          {canManage ? (
            <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Members</Eyebrow>
                  <h2>Who can operate this studio.</h2>
                </div>
                <p>Owners and admins manage members. Editors work on lessons and missions only.</p>
              </div>
              {members.length > 0 ? (
                <ul>
                  {members.map((member) => (
                    <li key={member.userId}>
                      @{member.handle} · {member.displayName} · {member.role}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div style={{ marginTop: 16 }}>
                <OrgMemberForm orgSlug={org.slug} />
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
