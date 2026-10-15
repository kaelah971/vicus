import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ConnectedPositions } from "@/components/connected-positions";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { ButtonLink, DataState, EmptyState, StatusPill } from "@/components/vicus";
import { AssetToken, Chip, SectionHead } from "@/components/vicus-ui";
import { formatReadTime } from "@/lib/positions/freshness";
import { getStellarPositions } from "@/lib/positions/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Position Center",
  description: "Current onchain tokenized-asset holdings across connected wallets.",
};

function abbreviate(value: string) {
  return value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

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

  const holdings = stellar?.positions ?? [];

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="content-panel pos-hero">
              <span className="v-eyebrow">Home ★ Stellar · Position Center</span>
              <h1>What you hold</h1>
              <p className="pos-lede">
                Live onchain balances only. Watching an asset or completing a past action never
                implies ownership.
              </p>
              <div className="pos-wallet-row">
                <Chip tone="violet" icon="user">
                  {abbreviate(session.wallet.publicKey)}
                </Chip>
                <ButtonLink href="/watch" variant="text">
                  View activity / Watch Center
                </ButtonLink>
              </div>
            </section>

            <section className="pos-section" aria-label="Stellar holdings">
              <SectionHead
                eyebrow="Home · Stellar"
                title="Stellar holdings"
                line="Verified wallet assets, read live from Stellar Mainnet."
                action={
                  holdings.length > 0 && !stellarError ? (
                    <StatusPill tone="green">Live onchain</StatusPill>
                  ) : undefined
                }
              />
              {stellarError ? (
                <DataState title="Stellar balances unavailable">{stellarError}</DataState>
              ) : holdings.length > 0 ? (
                <>
                  <p className="field-help pos-note">
                    Updated {formatReadTime(stellar?.readAt)} · re-read live on every visit.
                  </p>
                  <div className="pos-hold-grid">
                  {holdings.map((position) => (
                    <article className="pos-hold" key={position.assetSlug}>
                      <div className="pos-hold-top">
                        <AssetToken code={position.code} ecosystem="stellar" />
                        <div className="pos-hold-id">
                          <strong className="pos-hold-code">{position.code}</strong>
                          <span className="pos-hold-net">{position.network}</span>
                        </div>
                      </div>
                      <p className="pos-balance">
                        {position.balance} <small>{position.code}</small>
                      </p>
                      <p className="pos-issuer" title={position.issuer}>
                        Live on Stellar · {position.issuer}
                      </p>
                      {position.actions.length > 0 && (
                        <p className="pos-actions-line">
                          {position.actions.map((a) => a.title).join(" · ")}
                        </p>
                      )}
                      <div className="pos-actions">
                        <ButtonLink
                          className="button-small"
                          href={position.openHref}
                          variant="outline"
                        >
                          Open asset
                        </ButtonLink>
                      </div>
                    </article>
                  ))}
                </div>
                </>
              ) : (
                <EmptyState
                  title="No Stellar holdings detected"
                  action={
                    <ButtonLink
                      className="button-small"
                      href="/discover"
                      variant="outline"
                    >
                      Discover assets
                    </ButtonLink>
                  }
                >
                  Your verified Stellar wallet holds no Vicus tokenized assets right now.
                  Balances appear here the moment they exist onchain — nothing is assumed.
                </EmptyState>
              )}
            </section>

            <ConnectedPositions />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
