import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DataState, Icon } from "@/components/vicus";
import { ExploreBrowser } from "@/components/explore-browser";
import { GlowField } from "@/components/vicus-ui";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession, isSessionUnavailableError } from "@/lib/auth/session";
import { listCircles } from "@/lib/data/circles";
import { isAssetCircle } from "@/lib/data/circles";
import { resolveAssetActions } from "@/lib/asset-actions/service";
import { eligibilityForSheetAction } from "@/lib/asset-actions/eligibility";
import { getSubjectForAsset } from "@/lib/subjects/config";
import type { SheetAction, SheetSubject } from "@/components/asset-sheet";
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
  let signedIn = false;

  try {
    const session = await getCurrentSession();
    signedIn = session !== null;
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

  // Engine truth per asset: which circles expose an available action now,
  // plus full action sets for the preview sheet. Subjects resolve from
  // config (no new truth). Tiles carry no action pills — Discover is for
  // choosing an asset, not showing everything it can do.
  const usableSlugs: string[] = [];
  const actionsBySlug: Record<string, SheetAction[]> = {};
  const subjectMap: Record<string, SheetSubject> = {};
  let campaignSlugs: string[] = [];
  let spaces: Awaited<ReturnType<typeof listSpaces>> = [];
  if (!databaseUnavailable) {
    const [spaceList, engineLists, campaigned] = await Promise.all([
      listSpaces().catch(() => []),
      Promise.all(
        circleData.map((circle) =>
          resolveAssetActions(circle.slug, circle.network ?? circle.ecosystem ?? "stellar").catch(() => []),
        ),
      ),
      listActiveCampaignCircles().catch(() => [] as string[]),
    ]);
    circleData.forEach((circle, index) => {
      const resolved = engineLists[index] ?? [];
      const available = resolved.filter((action) => action.state === "available");
      if (available.length > 0) usableSlugs.push(circle.slug);
      actionsBySlug[circle.slug] = resolved.map((action) => {
        const eligibility = eligibilityForSheetAction(
          {
            assetSlug: circle.slug,
            kind: action.kind,
            state: action.state,
            executionMode: action.executionMode,
            network: action.network,
            eligibilityNote: action.eligibilityNote,
            href: action.href,
            siblings: resolved.map((sibling) => ({
              kind: sibling.kind,
              title: sibling.title,
              state: sibling.state,
              executionMode: sibling.executionMode,
              href: sibling.href,
            })),
          },
          { signedIn, walletPublicKey: null },
        );
        return {
        kind: action.kind,
        title: action.title,
        description: action.description,
        state: action.state,
        stateLabel: action.stateLabel,
        href: action.href,
        external: action.external,
        eligibilityNote: action.eligibilityNote,
        sourceUrl: action.sourceUrl,
        eligibilityState: eligibility.state,
        eligibilityExplanation: eligibility.explanation,
        eligibilityNextStep: eligibility.nextAction,
        eligibilityAlternative: eligibility.alternative
          ? {
              title: eligibility.alternative.title,
              href: eligibility.alternative.href,
              why: eligibility.alternative.whySupported,
            }
          : null,
        };
      });
      const subject = getSubjectForAsset(circle.slug);
      subjectMap[circle.slug] = subject
        ? { name: subject.name, slug: subject.slug, type: subject.type, siblingSlugs: [...subject.representations] }
        : null;
    });
    campaignSlugs = campaigned;
    spaces = spaceList;
  }
  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="v-page-head">
          <GlowField tones={["violet", "blue"]} />
          <div className="shell">
            <span className="v-eyebrow">Discover · Stellar is home</span>
            <h1>Discover</h1>
            <p>Tokenized assets, starting on Stellar.</p>
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
                usableSlugs={usableSlugs}
                campaignSlugs={campaignSlugs}
                actionsBySlug={actionsBySlug}
                subjectMap={subjectMap}
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
