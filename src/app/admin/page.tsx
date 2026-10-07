import type { Metadata } from "next";
import {
  ButtonLink,
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
import { getAdminSummary } from "@/lib/data/admin";
import { getAdminSubmissionQueue } from "@/lib/data/missions";
import { getCampaigns } from "@/lib/data/campaigns";
import { AdminReviewQueue } from "@/components/admin-review-queue";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Issuer dashboard",
  description: "An authenticated Vicus campaign shell and mission review queue."
};

function statusLabel(status: string) {
  return status.replaceAll("-", " ");
}

export default async function AdminPage() {
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

  let summary;
  let campaignRecords;
  let reviewQueue;

  try {
    [summary, campaignRecords, reviewQueue] = await Promise.all([
      getAdminSummary(),
      getCampaigns(),
      getAdminSubmissionQueue(),
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

  return (
    <AppShell active="admin">
      <main className="page-main">
        <header className="admin-header">
          <div className="shell">
            <Eyebrow>Issuer and campaign desk</Eyebrow>
            <div className="admin-header-grid">
              <div>
                <h1>Turn attention into informed participation.</h1>
                <p>
                  A quiet place to define a campaign, set the learning objective, review
                  contributions, and understand what is happening around a circle.
                </p>
              </div>
              <ButtonLink href="#campaign-draft" variant="white">
                <Icon name="plus" size={16} /> Create campaign
              </ButtonLink>
            </div>
          </div>
        </header>

        <div className="shell admin-body">
          <div className="admin-metrics">
            <MetricCard
              detail="Seeded membership records"
              label="Watchers"
              value={String(summary.watchers)}
            />
            <MetricCard
              detail="Persistent asset-role records deferred"
              label="Verified roles"
              value="—"
              accent
            />
            <MetricCard
              detail="Waiting for admin action"
              label="Pending reviews"
              value={String(summary.pendingSubmissions)}
            />
            <MetricCard
              detail="Approved offchain contributions"
              label="Approved submissions"
              value={String(summary.approvedSubmissions)}
            />
          </div>

          <div className="admin-layout">
            <section className="hairline-card admin-panel admin-panel-wide" id="campaign-draft">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Campaign overview</Eyebrow>
                  <h2>Make the objective legible.</h2>
                </div>
                <p>{summary.campaigns} seeded campaign records · read-only</p>
              </div>
              {campaignRecords.length > 0 ? (
                campaignRecords.map((campaign) => (
                  <div className="campaign-row" key={campaign.id}>
                    <div>
                      <strong>{campaign.objective}</strong>
                      <span>
                        {campaign.circle.name} · {campaign.circle.stateLabel} · source review required
                      </span>
                    </div>
                    <StatusPill tone={campaign.status === "draft" ? "muted" : "blue"}>
                      {statusLabel(campaign.status)}
                    </StatusPill>
                    <span className="campaign-status">
                      {statusLabel(campaign.budgetStatus)} budget
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="No campaigns configured">
                  The database has no campaign records. The create flow is intentionally deferred.
                </EmptyState>
              )}
              <p className="admin-footnote">
                Campaign creation and funding remain deferred. Mission review is live for the seeded
                mission workflow, without implying issuer authentication or reward settlement.
              </p>
            </section>

            <section className="hairline-card admin-panel">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Review queue</Eyebrow>
                  <h2>Keep proof visible.</h2>
                </div>
              </div>
              <AdminReviewQueue submissions={reviewQueue} />
            </section>
          </div>

          <div className="admin-layout">
            <section className="hairline-card admin-panel">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Top contributors</Eyebrow>
                  <h2>Useful work over vanity counts.</h2>
                </div>
              </div>
              {summary.approvedSubmissions > 0 ? (
                <div className="admin-contributor-summary">
                  <strong>{summary.approvedSubmissions} approved contribution{summary.approvedSubmissions === 1 ? "" : "s"}</strong>
                  <p>Approved submissions contribute offchain Vicus points. No financial value or blockchain reward is implied.</p>
                </div>
              ) : (
                <EmptyState title="No approved contributions">
                  Approved text and research submissions will appear here after admin review.
                </EmptyState>
              )}
            </section>

            <section className="hairline-card admin-panel">
              <div className="admin-panel-header">
                <div>
                  <Eyebrow>Database summary</Eyebrow>
                  <h2>Read the shape of the product.</h2>
                </div>
              </div>
              <ul className="action-list">
                <li><Icon name="check" size={15} /> {summary.circles} circle records</li>
                <li><Icon name="check" size={15} /> {summary.missions} mission records</li>
                <li><Icon name="check" size={15} /> {summary.memberships} active memberships</li>
                <li><Icon name="check" size={15} /> {summary.activityEvents} activity events</li>
              </ul>
            </section>
          </div>

          <p className="admin-footnote">
            Admin access requires a verified wallet listed in the server-side admin allowlist. Issuer
            workflows and reward transactions remain deferred; review only changes offchain contribution state.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
