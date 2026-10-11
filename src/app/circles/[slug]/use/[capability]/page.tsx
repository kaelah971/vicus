import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataState, Eyebrow } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCircleBySlug } from "@/lib/data/circles";
import { getCapabilityDetail, supportModeBadge } from "@/lib/utility/service";

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
  let detail: Awaited<ReturnType<typeof getCapabilityDetail>> = null;
  let databaseUnavailable = false;

  try {
    [circle, detail] = await Promise.all([
      getCircleBySlug(slug),
      getCapabilityDetail(slug, capability),
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

  if (!circle || !detail) notFound();

    const ctaHref = detail.destinationUrl ?? detail.sourceUrl;
    const externalExecution = detail.supportMode !== "in_vicus";

    return (
      <AppShell active="discover">
        <main className="page-main">
          <header className="page-intro">
            <div className="shell page-intro-grid">
              <div>
                <nav className="breadcrumbs" aria-label="Breadcrumb">
                  <Link href="/discover">Discover</Link>
                  <span>/</span>
                  <Link href={`/circles/${circle.slug}`}>{circle.name}</Link>
                  <span>/</span>
                  <span>{detail.title}</span>
                </nav>
                <Eyebrow>{supportModeBadge[detail.supportMode]}</Eyebrow>
                <h1>
                  {detail.title} {detail.circleName}.
                </h1>
                <p>{detail.shortDescription}</p>
              </div>
              <div className="page-intro-note">
                <strong>
                  {detail.circleName} · {circle.ecosystemLabel}
                </strong>
                {externalExecution
                  ? " This action executes outside Vicus — in your own wallet or the official flow. Vicus never moves funds."
                  : null}
              </div>
            </div>
          </header>

          <div className="shell circle-page-body">
            <section className="circle-section" aria-labelledby="capability-how-title">
              <div className="circle-section-heading">
                <div>
                  <Eyebrow>How it works</Eyebrow>
                  <h2 id="capability-how-title">What this action means.</h2>
                </div>
              </div>
              <div className="content-panel">
                <p>{detail.shortDescription}</p>
                {detail.eligibilityNote ? <p>{detail.eligibilityNote}</p> : null}
                <p>
                  Source:{" "}
                  <a href={detail.sourceUrl} rel="noreferrer" target="_blank">
                    {detail.sourceUrl}
                  </a>
                </p>
                <p>
                  <a
                    className="mission-action-link"
                    href={ctaHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {detail.ctaLabel}
                  </a>
                </p>
              </div>
            </section>

            <p className="control-note">
              Educational context only — not financial advice. <Link href={`/circles/${circle.slug}`}>Back to {circle.name}</Link>
            </p>
          </div>
        </main>
      </AppShell>
    );
}
