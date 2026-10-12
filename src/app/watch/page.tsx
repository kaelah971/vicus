import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { getWatchCenter, type WatchActivity, type WatchedAsset } from "@/lib/watch-center/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch Center",
  description: "Watched assets, live activity, and what needs your attention.",
};

function ActivityRow({ activity }: { activity: WatchActivity }) {
  return (
    <div className="watch-row">
      <div>
        <p>
          <strong>{activity.title}</strong>
          {activity.asset ? <span className="muted"> · {activity.asset}</span> : null}
          {activity.network ? <span className="muted"> · {activity.network}</span> : null}
        </p>
        <p className="muted">{activity.detail}</p>
      </div>
      <div className="watch-row-side">
        <span className="pill">{activity.status.replaceAll("_", " ")}</span>
        {activity.href && activity.actionRequired && activity.stateGroup === "needs-attention" ? (
          <a className="button button-outline button-small" href={activity.href}>
            Continue
          </a>
        ) : null}
      </div>
    </div>
  );
}

function WatchedCard({ asset }: { asset: WatchedAsset }) {
  return (
    <div className="watch-card">
      <p>
        <strong>{asset.name}</strong>
      </p>
      <p className="muted">
        {asset.assetClassLabel} · {asset.ecosystem}
      </p>
      <p className="muted small">Watching — not ownership. No balance is shown because none is tracked.</p>
      {asset.actions.length > 0 && (
        <p className="muted small">
          {asset.actions.map((action) => action.title).join(" · ")}
        </p>
      )}
      <a className="button button-outline button-small" href={asset.openHref}>
        Open
      </a>
    </div>
  );
}

export default async function WatchPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Watch Center is unavailable">
                The database could not provide Watch Center right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session) {
    return (
      <AppShell active="discover">
        <main className="page-main">
          <div className="shell circle-page-body">
            <WalletConnectPrompt />
          </div>
        </main>
      </AppShell>
    );
  }

  let center;
  try {
    center = await getWatchCenter(session.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Watch Center is unavailable">
                The database could not provide Watch Center right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  const empty =
    center.watching.length === 0 &&
    center.needsAttention.length === 0 &&
    center.active.length === 0 &&
    center.completed.length === 0;

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Home ★ Stellar · Watch Center</p>
              <h1>Watch Center</h1>
              <p className="muted">
                What you watch, what is in progress, and what needs you. Operational states only —
                no balances, no prices, no risk scores.
              </p>
            </section>

            {empty && (
              <section className="card">
                <h2>Nothing here yet</h2>
                <p className="muted">
                  Watch an asset from Discover, start a swap, access, send, or cross-chain move —
                  everything lands here with its real status.
                </p>
                <a className="button button-outline button-small" href="/discover">
                  Open Discover
                </a>
              </section>
            )}

            {center.needsAttention.length > 0 && (
              <section className="card watch-attention">
                <h2>Needs attention ({center.counts.needsAttention})</h2>
                {center.needsAttention.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </section>
            )}

            {center.active.length > 0 && (
              <section className="card">
                <h2>Active ({center.counts.active})</h2>
                {center.active.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </section>
            )}

            {center.watching.length > 0 && (
              <section className="card">
                <h2>Watching ({center.counts.watching})</h2>
                <div className="watch-grid">
                  {center.watching.map((asset) => (
                    <WatchedCard key={asset.slug} asset={asset} />
                  ))}
                </div>
              </section>
            )}

            {center.completed.length > 0 && (
              <section className="card">
                <h2>Recently completed ({center.counts.completed})</h2>
                {center.completed.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </section>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
