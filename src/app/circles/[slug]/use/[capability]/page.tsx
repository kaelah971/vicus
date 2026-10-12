import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataState, Icon } from "@/components/vicus";
import {
  ActionTray,
  AssetToken,
  Chip,
  EcoChip,
  GlowField,
  Glyph,
  MissionStrip,
  Orb,
  capabilityMeta,
  type ActionItem,
} from "@/components/vicus-ui";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCircleBySlug } from "@/lib/data/circles";
import {
  getCapabilityDetail,
  getCircleCapabilities,
  isSupportedCapabilityType,
  supportModeBadge,
} from "@/lib/utility/service";
import { getActivationMissionLinks } from "@/lib/activation/service";
import { rewardNetworkLabel } from "@/lib/rewards/display";

type CapabilityPageProps = {
  params: Promise<{ slug: string; capability: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CapabilityPageProps): Promise<Metadata> {
  const { slug, capability } = await params;
  try {
    const detail = await getCapabilityDetail(slug, capability);
    if (!detail) return { title: "Use" };
    return {
      title: `${detail.title} ${detail.circleName}`,
      description: detail.shortDescription,
    };
  } catch {
    return { title: "Use" };
  }
}

export default async function CapabilityPage({ params }: CapabilityPageProps) {
  const { slug, capability } = await params;

  let circle: Awaited<ReturnType<typeof getCircleBySlug>> | null = null;
  let capabilities: Awaited<ReturnType<typeof getCircleCapabilities>> = [];
  let databaseUnavailable = false;

  try {
    [circle, capabilities] = await Promise.all([
      getCircleBySlug(slug),
      isSupportedCapabilityType(capability) ? getCircleCapabilities(slug) : Promise.resolve([]),
    ]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  if (databaseUnavailable) {
    return (
      <AppShell active="discover">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Capability data is unavailable">
              The database could not provide this capability right now.
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  const detail = capabilities.find((entry) => entry.capabilityType === capability) ?? null;
  if (!circle || !detail) notFound();

  const activationLinks = await getActivationMissionLinks(circle.id);
  const missionLink = activationLinks.get(detail.capabilityType);
  const mission = missionLink ? circle.missions.find((entry) => entry.id === missionLink.id) ?? null : null;
  const ctaHref = detail.destinationUrl ?? detail.sourceUrl;
  // Avoid repeating the boundary when the stored eligibility note already states it.
  const externalExecution =
    detail.supportMode !== "in_vicus" && !(detail.eligibilityNote ?? "").toLowerCase().includes("outside vicus");
  const meta = capabilityMeta(detail.capabilityType);
  const siblings: ActionItem[] = capabilities
    .filter((entry) => entry.capabilityType !== detail.capabilityType)
    .map((entry) => {
      const entryMeta = capabilityMeta(entry.capabilityType);
      return {
        key: entry.id,
        label: entry.title,
        href: `/circles/${circle.slug}/use/${entry.capabilityType}`,
        tone: entryMeta.tone,
        icon: entryMeta.icon,
        state: activationLinks.has(entry.capabilityType) ? "Mission available" : supportModeBadge[entry.supportMode],
        live: activationLinks.has(entry.capabilityType),
      };
    });

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell u-page">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/discover">Explore</Link>
            <span>/</span>
            <Link href={`/circles/${circle.slug}`}>{circle.name}</Link>
            <span>/</span>
            <span>{detail.title}</span>
          </nav>

          <section className={`u-sheet tone-${meta.tone}`} aria-labelledby="capability-title">
            <GlowField tones={[meta.tone, "violet"]} />
            <div className="u-sheet-head">
              <span className="u-sheet-icons">
                <Orb icon={meta.icon} size="lg" tone={meta.tone} />
                <AssetToken code={circle.code} ecosystem={circle.ecosystem} ecosystemLabel={circle.ecosystemLabel} size="md" />
              </span>
              <div>
                <div className="c-chips">
                  <Chip tone={meta.tone}>{supportModeBadge[detail.supportMode]}</Chip>
                  <EcoChip ecosystem={circle.ecosystem} label={circle.ecosystemLabel} />
                </div>
                <h1 id="capability-title">
                  {detail.title} {detail.circleName}
                </h1>
                <p>{detail.shortDescription}</p>
              </div>
            </div>

            {detail.eligibilityNote ? (
              <p className="u-note">
                <Glyph name="shield" size={15} /> {detail.eligibilityNote}
              </p>
            ) : null}
            {externalExecution ? (
              <p className="u-note">
                <Glyph name="lock" size={15} /> Runs outside Vicus — in your own wallet or the official flow. Vicus never moves funds.
              </p>
            ) : null}

            <div className="v-button-row">
              <a className="button button-white" href={ctaHref} rel="noreferrer" target="_blank">
                {detail.ctaLabel} <Icon name="external" size={15} />
              </a>
              <a className="button button-glass" href={detail.sourceUrl} rel="noreferrer" target="_blank">
                Source <Icon name="external" size={14} />
              </a>
            </div>
          </section>

          {mission ? (
            <MissionStrip
              context={`${circle.name} · prove it onchain`}
              href={`/missions/${mission.id}`}
              points={mission.points}
              reward={mission.reward}
              rewardNetwork={rewardNetworkLabel()}
              title={mission.title}
            />
          ) : null}

          {siblings.length > 0 ? (
            <section className="u-more" aria-labelledby="capability-more-title">
              <h2 id="capability-more-title">More with {circle.code}</h2>
              <ActionTray actions={siblings} />
            </section>
          ) : null}

          <p className="control-note">
            Educational context only — not financial advice. <Link href={`/circles/${circle.slug}`}>Back to {circle.name}</Link>
          </p>
        </div>
      </main>
    </AppShell>
  );
}
