import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataState, Eyebrow } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getCircleBySlug } from "@/lib/data/circles";
import { canModerateCircleContent, getCommunityPostDetail } from "@/lib/community/service";
import { CommunityPostCard } from "@/components/community-post";
import { CommunityAnswerCard, CommunityAnswerForm, CommunityRemovePostButton, HelpfulButton } from "@/components/community-answer";
import { WalletConnectPrompt } from "@/components/wallet-auth";

type PostPageProps = {
  params: Promise<{ slug: string; postId: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug, postId } = await params;

  try {
    const detail = await getCommunityPostDetail(slug, postId);
    if (!detail) return { title: "Discussion" };
    return { title: detail.post.title, description: detail.post.body.slice(0, 160) };
  } catch {
    return { title: "Discussion" };
  }
}

export default async function CommunityPostPage({ params }: PostPageProps) {
  const { slug, postId } = await params;
  let circle;
  let detail: Awaited<ReturnType<typeof getCommunityPostDetail>>;
  let authenticated = false;
  let viewerId: string | null = null;
  let canRemovePost = false;
  const removableAnswers = new Map<string, boolean>();

  try {
    const session = await getCurrentSession();
    authenticated = Boolean(session);
    viewerId = session?.user.id ?? null;
    circle = await getCircleBySlug(slug, viewerId);
    detail = await getCommunityPostDetail(slug, postId, viewerId);
    if (detail && circle) {
      canRemovePost = await canModerateCircleContent(viewerId, circle.id, detail.post.author.id);
      for (const answer of detail.answers) {
        removableAnswers.set(
          answer.id,
          await canModerateCircleContent(viewerId, circle.id, answer.author.id),
        );
      }
    }
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Discussion data is unavailable">
                The database could not provide this discussion right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!circle || !detail) notFound();

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href={`/circles/${slug}`}>{circle.name}</Link>
            <span>/</span>
            <Link href={`/circles/${slug}/community`}>Community</Link>
            <span>/</span>
            <span>{detail.post.title}</span>
          </nav>

          <CommunityPostCard circleSlug={slug} linkToPost={false} post={detail.post} />

          <div className="mission-footer" style={{ marginTop: 12 }}>
            {authenticated ? (
              <HelpfulButton
                circleSlug={slug}
                initialCount={detail.post.helpfulCount}
                initialHelpful={detail.post.viewerHelpful}
                postId={detail.post.id}
              />
            ) : (
              <WalletConnectPrompt />
            )}
          </div>

          <section className="circle-section" id="answers">
            <div className="circle-section-heading">
              <div>
                <Eyebrow>Answers</Eyebrow>
                <h2>{detail.answers.length === 0 ? "No answers yet." : `${detail.answers.length} answers.`}</h2>
              </div>
              <p>One level only — answers cannot receive replies.</p>
            </div>
            {detail.answers.map((answer) => (
              <CommunityAnswerCard
                answer={answer}
                canRemove={removableAnswers.get(answer.id) ?? false}
                circleSlug={slug}
                key={answer.id}
                postId={detail.post.id}
              />
            ))}
          </section>

          {detail.post.type === "question" ? (
            <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Answer</Eyebrow>
                  <h2>Help the Circle learn.</h2>
                </div>
              </div>
              {authenticated ? (
                <CommunityAnswerForm circleSlug={slug} postId={detail.post.id} />
              ) : (
                <WalletConnectPrompt />
              )}
            </section>
          ) : null}

          {canRemovePost ? (
            <p className="control-note" style={{ marginTop: 16 }}>
              You can moderate this post. Removal is status-based and immediate across all public surfaces.{" "}
              <CommunityRemovePostButton circleSlug={slug} postId={detail.post.id} />
            </p>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
