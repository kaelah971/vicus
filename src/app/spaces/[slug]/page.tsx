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
import { getOrganizationBySlug } from "@/lib/organizations/service";
import { getSpaceCommunityActivity } from "@/lib/community/service";
import { getSpaceCapabilities } from "@/lib/utility/service";
import { getSpacePeople } from "@/lib/social/service";
import { PersonCard } from "@/components/person-card";

type SpacePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: SpacePageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const org = await getOrganizationBySlug(slug);
    if (!org) return { title: "Space" };
    return {
      title: `${org.name} Space on Vicus`,
      description: org.description,
    };
  } catch {
    return { title: "Space" };
  }
}

export default async function SpacePage({ params }: SpacePageProps) {
  const { slug } = await params;
  let org;
  let sessionUserId: string | null = null;

  try {
    const session = await getCurrentSession();
    sessionUserId = session?.user.id ?? null;
    org = await getOrganizationBySlug(slug, sessionUserId);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="spaces">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Space data is unavailable">
                The database could not provide this Space right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!org) notFound();

  let community: Awaited<ReturnType<typeof getSpaceCommunityActivity>> = [];
  let people: Awaited<ReturnType<typeof getSpacePeople>> = [];
  let utility: Awaited<ReturnType<typeof getSpaceCapabilities>> = [];
  try {
    [community, people, utility] = await Promise.all([
      getSpaceCommunityActivity(org.id, 6),
      getSpacePeople(org.id, 8),
      getSpaceCapabilities(org.id),
    ]);
  } catch {
    community = [];
    people = [];
    utility = [];
  }

  const memberRole = org.role && org.role !== "global-admin" ? org.role : null;
  const canManage = org.role === "global-admin" || memberRole === "owner" || memberRole === "admin";

  return (
    <AppShell active="spaces">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href="/spaces">Spaces</Link>
                <span>/</span>
                <span>{org.name}</span>
              </nav>
              <Eyebrow>Space</Eyebrow>
              <h1>{org.name}</h1>
              <p>{org.description}</p>
              <p className="circle-identity-meta">
                {org.ecosystemFocus ? `${org.ecosystemFocus} focus` : "Multi-ecosystem presence"}
                {org.websiteUrl ? (
                  <>
                    {" · "}
                    <a href={org.websiteUrl} rel="noreferrer" target="_blank">
                      Official website
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{`${org.circles.length} hosted Circles · ${org.missions.length} open missions`}</strong>
              Spaces host learning communities. Authorship does not make a claim automatically trustworthy — check official sources.
              {canManage ? (
                <>
                  {" "}
                  <Link href={`/admin/organizations/${org.slug}`}>Manage Space →</Link>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          <div className="profile-metrics">
            <MetricCard detail="Asset communities hosted here" label="Circles" value={String(org.circles.length)} />
            <MetricCard detail="Published lessons" label="Lessons" value={String(org.lessons.length)} accent />
            <MetricCard detail="Participant-visible missions" label="Open missions" value={String(org.missions.length)} />
            <MetricCard detail="Approved mission responses" label="Contributions" value={String(org.metrics.contributions)} />
          </div>

          <section className="circle-section" id="assets" aria-labelledby="space-assets-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Assets</Eyebrow>
                <h2 id="space-assets-title">Circles hosted by {org.name}.</h2>
              </div>
              <p>
                Every Circle here is backed by a real asset record. Open one to read its Passport,
                watch it, and find its missions.
              </p>
            </div>
            {org.circles.length > 0 ? (
              <div className="circle-grid">
                {org.circles.map((circle) => (
                  <CircleCard circle={circle} key={circle.slug} />
                ))}
              </div>
            ) : (
              <EmptyState title="No hosted Circles yet">
                This Space has not hosted any Asset Circles yet.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="learn" aria-labelledby="space-learn-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Learn</Eyebrow>
                <h2 id="space-learn-title">Lessons from {org.name}.</h2>
              </div>
              <p>
                Reading material first — missions are where you prove understanding and contribute.
              </p>
            </div>
            {org.lessons.length > 0 ? (
              <div className="mission-grid">
                {org.lessons.map((lesson) => (
                  <article className="mission-card" key={lesson.id}>
                    <div className="mission-card-header">
                      <span className="mission-type">Lesson · {lesson.readingMinutes} min read</span>
                    </div>
                    <h3>
                      <Link href={`/lessons/${lesson.slug}`}>{lesson.title}</Link>
                    </h3>
                    <p>{lesson.summary}</p>
                    <dl className="mission-meta">
                      <div>
                        <dt>Sources</dt>
                        <dd>{lesson.sources.length} official references</dd>
                      </div>
                      {lesson.circle ? (
                        <div>
                          <dt>Circle</dt>
                          <dd>{lesson.circle.name}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mission-footer">
                      <Link className="mission-action-link" href={`/lessons/${lesson.slug}`}>
                        Read lesson
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No published lessons yet">
                Published lessons from this Space will appear here.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="missions" aria-labelledby="space-missions-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Missions</Eyebrow>
                <h2 id="space-missions-title">Open missions from {org.name}.</h2>
              </div>
              <p>
                Real missions with your authenticated submission state. Drafts stay in the studio
                and never appear here.
              </p>
            </div>
            {org.missions.length > 0 ? (
              <div className="mission-grid">
                {org.missions.map((mission) => (
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
              <EmptyState title="No open missions right now">
                There are no participant-visible missions from this Space right now.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="utility" aria-labelledby="space-utility-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Put assets to work</Eyebrow>
                <h2 id="space-utility-title">Real uses across {org.name}.</h2>
              </div>
              <p>Source-backed capabilities from hosted Circles — guides and official flows, never execution inside Vicus.</p>
            </div>
            {utility.length > 0 ? (
              <div className="mission-grid">
                {utility.map((group) => (
                  <article className="mission-card" key={group.circleSlug}>
                    <h3>
                      <Link href={`/circles/${group.circleSlug}#use`}>{group.circleName}</Link>
                    </h3>
                    <p>
                      {group.capabilities.map((capability) => capability.title).join(" · ")}
                    </p>
                    <div className="mission-footer">
                      <Link className="mission-action-link" href={`/circles/${group.circleSlug}#use`}>
                        Explore uses
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No documented uses yet">
                Source-backed capabilities for hosted assets will appear here.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="community" aria-labelledby="space-community-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Community</Eyebrow>
                <h2 id="space-community-title">Conversations across {org.name}.</h2>
              </div>
              <p>Questions, insights, and answers from hosted Circles — authored by members, never by the Space itself.</p>
            </div>
            {community.length > 0 ? (
              <div className="content-panel">
                {community.map((item) => (
                  <ActivityItem
                    detail={`${item.circleName} · @${item.authorHandle} · ${item.createdAt.slice(0, 10)}`}
                    href={`/circles/${item.circleSlug}/community/${item.postId}`}
                    key={`${item.kind}-${item.id}`}
                    label={item.kind === "post" ? (item.type ?? "post") : "answer"}
                    title={item.title}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No community activity yet">
                Questions and insights from hosted Circles will appear here.
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="people" aria-labelledby="space-people-title">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>People</Eyebrow>
                <h2 id="space-people-title">Contributors in {org.name}.</h2>
              </div>
              <p>Watchers, approved contributors, and verified members across hosted Circles.</p>
            </div>
            {people.length > 0 ? (
              <div className="mission-grid">
                {people.map((person) => (
                  <PersonCard key={person.user.id} person={person} />
                ))}
              </div>
            ) : (
              <EmptyState title="No people yet">
                Watch a hosted Circle or complete a mission to appear here.
              </EmptyState>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
