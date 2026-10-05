import type { Metadata } from "next";
import Link from "next/link";
import {
  AppShell,
  DataState,
  EmptyState,
  Eyebrow,
  MetricCard,
  StatusPill,
} from "@/components/vicus";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserProfileById } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My profile",
  description: "Authenticated Vicus profile and mission contribution history.",
};

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function contributionStatusLabel(status: string) {
  return status === "needs_revision"
    ? "Needs revision"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function MyProfilePage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell>
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Session data is unavailable">
                The database could not provide the signed-in profile right now. No fallback profile is shown.
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
      <AppShell>
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Connect a wallet to view your profile">
              Your profile is created only after Vicus verifies a signed Stellar mainnet message.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let profile;
  try {
    profile = await getUserProfileById(session.user.id);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell>
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Profile data is unavailable">
                The database could not provide this profile right now. No fallback profile is shown.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!profile) {
    return (
      <AppShell>
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Profile not found">The signed-in Vicus account is no longer available.</DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="page-main">
        <header className="profile-header">
          <div className="shell">
            <Eyebrow>Authenticated profile</Eyebrow>
            <div className="profile-header-grid">
              <div className="profile-identity">
                <div aria-hidden="true" className="avatar-orb">VC</div>
                <div>
                  <h1>{profile.user.displayName}</h1>
                  <p>@{profile.user.handle} · signed in · {profile.wallets.length} verified wallet{profile.wallets.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              <p className="fixture-note">
                This Stellar wallet was verified with a server-generated, expiring SEP-53 message. Vicus
                stores the linked public key for this account, never a secret, balance, or transaction.
              </p>
            </div>
          </div>
        </header>

        <div className="shell profile-body">
          <div className="profile-metrics">
            <MetricCard detail="Active membership records" label="Circles watched" value={String(profile.memberships.length)} />
            <MetricCard detail="Verified mainnet wallet links" label="Wallets" value={String(profile.wallets.length)} accent />
            <MetricCard detail="Approved mission points · offchain" label="Vicus points" value={String(profile.approvedPoints)} />
            <MetricCard detail="Pending, approved, and reviewed records" label="Contributions" value={String(profile.contributions.length)} />
          </div>

          <div className="profile-section-grid">
            <section className="hairline-card profile-panel">
              <Eyebrow>Linked Stellar wallets</Eyebrow>
              <h2>Wallet verification, not exposure.</h2>
              <div className="fixture-list">
                {profile.wallets.map((wallet) => (
                  <div className="fixture-row" key={wallet.id}>
                    <span className="fixture-row-main">
                      <strong>{shortenAddress(wallet.publicKey)}</strong>
                      <span>{wallet.network} · verified {wallet.verifiedAt.toISOString().slice(0, 10)}</span>
                    </span>
                    <StatusPill tone="green">Verified</StatusPill>
                  </div>
                ))}
              </div>
              <p className="admin-footnote">Read-only role checks can still accept a pasted address without linking it to this account.</p>
            </section>

            <section className="hairline-card profile-panel">
              <Eyebrow>Mission contributions</Eyebrow>
              <h2>Understanding has a record.</h2>
              {profile.contributions.length > 0 ? (
                <div className="contribution-list">
                  {profile.contributions.map((contribution) => (
                    <Link className="contribution-row" href={`/missions/${contribution.missionId}`} key={contribution.id}>
                      <span className="contribution-row-main">
                        <strong>{contribution.missionTitle}</strong>
                        <span>{contribution.circleName} · {contribution.submittedAt.toISOString().slice(0, 10)}</span>
                      </span>
                      <span className="contribution-row-state">
                        <StatusPill tone={contribution.status === "approved" ? "green" : contribution.status === "pending" ? "blue" : contribution.status === "needs_revision" ? "violet" : "muted"}>
                          {contributionStatusLabel(contribution.status)}
                        </StatusPill>
                        <small>{contribution.status === "approved" ? `${contribution.points} points` : "0 points until approval"}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mission submissions yet">Start an open mission from a circle to create a contribution record.</EmptyState>
              )}
            </section>
          </div>

          <section className="hairline-card profile-panel reward-history-panel">
            <Eyebrow>Participation boundary</Eyebrow>
            <h2>Vicus points stay offchain.</h2>
            <p className="profile-contribution-copy">
              Approved points are derived from approved submissions. They are participation state, not
              money, a claimable balance, an asset, or a blockchain reward.
            </p>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
