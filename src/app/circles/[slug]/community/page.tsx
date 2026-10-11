import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataState, EmptyState, Eyebrow } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getCircleBySlug } from "@/lib/data/circles";
import { listCirclePosts, type CommunityPostType } from "@/lib/community/service";
import { CommunityPostCard, CommunityPostForm } from "@/components/community-post";
import { WalletConnectPrompt } from "@/components/wallet-auth";

type CommunityPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
};

export const dynamic = "force-dynamic";

const tabs: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "question", label: "Questions" },
  { value: "insight", label: "Insights" },
  { value: "source", label: "Sources" },
];

export async function generateMetadata({ params }: CommunityPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const circle = await getCircleBySlug(slug);
    if (!circle) return { title: "Community" };
    return {
      title: `${circle.name} community`,
      description: `Questions, insights, and sources from the ${circle.name} Circle.`,
    };
  } catch {
    return { title: "Community" };
  }
}

export default async function CircleCommunityPage({ params, searchParams }: CommunityPageProps) {
  const { slug } = await params;
  const { type } = await searchParams;
  const activeTab = type === "question" || type === "insight" || type === "source" ? type : "all";
  const filter: CommunityPostType | null = activeTab === "all" ? null : activeTab;

  let circle;
  let posts: Awaited<ReturnType<typeof listCirclePosts>> = [];
  let authenticated = false;
  try {
    const session = await getCurrentSession();
    authenticated = Boolean(session);
    circle = await getCircleBySlug(slug, session?.user.id);
    if (circle) {
      posts = await listCirclePosts(slug, filter, session?.user.id);
    }
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Community data is unavailable">
                The database could not provide this community right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!circle) notFound();

  const tabHref = (value: string) =>
    value === "all" ? `/circles/${slug}/community` : `/circles/${slug}/community?type=${value}`;

  return (
    <AppShell active="discover">
      <main className="page-main">
        <header className="page-intro">
          <div className="shell page-intro-grid">
            <div>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href={`/circles/${slug}`}>{circle.name}</Link>
                <span>/</span>
                <span>Community</span>
              </nav>
              <Eyebrow>Circle community</Eyebrow>
              <h1>Learn {circle.name} together.</h1>
              <p>
                Questions, insights, and community sources tied to this asset. Insights are
                educational — never investment recommendations or price predictions.
              </p>
            </div>
            <div className="page-intro-note">
              <strong>{`${posts.length} contributions`}</strong>
              Structured around the asset. No chat rooms, no DMs.
            </div>
          </div>
        </header>

        <div className="shell circle-page-body">
          <Suspense>
            <div className="filter-bar" role="group" aria-label="Filter community">
              {tabs.map((tab) => (
                <Link
                  aria-current={activeTab === tab.value ? "page" : undefined}
                  className={`nav-link${activeTab === tab.value ? " nav-link-active" : ""}`}
                  href={tabHref(tab.value)}
                  key={tab.value}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </Suspense>

          {posts.length > 0 ? (
            <div className="mission-grid">
              {posts.map((post) => (
                <CommunityPostCard circleSlug={slug} key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <section className="directory-section">
              <EmptyState title="No contributions yet">
                Ask the first question or share the first insight for this Circle.
              </EmptyState>
            </section>
          )}

          <section className="hairline-card admin-panel" style={{ marginTop: 24 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Contribute</Eyebrow>
                <h2>Add to this Circle.</h2>
              </div>
              <p>Posted under your public Vicus identity. Community sources stay distinct from official Passport sources.</p>
            </div>
            {authenticated ? <CommunityPostForm circleSlug={slug} /> : <WalletConnectPrompt />}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
