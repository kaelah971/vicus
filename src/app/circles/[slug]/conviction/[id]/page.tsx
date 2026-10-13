import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { ThesisActions } from "@/components/thesis-actions";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { ConvictionError, getThesis } from "@/lib/conviction/service";

export const dynamic = "force-dynamic";

export default async function ThesisDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    session = null;
  }
  let thesis;
  try {
    thesis = await getThesis(id);
  } catch (error) {
    if (error instanceof ConvictionError) notFound();
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Thesis unavailable">The database could not provide this thesis right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }
  const backHref = thesis.circleSlug ? `/circles/${thesis.circleSlug}/conviction` : `/subjects/${thesis.subjectSlug}`;

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">
                {thesis.thesisType === "verified-position" ? "Verified position at creation" : thesis.thesisType === "agent-paper" ? "Agent paper" : "Paper thesis"} · {thesis.status}
              </p>
              <h1>{thesis.title}</h1>
              <p>{thesis.claim}</p>
              <p className="muted small">
                @{thesis.authorHandle} · {thesis.confidence}% author confidence (not a model probability) · {thesis.timeframe}
                {thesis.closesAt ? ` · closes ${thesis.closesAt.slice(0, 10)}` : ""} · created {thesis.createdAt.slice(0, 10)}
              </p>
              {thesis.outcomeNote ? (
                <p className="muted"><strong>Outcome:</strong> {thesis.outcomeNote}</p>
              ) : null}
            </section>
            <section className="card">
              <h2>Evidence ({thesis.evidence.length})</h2>
              {thesis.evidence.length === 0 ? (
                <p className="muted">No cited evidence.</p>
              ) : (
                thesis.evidence.map((entry, index) => (
                  <p key={index} className="muted">
                    [{entry.kind}] {entry.label}
                    {entry.url ? <> · <a href={entry.url} target="_blank" rel="noreferrer">source</a></> : null}
                  </p>
                ))
              )}
            </section>
            <section className="card">
              <div className="row">
                <Link className="button button-outline button-small" href={backHref}>Back</Link>
              </div>
              {session ? <ThesisActions thesisId={thesis.id} isAuthor={session.user.handle === thesis.authorHandle} /> : null}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
