import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DataState, Icon } from "@/components/vicus";
import { ExploreBrowser } from "@/components/explore-browser";
import { GlowField, Glyph } from "@/components/vicus-ui";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession, isSessionUnavailableError } from "@/lib/auth/session";
import { listCircles } from "@/lib/data/circles";
import { isAssetCircle } from "@/lib/data/circles";
import { getCircleCapabilities } from "@/lib/utility/service";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import { listActiveCampaignCircles } from "@/lib/campaigns/service";
import { listSpaces } from "@/lib/organizations/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover source-backed tokenized asset Circles across real ecosystems.",
};

export default async function DiscoverPage() {
  let circleData: Awaited<ReturnType<typeof listCircles>> = [];
  let databaseUnavailable = false;

  try {
    const session = await getCurrentSession();
    const allCircles = await listCircles(session?.user.id);
    // Discover means real tokenized assets: education-only content without an
    // underlying asset stays reachable directly but leaves the directory.
    circleData = allCircles.filter(isAssetCircle);
  } catch (error) {
    if (isDatabaseUnavailableError(error) || isSessionUnavailableError(error)) {
      databaseUnavailable = true;
    } else {
      throw error;
    }
  }

  // Real "Use" signal per asset: count of active, source-backed capabilities.
  const useCounts: Record<string, number> = {};
  // Engine truth per asset: which circles expose an available action now,
  // plus their top action labels for discovery cards.
  const usableSlugs: string[] = [];
  const actionLabels: Record<string, string[]> = {};
  let campaignSlugs: string[] = [];
  let spaces: Awaited<ReturnType<typeof listSpaces>> = [];
  if (!databaseUnavailable) {
    const [capabilityLists, spaceList, engineLists, campaigned] = await Promise.all([
      Promise.all(circleData.map((circle) => getCircleCapabilities(circle.slug).catch(() => []))),
      listSpaces().catch(() => []),
      Promise.all(
        circleData.map((circle) =>
          resolveAssetActions(circle.slug, circle.network ?? circle.ecosystem ?? "stellar").catch(() => []),
        ),
      ),
      listActiveCampaignCircles().catch(() => [] as string[]),
    ]);
    circleData.forEach((circle, index) => {
      useCounts[circle.slug] = capabilityLists[index].length;
      const available = (engineLists[index] ?? []).filter((action) => action.state === "available");
      if (available.length > 0) usableSlugs.push(circle.slug);
      actionLabels[circle.slug] = available.slice(0, 3).map((action) => action.title);
    });
    campaignSlugs = campaigned;
    spaces = spaceList;
  }
  const ecosystemCount = new Set(circleData.map((circle) => circle.ecosystem)).size;

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["violet", "blue"]} />
          <div className="shell">
            <span className="v-eyebrow">Discover · Stellar is home</span>
            <h1>Explore</h1>
            <p>Start with Stellar tokenized assets — extend outward where connected ecosystems add more.</p>
            {!databaseUnavailable ? (
              <div className="v-head-stats">
                <span><strong>{circleData.length}</strong> assets</span>
                <span><strong>{ecosystemCount}</strong> ecosystems</span>
                <span title="Ecosystem labels describe where an asset exists. They are not wallet or holder verification.">
                  <Glyph name="shield" size={13} /> Source-backed
                </span>
              </div>
            ) : null}
          </div>
        </header>

        <div className="shell">
          {databaseUnavailable ? (
            <section className="directory-section">
              <DataState title="Discover data is unavailable">
                The database or session service could not provide Discover right now. No fixture fallback is shown.
              </DataState>
            </section>
          ) : (
            <Suspense>
              <ExploreBrowser
                circles={circleData}
                useCounts={useCounts}
                usableSlugs={usableSlugs}
                campaignSlugs={campaignSlugs}
                actionLabels={actionLabels}
              />
            </Suspense>
          )}

          {spaces.length > 0 ? (
            <section aria-labelledby="explore-spaces-title" className="x-spaces">
              <div className="x-block-head">
                <h2 id="explore-spaces-title">Project Spaces</h2>
                <Link href="/spaces">
                  All Spaces <Icon name="arrow-right" size={15} />
                </Link>
              </div>
              <div className="x-rail">
                {spaces.map((space) => (
                  <Link className="space-mini" href={`/spaces/${space.slug}`} key={space.id}>
                    <span className="space-monogram space-monogram-sm">{space.name.slice(0, 1)}</span>
                    <span>
                      <strong>{space.name}</strong>
                      <small>
                        {space.hostedCircleCount} assets · {space.openMissionCount} missions · {space.publishedLessonCount} lessons
                      </small>
                    </span>
                    <Icon name="arrow-right" size={15} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="explore-lab-title" className="x-spaces">
            <div className="x-block-head">
              <h2 id="explore-lab-title">Tokenization Lab</h2>
              <Link href="/lab">
                Open Lab <Icon name="arrow-right" size={15} />
              </Link>
            </div>
            <p className="control-note">
              A hands-on demo on Stellar Testnet — define, trust, issue, verify. Lab assets never
              join the production directory above.
            </p>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
