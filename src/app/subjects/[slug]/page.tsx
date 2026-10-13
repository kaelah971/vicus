import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { isDatabaseUnavailableError } from "@/db";
import { getSubjectView } from "@/lib/subjects/service";
import { listSubjectTheses } from "@/lib/conviction/service";
import { getSubjectDef } from "@/lib/subjects/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asset subject",
  description: "One real-world subject, its exact verified onchain representations.",
};

function RepresentationCard({ rep }: { rep: Awaited<ReturnType<typeof getSubjectView>>["representations"][number] }) {
  return (
    <div className="watch-card">
      <p>
        <strong>{rep.code}</strong>
        <span className="muted"> · {rep.network}</span>
      </p>
      <p className="muted small">{rep.issuer} · {rep.assetClass}</p>
      {rep.contractOrMint ? (
        <p className="muted small mono">{rep.contractOrMint.slice(0, 10)}…{rep.contractOrMint.slice(-6)}</p>
      ) : (
        <p className="muted small">Contract: Not published in Vicus source set</p>
      )}
      {rep.availableKinds.length > 0 ? (
        <p className="muted small">Can use: {rep.availableKinds.join(" · ")}</p>
      ) : (
        <p className="muted small">No executable Vicus action right now</p>
      )}
      {rep.eligibilityNote ? <p className="muted small">{rep.eligibilityNote}</p> : null}
      <div className="row">
        <Link className="button button-outline button-small" href={rep.openHref}>Open asset</Link>
        {rep.verificationSourceUrl ? (
          <a className="button button-outline button-small" href={rep.verificationSourceUrl} target="_blank" rel="noreferrer">Source</a>
        ) : null}
      </div>
    </div>
  );
}

export default async function SubjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getSubjectDef(slug)) notFound();
  let subject;
  try {
    subject = await getSubjectView(slug);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Subject data is unavailable">The database could not provide this subject right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  const siblings = subject.representations.length > 1
    ? `/compare?assets=${subject.representations.map((r) => r.assetSlug).slice(0, 2).join(",")}`
    : null;
  const subjectTheses = await listSubjectTheses(slug, 5).catch(() => []);

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">{subject.type} · {subject.representations.length} verified representation{subject.representations.length === 1 ? "" : "s"}</p>
              <h1>{subject.name}</h1>
              <p className="muted">{subject.description}</p>
              {!subject.hasStellarRepresentation ? (
                <p className="muted"><strong>No verified Stellar representation in Vicus.</strong> Other verified onchain representations below.</p>
              ) : (
                <p className="muted">Stellar-native representations are the hero below.</p>
              )}
              <div className="row">
                {siblings ? <Link className="button button-outline button-small" href={siblings}>Compare representations</Link> : null}
                <a className="button button-outline button-small" href={subject.sourceUrl} target="_blank" rel="noreferrer">Issuer source</a>
              </div>
            </section>
            <section className="card">
              <h2>{subject.hasStellarRepresentation ? "On Stellar" : "Other verified onchain representations"}</h2>
              <div className="watch-grid">
                {subject.representations.filter((r) => r.ecosystem === "stellar").map((rep) => (
                  <RepresentationCard key={rep.assetSlug} rep={rep} />
                ))}
              </div>
              {!subject.hasStellarRepresentation || subject.representations.some((r) => r.ecosystem !== "stellar") ? (
                <>
                  {subject.hasStellarRepresentation ? <h2>Beyond Stellar</h2> : null}
                  <div className="watch-grid">
                    {subject.representations.filter((r) => r.ecosystem !== "stellar").map((rep) => (
                      <RepresentationCard key={rep.assetSlug} rep={rep} />
                    ))}
                  </div>
                </>
              ) : null}
            </section>
            <section className="card">
              <h2>Conviction around {subject.name} ({subjectTheses.length})</h2>
              {subjectTheses.length === 0 ? (
                <p className="muted">No theses bound to this subject yet.</p>
              ) : (
                subjectTheses.map((thesis) => (
                  <p key={thesis.id} className="muted">
                    <strong>{thesis.title}</strong> · @{thesis.authorHandle} · {thesis.confidence}% · {thesis.status}
                  </p>
                ))
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
