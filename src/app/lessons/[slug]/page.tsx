import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataState, EmptyState, Eyebrow, Icon } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getCircleBySlug } from "@/lib/data/circles";
import { getLessonBySlug } from "@/lib/organizations/service";

type LessonPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const lesson = await getLessonBySlug(slug);
    if (!lesson) return { title: "Lesson" };
    return {
      title: lesson.title,
      description: lesson.summary,
    };
  } catch {
    return { title: "Lesson" };
  }
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { slug } = await params;
  let lesson;

  try {
    const session = await getCurrentSession();
    lesson = await getLessonBySlug(slug, session?.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell>
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Lesson data is unavailable">
                The database could not provide this lesson right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  if (!lesson) notFound();

  let relatedMission: { id: string; title: string } | null = null;
  if (lesson.circle) {
    try {
      const circle = await getCircleBySlug(lesson.circle.slug);
      const first = circle?.missions.find((mission) => mission.status === "open") ?? null;
      relatedMission = first ? { id: first.id, title: first.title } : null;
    } catch {
      relatedMission = null;
    }
  }

  const paragraphs = lesson.body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <AppShell>
      <main className="page-main">
        <header className="mission-page-header">
          <div className="shell">
            <div className="breadcrumbs">
              <Link href={`/spaces/${lesson.organization.slug}`}>{lesson.organization.name}</Link>
              <span>/</span>
              <span>{lesson.title}</span>
            </div>
            <Eyebrow>
              Lesson · {lesson.readingMinutes} min read · Hosted by {lesson.organization.name}
            </Eyebrow>
            <h1>{lesson.title}</h1>
            <p>{lesson.summary}</p>
            {lesson.circle ? (
              <p className="circle-identity-meta">
                Associated Circle: <Link href={`/circles/${lesson.circle.slug}`}>{lesson.circle.name}</Link>
              </p>
            ) : null}
          </div>
        </header>

        <div className="shell mission-page-body">
          <div className="mission-detail-grid">
            <section className="content-panel">
              <Eyebrow>Read and learn</Eyebrow>
              <h2>Understand before you respond.</h2>
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
            <section className="content-panel mission-boundary-panel">
              <Eyebrow>Official sources</Eyebrow>
              <h2>Check the primary material.</h2>
              {lesson.sources.length > 0 ? (
                <ul>
                  {lesson.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} rel="noreferrer" target="_blank">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No sources attached">
                  This lesson does not reference official material yet.
                </EmptyState>
              )}
              <div className="section-note">
                Organization authorship does not make a claim automatically trustworthy. Educational
                material is not financial advice.
              </div>
            </section>
          </div>

          {relatedMission ? (
            <div className="mission-page-footer">
              <Icon name="arrow-right" size={15} />
              <span>
                Ready to prove understanding? <Link href={`/missions/${relatedMission.id}`}>{relatedMission.title}</Link>
              </span>
            </div>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
