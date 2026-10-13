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
  StatusPill,
} from "@/components/vicus";
import {
  ActionTray,
  AssetToken,
  Chip,
  EcoChip,
  GlowField,
  Glyph,
  MetricTile,
  MissionStrip,
  Orb,
  SectionHead,
  StepFlow,
  TabBar,
  assetClassMeta,
  capabilityMeta,
  type ActionItem,
} from "@/components/vicus-ui";
import { rewardNetworkLabel } from "@/lib/rewards/display";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WatchButton } from "@/components/watch-button";
import { ShareButton } from "@/components/share-button";
import { RoleVerification } from "@/components/role-verification";
import { getCircleBySlug } from "@/lib/data/circles";
import { getCircleParticipation, getRoleVerificationForCircle } from "@/lib/data/roles";
import { getCircleOrganization } from "@/lib/organizations/service";
import { getCircleSocialSummary } from "@/lib/circles-social/service";
import { listCircleTheses } from "@/lib/conviction/service";
import { listCirclePosts } from "@/lib/community/service";
import { getCircleLifecycle } from "@/lib/lifecycle/service";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import { listCircleCampaigns } from "@/lib/campaigns/service";
import { getSubjectForAsset } from "@/lib/subjects/config";
import { getActivationMissionLinks } from "@/lib/activation/service";
import { CommunityPostCard } from "@/components/community-post";
import { PersonCard } from "@/components/person-card";

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
  let authenticated = false;
  let initialVerification: {
    id: string;
    role: string;
    lastState: string;
    ecosystem: string;
    network: string;
    lastCheckedAt: string;
  } | null = null;
  let viewerId: string | null = null;

  try {
    const session = await getCurrentSession();
    circle = await getCircleBySlug(slug, session?.user.id);
    authenticated = Boolean(session);
    viewerId = session?.user.id ?? null;
    if (session) {
      try {
        const row = await getRoleVerificationForCircle(session.user.id, slug);
        initialVerification = row
          ? {
              id: row.id,
              role: row.role,
              lastState: row.lastState,
              ecosystem: row.ecosystem,
              network: row.network,
              lastCheckedAt: row.lastCheckedAt.toISOString(),
            }
          : null;
      } catch {
        initialVerification = null;
      }
    }
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

  let participation = { watcherCount: 0, verificationCount: 0, approvedContributionCount: 0 };
  try {
    participation = await getCircleParticipation(circle.id);
  } catch {
    // Participation counts stay zeroed rather than blocking the circle.
  }

  let hostOrg: { id: string; name: string; slug: string } | null = null;
  try {
    hostOrg = await getCircleOrganization(circle.id);
  } catch {
    hostOrg = null;
  }

  let resolvedActions: Awaited<ReturnType<typeof resolveAssetActions>> = [];
  let circleCampaigns: Awaited<ReturnType<typeof listCircleCampaigns>> = [];
  let activationLinks: Awaited<ReturnType<typeof getActivationMissionLinks>> = new Map();
  let lifecycle: Awaited<ReturnType<typeof getCircleLifecycle>> = [];
  try {
    resolvedActions = await resolveAssetActions(circle.slug, circle.network ?? circle.ecosystem ?? "stellar");
    circleCampaigns = await listCircleCampaigns(circle.slug);
    activationLinks = await getActivationMissionLinks(circle.id);
    lifecycle = await getCircleLifecycle(circle.slug);
  } catch {
    resolvedActions = [];
    circleCampaigns = [];
    activationLinks = new Map();
    lifecycle = [];
  }

  let social: Awaited<ReturnType<typeof getCircleSocialSummary>> | null = null;
  let theses: Awaited<ReturnType<typeof listCircleTheses>> = [];
  try {
    const [socialRows, thesisRows] = await Promise.all([
      getCircleSocialSummary(slug, viewerId).catch(() => null),
      listCircleTheses(slug, 3).catch(() => []),
    ]);
    social = socialRows;
    theses = thesisRows;
  } catch {
    social = null;
  }
  // Fallback rail reuses the summary groups — one membership read per page.
  const peopleFallback = (social ? [...social.groups.watching, ...social.groups.contributors] : [])
    .filter((person, index, all) => all.findIndex((entry) => entry.handle === person.handle) === index)
    .slice(0, 8)
    .map((person) => ({
      user: { id: person.handle, handle: person.handle, displayName: person.displayName, avatarUrl: person.avatarUrl },
      relationships: person.relationships,
      approvedContributionCount: 0,
      approvedPoints: 0,
      recentApprovedAt: null,
    }));
  const peopleCount = social
    ? social.groups.watching.length + social.groups.contributors.length + social.verifiedParticipants.length
    : 0;

  let communityPreview: Awaited<ReturnType<typeof listCirclePosts>> = [];
  try {
    communityPreview = await listCirclePosts(circle.slug, null, null, 30);
  } catch {
    communityPreview = [];
  }
  const communityByType = {
    question: communityPreview.filter((post) => post.type === "question").slice(0, 2),
    insight: communityPreview.filter((post) => post.type === "insight").slice(0, 2),
    source: communityPreview.filter((post) => post.type === "source").slice(0, 2),
  };

  const assetClass = assetClassMeta(circle.category);
  const [activationEntry] = [...activationLinks.entries()];
  const activationMission = activationEntry
    ? circle.missions.find((mission) => mission.id === activationEntry[1].id) ?? null
    : null;
  const rewardNetwork = rewardNetworkLabel();
  const subject = getSubjectForAsset(circle.slug);
  // Asset Action Engine: ONE unified action model. Source-backed capability
  // rows plus live Vicus execution (Send policy, CCTP MOVE, Access Router)
  // resolve server-side; overlays win on kind collision so execution links
  // appear only where execution truly exists.
  const actionItems: ActionItem[] = resolvedActions.map((action) => {
    const meta = capabilityMeta(action.kind);
    const mission = activationLinks.get(action.kind);
    return {
      key: `${action.kind}-${action.executionMode}`,
      label: action.title,
      href: action.href,
      tone: meta.tone,
      icon: meta.icon,
      state: mission ? "Mission available" : action.stateLabel,
      live: mission ? true : action.live,
      external: action.external,
    };
  });
  const tabs = [
    ...(actionItems.length > 0 ? [{ href: "#use", label: "Use" }] : []),
    { href: "#passport", label: "Learn" },
    { href: "#missions", label: "Missions", count: circle.missions.length },
    { href: "#conviction", label: "Conviction" },
    { href: "#community", label: "Community", count: communityPreview.length },
    { href: "#people", label: "People", count: peopleCount },
    { href: "#sources", label: "Sources" },
  ];

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className={`c-hero tone-${assetClass.tone}`} id="overview">
          <GlowField tones={[assetClass.tone, "violet"]} />
          <div className="shell">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link href="/discover">Explore</Link>
              <span>/</span>
              <span>{circle.name}</span>
            </nav>
            <div className="c-identity">
              <AssetToken code={circle.code} ecosystem={circle.ecosystem} ecosystemLabel={circle.ecosystemLabel} size="xl" />
              <div className="c-identity-main">
                <div className="c-chips">
                  <Chip icon={assetClass.icon} tone={assetClass.tone}>{circle.assetClassLabel ?? circle.category}</Chip>
                  <EcoChip ecosystem={circle.ecosystem} label={circle.ecosystemLabel} />
                  <StatusPill tone={circle.state === "education" ? "blue" : "muted"}>{circle.stateLabel}</StatusPill>
                  {circle.verification.enabled ? (
                    <Chip icon="shield" tone="green">Role check available</Chip>
                  ) : null}
                </div>
                <h1>{circle.name}</h1>
                <p className="c-meta">
                  {circle.issuerSource} · {circle.sourceStatus}
                  {hostOrg ? (
                    <>
                      {" · "}Hosted by <Link href={`/spaces/${hostOrg.slug}`}>{hostOrg.name}</Link>
                    </>
                  ) : null}
                </p>
                <p className="c-summary">{circle.summary}</p>
              </div>
              <div className="c-hero-actions">
                <WatchButton circleSlug={circle.slug} initialWatched={circle.watched} />
                <ShareButton title={circle.name} path={`/circles/${circle.slug}`} />
                {circle.sourceUrl ? (
                  <a className="button button-glass button-small" href={circle.sourceUrl} rel="noreferrer" target="_blank">
                    Official source <Icon name="external" size={14} />
                  </a>
                ) : null}
                {subject ? (
                  <Link
                    className="button button-glass button-small"
                    href={subject.type === "issuer" ? `/issuers/${subject.slug}` : `/subjects/${subject.slug}`}
                  >
                    View {subject.type === "issuer" ? "issuer" : "company"} <Icon name="arrow-right" size={14} />
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="c-stats">
              <MetricTile hint="Watch relationships for this circle" icon="eye" label="Watchers" tone="violet" value={String(participation.watcherCount)} />
              <MetricTile hint="Approved mission responses in this circle" icon="chat" label="Contributions" tone="pink" value={String(participation.approvedContributionCount)} />
              <MetricTile hint="Stellar role checks in this circle" icon="shield" label="Verified roles" tone="green" value={String(participation.verificationCount)} />
            </div>
          </div>
        </header>

        <TabBar items={tabs} label="Circle sections" />

        <div className="shell c-body">
          {actionItems.length > 0 ? (
            <section aria-labelledby="circle-use-title" className="c-use" id="use">
              <GlowField tones={["blue", "green", "violet"]} />
              <div className="c-use-head">
                <span className="v-eyebrow">Your actions</span>
                <h2 id="circle-use-title">What you can do with {circle.code}</h2>
                <p>Only actions this asset actually supports — nothing speculative. Vicus never moves funds. <Link href="/use">Explore all utility →</Link></p>
              </div>
              <ActionTray actions={actionItems} />
            </section>
          ) : null}
          {circleCampaigns.length > 0 ? (
            <section aria-labelledby="circle-campaigns-title" className="c-use" id="campaigns">
              <div className="c-use-head">
                <span className="v-eyebrow">Active campaign</span>
                <h2 id="circle-campaigns-title">Earn for using {circle.code}</h2>
              </div>
              <div className="stack">
                {circleCampaigns.map((entry) => (
                  <div className="card" key={entry.id}>
                    <p><strong>{entry.objective}</strong></p>
                    <p className="muted small">
                      {entry.targetAction === "send"
                        ? `Send ${circle.code}`
                        : entry.targetAction === "swap"
                          ? `Swap into ${circle.code}`
                          : `Complete a ${circle.code} mission`}
                      {" · Earn "}
                      {entry.rewardPerCompletion ?? "—"} {entry.rewardAsset} ({entry.rewardNetworkLabel})
                    </p>
                    <div className="row">
                      <a className="btn" href={`/campaigns/${entry.id}`}>View campaign</a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {lifecycle.length > 0 ? (
            <section aria-labelledby="circle-lifecycle-title" className="c-use" id="lifecycle">
              <div className="c-use-head">
                <span className="v-eyebrow">Asset lifecycle</span>
                <h2 id="circle-lifecycle-title">From access to exit</h2>
                <p>Only stages with official evidence are shown — not investment advice.</p>
              </div>
              <StepFlow
                label="Asset lifecycle"
                steps={lifecycle.map((step) => ({
                  icon:
                    step.stage === "access"
                      ? ("receive" as const)
                      : step.stage === "hold"
                        ? ("coins" as const)
                        : step.stage === "use"
                          ? ("send" as const)
                          : step.stage === "earn"
                            ? ("gift" as const)
                            : ("redeem" as const),
                  label: step.title,
                  line: step.stage.toUpperCase(),
                }))}
              />
              <dl className="mission-meta">
                {lifecycle.map((step) => (
                  <div key={step.id}>
                    <dt>{step.stage.toUpperCase()}</dt>
                    <dd>
                      <strong>{step.title}</strong> — {step.shortDescription}{" "}
                      <Chip tone="white">{step.supportModeLabel}</Chip>
                      {step.ctaLabel && step.destinationUrl ? (
                        step.destinationUrl.startsWith("/") ? (
                          <Link href={step.destinationUrl}> {step.ctaLabel} →</Link>
                        ) : (
                          <a href={step.destinationUrl} rel="noreferrer" target="_blank">
                            {" "}{step.ctaLabel} →
                          </a>
                        )
                      ) : null}
                      <details>
                        <summary>Eligibility & source</summary>
                        {step.eligibilityNote ? <p>{step.eligibilityNote}</p> : null}
                        <p>
                          <a href={step.sourceUrl} rel="noreferrer" target="_blank">
                            Official source
                          </a>
                        </p>
                      </details>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {activationMission ? (
            <MissionStrip
              context={`${circle.name} · onchain proof`}
              href={`/missions/${activationMission.id}`}
              points={activationMission.points}
              reward={activationMission.reward}
              rewardNetwork={rewardNetwork}
              title={activationMission.title}
            />
          ) : null}

          <AssetPassport circle={circle} />

          {circle.verification.enabled && circle.verification.assetCode && circle.verification.network ? (
            <RoleVerification
              circleSlug={circle.slug}
              circleName={circle.name}
              assetCode={circle.verification.assetCode}
              network={circle.verification.network}
              sourceUrl={circle.verification.sourceUrl}
              initialAuthenticated={authenticated}
              initialVerification={initialVerification}
            />
          ) : (
            <section className="content-panel role-deferred-panel" aria-labelledby="role-deferred-title">
              <Eyebrow>Role verification</Eyebrow>
              <h2 id="role-deferred-title">Watch and learn — no live check here.</h2>
              <p>
                {circle.ecosystem === "stellar"
                  ? "No enabled classic Stellar asset check. No wallet, balance, or issuer approval is inferred."
                  : `Holder verification for ${circle.ecosystemLabel} isn't supported yet. No wallet, balance, or holder status is inferred.`}
              </p>
            </section>
          )}

          <section className="circle-section" id="missions">
            <SectionHead eyebrow="Missions" line="Approval creates offchain Vicus points." title="Participate with a record." />
            {circle.missions.length > 0 ? (
              <div className="mission-grid">
                {circle.missions.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} />
                ))}
              </div>
            ) : (
              <EmptyState title="No missions yet">This circle has no mission records yet.</EmptyState>
            )}
          </section>

          {circle.activity.length > 0 ? (
            <section className="circle-section" id="activity">
              <SectionHead eyebrow="Activity" title="Recent participation." />
              <div className="v-list">
                {circle.activity.map((activity) => (
                  <ActivityItem key={activity.id} {...activity} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="circle-section" id="community">
            <SectionHead
              action={
                <Link className="v-text-link" href={`/circles/${circle.slug}/community`}>
                  Open community <Icon name="arrow-right" size={15} />
                </Link>
              }
              eyebrow="Community"
              title="Questions, insights, sources."
            />
            {communityPreview.length > 0 ? (
              <div className="mission-grid">
                {[...communityByType.question, ...communityByType.insight, ...communityByType.source].map((post) => (
                  <CommunityPostCard circleSlug={circle.slug} key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <EmptyState title="No contributions yet">
                Ask the first question for this Circle.{" "}
                <Link href={`/circles/${circle.slug}/community`}>Open community</Link>
              </EmptyState>
            )}
          </section>

          <section className="circle-section" id="conviction">
            <SectionHead
              eyebrow="Conviction"
              line="Structured paper claims with evidence — never investment advice, never a position claim unless verified."
              title="Theses on this asset."
              action={
                <Link className="v-text-link" href={`/circles/${circle.slug}/conviction`}>
                  Open conviction <Icon name="arrow-right" size={15} />
                </Link>
              }
            />
            {theses.length > 0 ? (
              <div className="mission-grid">
                {theses.map((thesis) => (
                  <Link className="p-asset" href={`/circles/${circle.slug}/conviction/${thesis.id}`} key={thesis.id}>
                    <span>
                      <strong>{thesis.title}</strong>
                      <small>
                        @{thesis.authorHandle} · {thesis.thesisType === "verified-position" ? "VERIFIED POSITION" : "PAPER"} ·{" "}
                        {thesis.confidence}% confidence · {thesis.timeframe} · {thesis.status}
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No theses yet">Publish the first structured claim for this Circle.</EmptyState>
            )}
          </section>

          <section className="circle-section" id="people">
            <SectionHead
              eyebrow="People"
              line="Watching means interest. Contributing means useful knowledge. Verified means a real completed action — never a balance. Holdings stay private."
              title="People around this asset."
            />
            {social ? (
              <>
                {social.groups.following.length > 0 ? (
                  <div className="c-people-group">
                    <h3>People you follow</h3>
                    <div className="x-rail">
                      {social.groups.following.slice(0, 8).map((person) => (
                        <PersonCard
                          key={person.handle}
                          person={{ user: { id: person.handle, handle: person.handle, displayName: person.displayName, avatarUrl: person.avatarUrl }, relationships: person.relationships, approvedContributionCount: 0, approvedPoints: 0, recentApprovedAt: null }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {social.verifiedParticipants.length > 0 ? (
                  <div className="c-people-group">
                    <h3>Verified participants</h3>
                    <p className="muted small">Completed a verified asset action — mission, campaign, or role check. No amounts shown.</p>
                    <div className="x-rail">
                      {social.verifiedParticipants.slice(0, 8).map((participant) => (
                        <Link className="person-tile" href={`/u/${participant.handle}`} key={participant.handle}>
                          <span className="person-tile-main">
                            <strong>{participant.displayName}</strong>
                            <small>@{participant.handle}</small>
                          </span>
                          <span className="v-chip tone-green">
                            {participant.basis === "mission" ? "MISSION" : participant.basis === "campaign" ? "CAMPAIGN" : "VERIFIED"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {social.groups.contributors.length > 0 ? (
                  <div className="c-people-group">
                    <h3>Contributors</h3>
                    <div className="x-rail">
                      {social.groups.contributors.slice(0, 8).map((person) => {
                        const signal = social.contributorSignals.find((entry) => entry.handle === person.handle);
                        return (
                          <div key={person.handle}>
                            <PersonCard
                              person={{ user: { id: person.handle, handle: person.handle, displayName: person.displayName, avatarUrl: person.avatarUrl }, relationships: person.relationships, approvedContributionCount: 0, approvedPoints: 0, recentApprovedAt: null }}
                            />
                            {signal ? (
                              <p className="muted small">
                                {[signal.answers > 0 ? `${signal.answers} answers` : null, signal.helpfulReceived > 0 ? `${signal.helpfulReceived} helpful` : null, signal.insights > 0 ? `${signal.insights} insights` : null, signal.sources > 0 ? `${signal.sources} sources` : null]
                                  .filter(Boolean)
                                  .join(" · ") || "New contributor"}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {social.groups.watching.length > 0 ? (
                  <div className="c-people-group">
                    <h3>Watching</h3>
                    <div className="x-rail">
                      {social.groups.watching.slice(0, 8).map((person) => (
                        <PersonCard
                          key={person.handle}
                          person={{ user: { id: person.handle, handle: person.handle, displayName: person.displayName, avatarUrl: person.avatarUrl }, relationships: person.relationships, approvedContributionCount: 0, approvedPoints: 0, recentApprovedAt: null }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {social.groups.following.length === 0 &&
                social.verifiedParticipants.length === 0 &&
                social.groups.contributors.length === 0 &&
                social.groups.watching.length === 0 ? (
                  <EmptyState title="No people yet">Watch this Circle or complete a mission to be listed here.</EmptyState>
                ) : null}
              </>
            ) : peopleFallback.length > 0 ? (
              <div className="x-rail">
                {peopleFallback.map((person) => (
                  <PersonCard key={person.user.id} person={person} />
                ))}
              </div>
            ) : (
              <EmptyState title="No people yet">Watch this Circle or complete a mission to be listed here.</EmptyState>
            )}
          </section>

          <section className="circle-section" id="sources">
            <SectionHead eyebrow="Sources & disclosures" title="Check, don't trust." />
            <div className="c-sources">
              <div className="c-source-main">
                <Orb icon="globe" size="md" tone="blue" />
                <span>
                  <strong>{circle.sourceUrl ? circle.sourceLabel : "No source attached"}</strong>
                  <small>{circle.issuerSource} · {circle.sourceStatus}</small>
                </span>
                {circle.sourceUrl ? (
                  <a className="button button-glass button-small" href={circle.sourceUrl} rel="noreferrer" target="_blank">
                    Open <Icon name="external" size={14} />
                  </a>
                ) : null}
              </div>
              <p className="c-source-note">
                {circle.verification.enabled
                  ? "The role check uses the canonical identifiers stored for this circle and never exposes an exact balance."
                  : "Role verification is deferred here; this page is watch-and-learn only."}{" "}
                Watch is never proof of ownership. Pasted-address checks are read-only and never stored.
              </p>
              <p className="c-source-note c-source-risk">
                <Glyph name="lock" size={14} /> {circle.riskNote}
              </p>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
