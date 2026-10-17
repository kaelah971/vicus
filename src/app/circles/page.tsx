import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { getAssetVisual, fallbackMark } from "@/lib/asset-visuals";
import { INTERESTS } from "@/lib/interests";
import { rankCircles } from "@/lib/social-discovery/rank";
import { getCurrentSession } from "@/lib/auth/session";
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
  category: string;
  watched: boolean;
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
  category: string;
  watched?: boolean | null;
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
    category: circle.category,
    watched: circle.watched === true,
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

export default async function CirclesDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; interest?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const interest = typeof params.interest === "string" ? params.interest.slice(0, 40) : "";
  let userId: string | null = null;
  try {
    userId = (await getCurrentSession())?.user.id ?? null;
  } catch {
    userId = null;
  }
  let circles: Awaited<ReturnType<typeof listCircles>> = [];
  let unavailable = false;
  try {
    circles = (await listCircles(userId)).filter(isAssetCircle);
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
  // Explainable order: search filters, then watched, interest match,
  // live activity, quiet. Signed-out viewers get activity order.
  const ranked = rankCircles(
    signals.map((signal) => ({ ...signal, active: signalLine(signal) !== null })),
    { interest, query },
  );
  const ordered = ranked.map((entry) => entry.circle);
  const reasonFor = (slug: string) => ranked.find((entry) => entry.circle.slug === slug)?.reasons ?? [];

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
                  <h2>Browse circles</h2>
                  <form className="s-circle-search" method="get" action="/circles" role="search">
                    <input
                      aria-label="Search circles"
                      defaultValue={query}
                      maxLength={80}
                      name="q"
                      placeholder="Search code, name, or issuer"
                      type="search"
                    />
                    {interest ? <input type="hidden" name="interest" value={interest} /> : null}
                    <button className="button button-outline button-small" type="submit">Search</button>
                  </form>
                  <div className="s-circle-interests" role="group" aria-label="Order by interest">
                    <Link
                      className={`v-chip${!interest ? " tone-green" : ""}`}
                      href={query ? `/circles?q=${encodeURIComponent(query)}` : "/circles"}
                    >
                      All
                    </Link>
                    {INTERESTS.map((entry) => (
                      <Link
                        className={`v-chip${interest === entry.key ? " tone-green" : ""}`}
                        key={entry.key}
                        href={`/circles?interest=${entry.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                      >
                        {entry.label}
                      </Link>
                    ))}
                  </div>
                  {ordered.length === 0 ? (
                    <p className="muted">{query ? `No circles match “${query}”.` : "No circles yet."}</p>
                  ) : (
                    <ul className="s-circle-list">
                      {ordered.map((signal) => {
                        const visual = getAssetVisual(signal.slug);
                        const line = signalLine(signal);
                        const reasons = reasonFor(signal.slug);
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
                              {reasons.length > 0 ? (
                                <small className="s-circle-reason">Why here: {reasons.join(" · ")}</small>
                              ) : null}
                              {signal.latestQuestion ? (
                                <small className="s-circle-latest">“{signal.latestQuestion}”</small>
                              ) : null}
                            </span>
                            <span className="s-circle-actions">
                              <Link className="s-circle-open" href={`/circles/${signal.slug}`}>
                                Open Circle →
                              </Link>
                              <Link className="v-text-link small" href={`/circles/${signal.slug}/community`}>
                                Discuss
                              </Link>
                              <Link className="v-text-link small" href={`/circles/${signal.slug}/conviction`}>
                                Theses
                              </Link>
                            </span>
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
