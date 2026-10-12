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
import { getCirclePeople } from "@/lib/social/service";
import { listCirclePosts } from "@/lib/community/service";
import { getCircleCapabilities, supportModeBadge } from "@/lib/utility/service";
import { getCircleLifecycle } from "@/lib/lifecycle/service";
import { getSendableAsset } from "@/lib/send/service";
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

  try {
    const session = await getCurrentSession();
    circle = await getCircleBySlug(slug, session?.user.id);
    authenticated = Boolean(session);
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

  let capabilities: Awaited<ReturnType<typeof getCircleCapabilities>> = [];
  let activationLinks: Awaited<ReturnType<typeof getActivationMissionLinks>> = new Map();
  let lifecycle: Awaited<ReturnType<typeof getCircleLifecycle>> = [];
  try {
    capabilities = await getCircleCapabilities(circle.slug);
    activationLinks = await getActivationMissionLinks(circle.id);
    lifecycle = await getCircleLifecycle(circle.slug);
  } catch {
    capabilities = [];
    activationLinks = new Map();
    lifecycle = [];
  }

  let people: Awaited<ReturnType<typeof getCirclePeople>> = [];
  try {
    people = await getCirclePeople(circle.id);
  } catch {
    people = [];
  }

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
  const useActions: ActionItem[] = capabilities.map((capability) => {
    const meta = capabilityMeta(capability.capabilityType);
    const mission = activationLinks.get(capability.capabilityType);
    return {
      key: capability.id,
      label: capability.title,
      href: `/circles/${circle.slug}/use/${capability.capabilityType}`,
      tone: meta.tone,
      icon: meta.icon,
      state: mission ? "Mission available" : supportModeBadge[capability.supportMode],
      live: Boolean(mission),
    };
  });
  // Send to @handle: only where the server-owned transfer policy confirms
  // the Circle is a verified transferable Stellar asset. Never client-driven.
  const sendPolicy = getSendableAsset(circle.slug);
  const sendActions: ActionItem[] = sendPolicy
    ? [
        {
          key: "send-to-handle",
          label: "Send",
          href: `/send?asset=${circle.slug}`,
          tone: "blue",
          icon: "send",
          state: sendPolicy.permissioned ? "Permissioned transfer" : "Stellar Mainnet",
          live: true,
        },
      ]
    : [];
  // Access from Stellar: native USDC moves outward via Circle CCTP. Surfaced
  // only on the USDC circle — never on assets that are not CCTP-compatible.
  const accessActions: ActionItem[] =
    circle.code === "USDC"
      ? [
          {
            key: "access-stellar",
            label: "Move across networks",
            href: "/access",
            tone: "green",
            icon: "send",
            state: "Native USDC via Circle CCTP",
            live: true,
          },
        ]
      : [];
  const tabs = [
    ...(capabilities.length > 0 ? [{ href: "#use", label: "Use" }] : []),
    { href: "#passport", label: "Learn" },
    { href: "#missions", label: "Missions", count: circle.missions.length },
    { href: "#community", label: "Community", count: communityPreview.length },
    { href: "#people", label: "People", count: people.length },
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
          {capabilities.length > 0 ? (
            <section aria-labelledby="circle-use-title" className="c-use" id="use">
              <GlowField tones={["blue", "green", "violet"]} />
              <div className="c-use-head">
                <span className="v-eyebrow">Put it to work</span>
                <h2 id="circle-use-title">What you can do with {circle.code}</h2>
                <p>Opens the official flow or a guide — not investment advice. Vicus never moves funds.</p>
              </div>
              <ActionTray actions={[...useActions, ...sendActions, ...accessActions]} />
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

          <section className="circle-section" id="people">
            <SectionHead eyebrow="People" line="Watchers, contributors, and participants — never balances or holdings." title="People around this asset." />
            {people.length > 0 ? (
              <div className="x-rail">
                {people.slice(0, 8).map((person) => (
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
