import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ConnectedPositions } from "@/components/connected-positions";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { getStellarPositions } from "@/lib/positions/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Position Center",
  description: "Current onchain tokenized-asset holdings across connected wallets.",
};

export default async function PositionsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Position Center is unavailable">
                The database could not provide positions right now.
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

  let stellar: Awaited<ReturnType<typeof getStellarPositions>> | null = null;
  let stellarError: string | null = null;
  try {
    stellar = await getStellarPositions(session.wallet.publicKey);
  } catch {
    stellarError = "Stellar balances could not be read. Nothing was assumed — retry in a moment.";
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Home ★ Stellar · Position Center</p>
              <h1>What you hold</h1>
              <p className="muted">
                Live onchain balances only. Watching an asset or completing a past action never
                implies ownership. <a href="/watch">View activity / Watch Center</a>
              </p>
            </section>

            <section className="card">
              <h2>Stellar positions</h2>
              {stellarError ? (
                <p className="muted">{stellarError}</p>
              ) : stellar && stellar.positions.length > 0 ? (
                <div className="watch-grid">
                  {stellar.positions.map((position) => (
                    <div className="watch-card" key={position.assetSlug}>
                      <p>
                        <strong>{position.code}</strong>
                        <span className="muted"> · {position.network}</span>
                      </p>
                      <p>
                        Balance <strong>{position.balance} {position.code}</strong>
                      </p>
                      <p className="muted small">Live on Stellar · {position.issuer}</p>
                      {position.actions.length > 0 && (
                        <p className="muted small">{position.actions.map((a) => a.title).join(" · ")}</p>
                      )}
                      <a className="button button-outline button-small" href={position.openHref}>
                        Open asset
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No Vicus tokenized assets in your Stellar wallet right now.</p>
              )}
            </section>

            <ConnectedPositions />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
