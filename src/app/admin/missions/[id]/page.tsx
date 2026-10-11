import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DataState, EmptyState, Eyebrow, MetricCard, StatusPill } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getAdminMissionDetail } from "@/lib/data/admin";
import { getAdminSubmissionQueue } from "@/lib/data/missions";
import { AdminReviewQueue } from "@/components/admin-review-queue";
import { AdminMissionStatusControl } from "@/components/admin-mission-status-control";

type MissionAdminPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign detail",
  description: "Inspect a Vicus mission, its reward configuration, and its reviews.",
};

function rewardLabel(rewardAsset: string | null, rewardAmount: string | null) {
  if (rewardAsset && rewardAmount) return `${rewardAmount} ${rewardAsset} · Stellar Testnet`;
  return "No XLM reward configured";
}

export default async function AdminMissionPage({ params }: MissionAdminPageProps) {
  const { id } = await params;

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Admin data is unavailable">
                The database could not provide the signed-in admin session.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session || session.user.role !== "admin") {
    return (
      <AppShell active="admin">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Admin access requires a signed-in admin wallet">
              Campaign detail is protected by the Vicus session.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let detail;
  let queue;
  try {
    [detail, queue] = await Promise.all([
      getAdminMissionDetail(id),
      getAdminSubmissionQueue({ missionId: id }),
    ]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Campaign data is unavailable">
                The database could not provide this mission right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!detail) notFound();

  return (
    <AppShell active="admin">
      <main className="page-main">
        <div className="shell circle-page-body">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/admin">Campaign Studio</Link>
            <span>/</span>
            <span>{detail.title}</span>
          </nav>

          <header className="circle-identity">
            <div>
              <StatusPill tone={detail.status === "open" ? "green" : "muted"}>{detail.status}</StatusPill>
              <h1>{detail.title}</h1>
              <p className="circle-identity-meta">
                <Link href={`/circles/${detail.circle.slug}`}>{detail.circle.name}</Link>
                {" · "}
                {detail.circle.ecosystemLabel} · {detail.type} · {detail.reviewMode} review
              </p>
              <p>
                {detail.points} Vicus points · {rewardLabel(detail.rewardAsset, detail.rewardAmount)}.
                Asset ecosystem and reward network are separate: rewards settle as XLM on Stellar.
              </p>
              <p className="control-note">
                {detail.status === "open"
                  ? "Open — participant-visible. Submissions follow existing mission rules."
                  : "Draft — admin-only. Not participant-discoverable; submissions blocked."}
              </p>
            </div>
            <AdminMissionStatusControl missionId={detail.id} status={detail.status} />
          </header>

          <div className="profile-metrics">
            <MetricCard detail="Waiting for admin action" label="Pending" value={String(detail.submissions.pending)} />
            <MetricCard detail="Approved contributions" label="Approved" value={String(detail.submissions.approved)} accent />
            <MetricCard detail="Revision or rejection records" label="Revision + rejected" value={String(detail.submissions.needsRevision + detail.submissions.rejected)} />
            <MetricCard detail="All submission records" label="Total" value={String(detail.submissions.total)} />
          </div>

          <section className="hairline-card admin-panel" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Reviews</Eyebrow>
                <h2>Every response, one state.</h2>
              </div>
              <p>Approval awards points and makes configured XLM rewards eligible — nothing is sent automatically.</p>
            </div>
            {queue.length > 0 ? (
              <AdminReviewQueue submissions={queue} />
            ) : (
              <EmptyState title="No submissions yet">
                Responses to this mission will appear here for review.
              </EmptyState>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
