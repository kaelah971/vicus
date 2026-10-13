import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState, EmptyState } from "@/components/vicus";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { getPersonalActivity } from "@/lib/activity/service";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="activity">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Activity is unavailable">The database could not provide activity right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session) {
    return (
      <AppShell active="activity">
        <main className="page-main">
          <div className="shell circle-page-body">
            <WalletConnectPrompt />
          </div>
        </main>
      </AppShell>
    );
  }

  let activity;
  try {
    activity = await getPersonalActivity(session.user.id, session.wallet.publicKey);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="activity">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Activity is unavailable">The database could not provide activity right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  const empty = activity.attention.length === 0 && activity.changed.length === 0;

  return (
    <AppShell active="activity">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Your activity</p>
              <h1>What changed</h1>
              <p className="muted">
                Around the assets you watch, hold, and contribute to — and from people you
                follow. Transaction execution stays in <Link href="/watch">Watch Center</Link>.
              </p>
            </section>

            {empty ? (
              <section className="card">
                <EmptyState title="Nothing here yet">
                  Your activity will appear here as you watch assets, follow contributors, join campaigns and publish theses.
                </EmptyState>
                <div className="row">
                  <Link className="button button-outline button-small" href="/discover">Explore Stellar assets</Link>
                  <Link className="button button-outline button-small" href="/discover">Find Circles</Link>
                </div>
              </section>
            ) : null}

            {activity.attention.length > 0 ? (
              <section className="card">
                <h2>Needs your attention ({activity.counts.attention})</h2>
                {activity.attention.map((item) => (
                  <div className="watch-row" key={item.id}>
                    <div>
                      <p><strong>{item.title}</strong></p>
                      <p className="muted small">{item.detail}</p>
                    </div>
                    <Link className="button button-outline button-small" href={item.href}>Open</Link>
                  </div>
                ))}
              </section>
            ) : null}

            {activity.changed.length > 0 ? (
              <section className="card">
                <h2>What changed ({activity.counts.changed})</h2>
                {activity.changed.map((item) => (
                  <div className="watch-row" key={item.id}>
                    <div>
                      <p>
                        <strong>{item.title}</strong>
                        {item.actorHandle ? <span className="muted"> · @{item.actorHandle}</span> : null}
                      </p>
                      <p className="muted small">{item.detail}</p>
                      <p className="muted small">{item.reason}</p>
                    </div>
                    <Link className="button button-outline button-small" href={item.href}>Open</Link>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
