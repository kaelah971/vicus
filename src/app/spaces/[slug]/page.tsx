import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCard, DataState, EmptyState, Icon, MissionCard } from "@/components/vicus";
import {
  ActionTray,
  Avatar,
  Chip,
  GlowField,
  MetricTile,
  Orb,
  SectionHead,
  TabBar,
  capabilityMeta,
} from "@/components/vicus-ui";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getOrganizationBySlug } from "@/lib/organizations/service";
import { getSpaceCommunityActivity } from "@/lib/community/service";
import { getSpaceCapabilities, supportModeBadge } from "@/lib/utility/service";
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

  const assetGroups = Array.from(
    org.circles.reduce((groups, circle) => {
      const label = circle.assetClassLabel ?? circle.category;
      const group = groups.get(label) ?? [];
      group.push(circle);
      groups.set(label, group);
      return groups;
    }, new Map<string, typeof org.circles>()),
  );
  const tabs = [
    { href: "#assets", label: "Assets", count: org.circles.length },
    ...(utility.length > 0 ? [{ href: "#utility", label: "Use" }] : []),
    { href: "#learn", label: "Learn", count: org.lessons.length },
    { href: "#missions", label: "Missions", count: org.missions.length },
    { href: "#community", label: "Community", count: community.length },
    { href: "#people", label: "People", count: people.length },
  ];

  return (
    <AppShell active="spaces">
      <main className="page-main">
        <header className="sd-hero">
          <div className="shell">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link href="/spaces">Spaces</Link>
              <span>/</span>
              <span>{org.name}</span>
            </nav>
            <div className="sd-banner">
              <GlowField tones={["violet", "pink", "blue"]} />
              <span className="space-monogram space-monogram-lg">{org.name.slice(0, 1)}</span>
              <div className="sd-identity">
                <div className="c-chips">
                  <Chip icon="grid" tone="violet">Space</Chip>
                  <Chip>{org.ecosystemFocus ? `${org.ecosystemFocus} focus` : "Multi-ecosystem"}</Chip>
                  {memberRole ? <Chip tone="green">Your role · {memberRole}</Chip> : null}
                </div>
                <h1>{org.name}</h1>
                <p>{org.description}</p>
              </div>
              <div className="sd-actions">
                {org.websiteUrl ? (
                  <a className="button button-glass button-small" href={org.websiteUrl} rel="noreferrer" target="_blank">
                    Website <Icon name="external" size={14} />
                  </a>
                ) : null}
                {canManage ? (
                  <Link className="button button-outline button-small" href={`/admin/organizations/${org.slug}`}>
                    Manage Space
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="c-stats">
              <MetricTile icon="coins" label="Assets" tone="blue" value={String(org.circles.length)} />
              <MetricTile icon="book" label="Lessons" tone="violet" value={String(org.lessons.length)} />
              <MetricTile icon="target" label="Open missions" tone="green" value={String(org.missions.length)} />
              <MetricTile icon="chat" label="Contributions" tone="pink" value={String(org.metrics.contributions)} />
            </div>
            <p className="sd-note">Authorship doesn&apos;t make a claim trustworthy — check official sources.</p>
          </div>
        </header>

        <TabBar items={tabs} label="Space sections" />

        <div className="shell c-body">
          <section className="circle-section" id="assets" aria-labelledby="space-assets-title">
            <SectionHead eyebrow="Assets" id="space-assets-title" title={`Hosted by ${org.name}`} />
            {org.circles.length > 0 ? (
              assetGroups.map(([label, groupCircles]) => (
                <div className="sd-asset-group" key={label}>
                  <h3 className="hub-asset-class">{label}</h3>
                  <div className="x-rail">
                    {groupCircles.map((circle) => (
                      <CircleCard circle={circle} key={circle.slug} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No hosted assets yet">This Space has not hosted any Asset Circles yet.</EmptyState>
            )}
          </section>

          {utility.length > 0 ? (
            <section className="c-use" id="utility" aria-labelledby="space-utility-title">
              <GlowField tones={["blue", "green", "violet"]} />
              <div className="c-use-head">
                <span className="v-eyebrow">Put assets to work</span>
                <h2 id="space-utility-title">Real uses across {org.name}</h2>
                <p>Guides and official flows — Vicus never executes them.</p>
              </div>
              {utility.map((group) => (
                <div className="sd-use-group" key={group.circleSlug}>
                  <Link className="sd-use-label" href={`/circles/${group.circleSlug}#use`}>
                    {group.circleName} <Icon name="arrow-right" size={14} />
                  </Link>
                  <ActionTray
                    actions={group.capabilities.map((capability) => {
                      const meta = capabilityMeta(capability.capabilityType);
                      return {
                        key: capability.id,
                        label: capability.title,
                        href: `/circles/${group.circleSlug}/use/${capability.capabilityType}`,
                        tone: meta.tone,
                        icon: meta.icon,
                        state: supportModeBadge[capability.supportMode],
                      };
                    })}
                  />
                </div>
              ))}
            </section>
          ) : null}

          <section className="circle-section" id="learn" aria-labelledby="space-learn-title">
            <SectionHead eyebrow="Learn" id="space-learn-title" title="Lessons" />
            {org.lessons.length > 0 ? (
              <div className="v-list">
                {org.lessons.map((lesson) => (
                  <Link className="v-row" href={`/lessons/${lesson.slug}`} key={lesson.id}>
                    <Orb icon="book" size="md" tone="violet" />
                    <span className="v-row-main">
                      <strong>{lesson.title}</strong>
                      <small>
                        {lesson.readingMinutes} min read · {lesson.sources.length} sources
                        {lesson.circle ? ` · ${lesson.circle.name}` : ""}
                      </small>
                    </span>
                    <Icon name="arrow-right" size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No published lessons yet">Published lessons from this Space will appear here.</EmptyState>
            )}
          </section>

          <section className="circle-section" id="missions" aria-labelledby="space-missions-title">
            <SectionHead eyebrow="Missions" id="space-missions-title" title="Open missions" />
            {org.missions.length > 0 ? (
              <div className="mission-grid">
                {org.missions.map((mission) => (
                  <MissionCard circle={mission.circle} key={mission.id} mission={mission} />
                ))}
              </div>
            ) : (
              <EmptyState title="No open missions right now">There are no participant-visible missions from this Space right now.</EmptyState>
            )}
          </section>

          <section className="circle-section" id="community" aria-labelledby="space-community-title">
            <SectionHead eyebrow="Community" id="space-community-title" line="Authored by members, never by the Space itself." title="Conversations" />
            {community.length > 0 ? (
              <div className="v-list">
                {community.map((item) => (
                  <Link
                    className="v-row"
                    href={`/circles/${item.circleSlug}/community/${item.postId}`}
                    key={`${item.kind}-${item.id}`}
                  >
                    <Avatar name={item.authorHandle} size="md" />
                    <span className="v-row-main">
                      <strong>{item.title}</strong>
                      <small>
                        {item.kind === "post" ? (item.type ?? "post") : "answer"} · {item.circleName} · @{item.authorHandle} · {item.createdAt.slice(0, 10)}
                      </small>
                    </span>
                    <Icon name="arrow-right" size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No community activity yet">Questions and insights from hosted Circles will appear here.</EmptyState>
            )}
          </section>

          <section className="circle-section" id="people" aria-labelledby="space-people-title">
            <SectionHead eyebrow="People" id="space-people-title" title="Contributors" />
            {people.length > 0 ? (
              <div className="x-rail">
                {people.map((person) => (
                  <PersonCard key={person.user.id} person={person} />
                ))}
              </div>
            ) : (
              <EmptyState title="No people yet">Watch a hosted Circle or complete a mission to appear here.</EmptyState>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
