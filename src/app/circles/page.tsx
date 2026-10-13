import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { getAssetVisual, fallbackMark } from "@/lib/asset-visuals";
import { isDatabaseUnavailableError } from "@/db";
import { isAssetCircle, listCircles } from "@/lib/data/circles";
import { getCircleSocialSummary } from "@/lib/circles-social/service";
import { getEcosystemCommunityActivity, listCirclePosts } from "@/lib/community/service";
import { listCircleTheses } from "@/lib/conviction/service";
import { listCircleCampaigns, listLiveCampaigns } from "@/lib/campaigns/service";

export const dynamic = "force-dynamic";

type CircleSignal = {
  slug: string;
  code: string;
  name: string;
  issuer: string;
  questions: number;
  latestQuestion: string | null;
  contributors: number;
  watchers: number;
  theses: number;
  campaigns: number;
};

async function circleSignal(circle: {
  slug: string;
  code: string;
  name: string;
  issuerSource: string;
}): Promise<CircleSignal> {
  const [social, questions, theses, campaigns] = await Promise.all([
    getCircleSocialSummary(circle.slug, null).catch(() => null),
    listCirclePosts(circle.slug, "question", null, 3).catch(() => []),
    listCircleTheses(circle.slug, 3).catch(() => []),
    listCircleCampaigns(circle.slug).catch(() => []),
  ]);
  return {
    slug: circle.slug,
    code: circle.code,
    name: circle.name,
    issuer: circle.issuerSource,
    questions: questions.length,
    latestQuestion: questions[0]?.title ?? null,
    contributors: social ? social.groups.contributors.length : 0,
    watchers: social ? social.groups.watching.length : 0,
    theses: theses.length,
    campaigns: campaigns.length,
  };
}

function signalLine(signal: CircleSignal): string | null {
  const parts: string[] = [];
  if (signal.questions > 0) parts.push(`${signal.questions} ${signal.questions === 1 ? "question" : "questions"}`);
  if (signal.theses > 0) parts.push(`${signal.theses} ${signal.theses === 1 ? "thesis" : "theses"}`);
  if (signal.contributors > 0) parts.push(`${signal.contributors} ${signal.contributors === 1 ? "contributor" : "contributors"}`);
  if (signal.campaigns > 0) parts.push("active campaign");
  if (signal.watchers > 0 && parts.length === 0) parts.push(`${signal.watchers} watching`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function CirclesDirectoryPage() {
  let circles: Awaited<ReturnType<typeof listCircles>> = [];
  let unavailable = false;
  try {
    circles = (await listCircles(null)).filter(isAssetCircle);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      unavailable = true;
    } else {
      throw error;
    }
  }

  let signals: CircleSignal[] = [];
  let stellarActivity: Awaited<ReturnType<typeof getEcosystemCommunityActivity>> = [];
  let liveCampaigns: Awaited<ReturnType<typeof listLiveCampaigns>> = [];
  if (!unavailable) {
    [signals, stellarActivity, liveCampaigns] = await Promise.all([
      Promise.all(circles.map(circleSignal)).catch(() => []),
      getEcosystemCommunityActivity("stellar", 4).catch(() => []),
      listLiveCampaigns().catch(() => []),
    ]);
  }
  const active = signals.filter((signal) => signalLine(signal) !== null);
  const quiet = signals.filter((signal) => signalLine(signal) === null);
  const ordered = [...active, ...quiet];

  return (
    <AppShell active="circles">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Circles</p>
              <h1>People around assets</h1>
              <p className="muted">Questions, theses and campaigns around tokenized assets.</p>
            </section>
            {unavailable ? (
              <DataState title="Circles are unavailable">The database could not provide circles right now.</DataState>
            ) : (
              <>
                <section className="card" aria-label="Active circles">
                  <h2>Active circles</h2>
                  {ordered.length === 0 ? (
                    <p className="muted">No circles yet.</p>
                  ) : (
                    <ul className="s-circle-list">
                      {ordered.map((signal) => {
                        const visual = getAssetVisual(signal.slug);
                        const line = signalLine(signal);
                        return (
                          <li key={signal.slug} className="s-circle-card">
                            <span className="s-circle-visual" aria-hidden="true">
                              {visual?.localSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={visual.localSrc} alt="" loading="lazy" />
                              ) : (
                                <span className="v-tile-mark v-tile-mark-sm">{fallbackMark(signal.code)}</span>
                              )}
                            </span>
                            <span className="s-circle-main">
                              <strong>{signal.code}</strong>
                              <small>{signal.issuer}</small>
                              {line ? <small className="s-circle-signal">{line}</small> : <small className="s-circle-signal">New circle — be the first to ask.</small>}
                              {signal.latestQuestion ? (
                                <small className="s-circle-latest">“{signal.latestQuestion}”</small>
                              ) : null}
                            </span>
                            <Link className="s-circle-open" href={`/circles/${signal.slug}`}>
                              Open Circle →
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {stellarActivity.length > 0 ? (
                  <section className="card" aria-label="Recent activity">
                    <h2>Recent activity</h2>
                    <ul className="s-activity-list">
                      {stellarActivity.slice(0, 4).map((item) => (
                        <li key={`${item.kind}-${item.id}`}>
                          <Link href={`/circles/${item.circleSlug}/community/${item.postId}`}>
                            <small>@{item.authorHandle}</small>
                            <strong>
                              {item.kind === "answer" ? "answered" : item.type === "question" ? "asked" : "posted"} in {item.circleName}
                            </strong>
                            <span>“{item.title}”</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {liveCampaigns.length > 0 ? (
                  <section className="card" aria-label="Live campaigns">
                    <h2>Live campaigns</h2>
                    <ul className="s-activity-list">
                      {liveCampaigns.slice(0, 3).map((campaign) => (
                        <li key={campaign.id}>
                          <Link href={`/campaigns/${campaign.id}`}>
                            <small>{campaign.circleName}</small>
                            <strong>{campaign.objective}</strong>
                            <span>
                              Earn {campaign.rewardPerCompletion ?? "—"} {campaign.rewardAsset}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <p className="muted small">
                  Looking for utility instead? <Link href="/use">Put assets to work →</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
