import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { ThesisForm } from "@/components/thesis-form";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { getCircleBySlug } from "@/lib/data/circles";
import { listCirclePosts } from "@/lib/community/service";
import { listCircleTheses } from "@/lib/conviction/service";

export const dynamic = "force-dynamic";

export default async function CircleConvictionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let session;
  let circle;
  try {
    session = await getCurrentSession();
    circle = await getCircleBySlug(slug, session?.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Conviction data is unavailable">The database could not provide theses right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }
  if (!circle) notFound();
  const [theses, posts] = await Promise.all([
    listCircleTheses(slug).catch(() => []),
    listCirclePosts(slug, null, session?.user.id).catch(() => []),
  ]);
  const open = theses.filter((thesis) => thesis.status === "open");
  const closed = theses.filter((thesis) => thesis.status !== "open");

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Conviction · paper theses</p>
              <h1>Theses on {circle.code}</h1>
              <p className="muted">
                Structured claims with evidence, timeframe, and author confidence — never
                investment advice, never a position claim unless explicitly verified.
              </p>
            </section>
            <section className="card">
              <h2>Open ({open.length})</h2>
              {open.length === 0 ? (
                <p className="muted">No open theses yet. Publish the first structured claim below.</p>
              ) : (
                open.map((thesis) => (
                  <div className="watch-row" key={thesis.id}>
                    <div>
                      <p>
                        <strong>{thesis.title}</strong>
                        <span className="muted"> · @{thesis.authorHandle}</span>
                      </p>
                      <p className="muted small">
                        {thesis.thesisType === "verified-position" ? "VERIFIED POSITION · " : "PAPER · "}
                        {thesis.confidence}% confidence · {thesis.timeframe} · Evidence {thesis.evidence.length}
                      </p>
                    </div>
                    <Link className="button button-outline button-small" href={`/circles/${slug}/conviction/${thesis.id}`}>
                      Open thesis
                    </Link>
                  </div>
                ))
              )}
            </section>
            {closed.length > 0 ? (
              <section className="card">
                <h2>Resolved & withdrawn ({closed.length})</h2>
                {closed.slice(0, 10).map((thesis) => (
                  <p key={thesis.id} className="muted">
                    <Link href={`/circles/${slug}/conviction/${thesis.id}`}>{thesis.title}</Link>
                    {" · "}{thesis.status}{thesis.outcomeNote ? ` — ${thesis.outcomeNote.slice(0, 120)}` : ""}
                  </p>
                ))}
              </section>
            ) : null}
            <section className="card">
              <h2>Publish thesis</h2>
              {session ? (
                <ThesisForm
                  circleSlug={slug}
                  posts={posts.slice(0, 8).map((post) => ({ id: post.id, title: post.title, type: post.type }))}
                  linkableAssets={[{ slug, code: circle.code }]}
                />
              ) : (
                <WalletConnectPrompt />
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
