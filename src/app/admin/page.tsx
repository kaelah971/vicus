import type { Metadata } from "next";
import Link from "next/link";
import {
  DataState,
  EmptyState,
  Eyebrow,
  Icon,
  MetricCard,
  StatusPill,
} from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getAdminMissions, getAdminOverview } from "@/lib/data/admin";
import { getAdminSubmissionQueue } from "@/lib/data/missions";
import { AdminReviewQueue } from "@/components/admin-review-queue";
import { MissionCreateForm } from "@/components/mission-create-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign Studio",
  description: "Create Vicus missions, configure Stellar rewards, and review contributions."
};

type AdminPageProps = {
  searchParams: Promise<{ status?: string; circle?: string }>;
};

function statusLabel(status: string) {
  return status.replaceAll("-", " ");
}

function rewardLabel(rewardAsset: string | null, rewardAmount: string | null) {
  if (rewardAsset && rewardAmount) return `${rewardAmount} ${rewardAsset} · Stellar Testnet`;
  return "No reward";
}

const queueStatuses = ["pending", "needs_revision", "approved", "rejected"] as const;

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : null;
  const circleFilter = typeof params.circle === "string" ? params.circle : null;

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
                The database could not provide the signed-in admin session. No review action was run.
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
              Review actions are protected by the Vicus session. Add the verified wallet to
              VICUS_ADMIN_WALLET_ADDRESSES, then connect it with Freighter.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let overview;
  let missionRecords;
  let reviewQueue;

  try {
    [overview, missionRecords, reviewQueue] = await Promise.all([
      getAdminOverview(),
      getAdminMissions(),
      getAdminSubmissionQueue({ status: statusFilter, circleSlug: circleFilter }),
    ]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="admin">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Admin data is unavailable">
                The database could not provide campaign data right now. No fixture fallback is being shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }

    throw error;
  }

  const studioCircles = Array.from(
    new Map(missionRecords.map((mission) => [mission.circle.id, mission.circle])).values(),
  ).map((circle) => ({
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    ecosystemLabel: circle.ecosystemLabel,
  }));
  const activeStatusFilter = statusFilter && statusFilter !== "all" ? statusFilter : null;
  const queueFilterHref = (status: string | null, circle: string | null) => {
    const query = new URLSearchParams();
    query.set("status", status ?? "all");
    if (circle) query.set("circle", circle);
    return `/admin?${query.toString()}#review-queue`;
  };

  return (
    <AppShell active="admin">
      <main className="page-main">
        <header className="admin-header">
          <div className="shell">
            <Eyebrow>Campaign Studio</Eyebrow>
            <div className="admin-header-grid">
              <div>
                <h1>Turn attention into informed participation.</h1>
                <p>
                  Create missions for any Circle, configure points and Stellar-settled XLM rewards,
                  and review contributions. Asset ecosystem and reward network are separate concepts.
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="shell admin-body">
          <div className="admin-metrics">
            <MetricCard
              detail="Asset Circles across ecosystems"
              label="Circles"
              value={String(overview.circles)}
            />
            <MetricCard
              detail="Missions open for submissions"
              label="Active missions"
              value={String(overview.activeMissions)}
              accent
            />
            <MetricCard
              detail="Waiting for admin action"
              label="Pending reviews"
              value={String(overview.pendingSubmissions)}
            />
            <MetricCard
              detail="Approved offchain contributions"
              label="Approved submissions"
              value={String(overview.approvedSubmissions)}
            />
            <MetricCard
              detail="Configured XLM on open missions · Testnet"
              label="Reward exposure"
              value={`${overview.openRewardExposureXlm} XLM`}
            />
          </div>

          <div className="admin-layout">
            <section className="hairline-card admin-panel admin-panel-wide">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Campaigns</Eyebrow>
                  <h2>Missions with live state.</h2>
                </div>
                <p>{missionRecords.length} mission records</p>
              </div>
              {missionRecords.length > 0 ? (
                missionRecords.map((mission) => (
                  <div className="campaign-row" key={mission.id}>
                    <div>
                      <strong>
                        <Link href={`/admin/missions/${mission.id}`}>{mission.title}</Link>
                      </strong>
                      <span>
                        {mission.circle.name} · {mission.circle.ecosystemLabel} · {mission.type} ·{" "}
                        {mission.points} points · {rewardLabel(mission.rewardAsset, mission.rewardAmount)}
                      </span>
                      <span>
                        {mission.submissions.pending} pending · {mission.submissions.approved} approved ·{" "}
                        {mission.submissions.needsRevision} revision · {mission.submissions.rejected} rejected
                      </span>
                    </div>
                    <StatusPill tone={mission.status === "open" ? "green" : mission.status === "draft" ? "muted" : "blue"}>
                      {statusLabel(mission.status)}
                    </StatusPill>
                  </div>
                ))
              ) : (
                <EmptyState title="No missions configured">
                  Create the first mission below to open a campaign.
                </EmptyState>
              )}
            </section>

            <section className="hairline-card admin-panel" id="create-mission">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Create mission</Eyebrow>
                  <h2>Open a new campaign.</h2>
                </div>
              </div>
              {studioCircles.length > 0 ? (
                <MissionCreateForm circles={studioCircles} />
              ) : (
                <EmptyState title="No Circles available">
                  Missions attach to existing Circles; Circle creation is out of scope for this slice.
                </EmptyState>
              )}
            </section>
          </div>

          <section className="hairline-card admin-panel" id="review-queue">
            <div className="admin-panel-header">
              <div>
                <Eyebrow>Review queue</Eyebrow>
                <h2>Keep proof visible.</h2>
              </div>
              <p>Approval awards points and makes configured XLM rewards eligible — nothing is sent automatically.</p>
            </div>
            <div className="admin-queue-filters">
              <div className="admin-queue-filter-group" role="group" aria-label="Filter by status">
                <Link
                  className={`button button-small ${!activeStatusFilter ? "button-white" : "button-outline"}`}
                  href={queueFilterHref(null, circleFilter)}
                >
                  All
                </Link>
                {queueStatuses.map((value) => (
                  <Link
                    className={`button button-small ${activeStatusFilter === value ? "button-white" : "button-outline"}`}
                    href={queueFilterHref(value, circleFilter)}
                    key={value}
                  >
                    {statusLabel(value)}
                  </Link>
                ))}
              </div>
              <div className="admin-queue-filter-group" role="group" aria-label="Filter by Circle">
                <Link
                  className={`button button-small ${!circleFilter ? "button-white" : "button-outline"}`}
                  href={queueFilterHref(statusFilter, null)}
                >
                  All Circles
                </Link>
                {studioCircles.map((circle) => (
                  <Link
                    className={`button button-small ${circleFilter === circle.slug ? "button-white" : "button-outline"}`}
                    href={queueFilterHref(statusFilter, circle.slug)}
                    key={circle.id}
                  >
                    {circle.name}
                  </Link>
                ))}
              </div>
            </div>
            {reviewQueue.length > 0 ? (
              <AdminReviewQueue submissions={reviewQueue} />
            ) : (
              <EmptyState title="No submissions match">
                {activeStatusFilter || circleFilter
                  ? "Try a different filter — review history stays visible under its own state."
                  : "Quiz missions are graded automatically; text missions appear here while pending."}
              </EmptyState>
            )}
          </section>

          <p className="admin-footnote">
            <Icon name="lock" size={15} /> Admin reads, mission creation, and reviews are enforced
            server-side against the admin allowlist. Issuer payouts are never automatic: approved
            rewards are claimed by participants through the existing Stellar flow.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
