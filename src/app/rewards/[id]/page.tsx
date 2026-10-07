import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataState, Eyebrow, StatusPill } from "@/components/vicus";
import { AppShell } from "@/components/app-shell";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getRewardReceiptById } from "@/lib/data/rewards";
import type { RewardReceiptView, RewardStatus } from "@/lib/rewards/types";

type RewardPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reward receipt",
  description: "A durable Stellar reward settlement receipt.",
};

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function networkLabel(network: RewardReceiptView["network"]) {
  return network === "testnet" ? "Stellar Testnet" : "Stellar Public Network";
}

function statusLabel(status: RewardStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: RewardStatus) {
  if (status === "confirmed") return "green" as const;
  if (status === "submitted") return "blue" as const;
  if (status === "claimable") return "violet" as const;
  return "muted" as const;
}

function formattedDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Not confirmed";
}

export default async function RewardReceiptPage({ params }: RewardPageProps) {
  const { id } = await params;
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="profile">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Receipt data is unavailable">The Vicus database could not provide this receipt right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session) {
    return (
      <AppShell active="profile">
        <main className="page-main">
          <div className="shell data-error-shell">
            <DataState title="Sign in to view this receipt">
              Reward receipts are visible only to the verified Vicus wallet that claimed them.
              <WalletConnectPrompt />
            </DataState>
          </div>
        </main>
      </AppShell>
    );
  }

  let receipt;
  try {
    receipt = await getRewardReceiptById(id, session.user.id, session.user.role === "admin");
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="profile">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Receipt data is unavailable">The Vicus database could not provide this receipt right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!receipt) notFound();

  return (
    <AppShell active="profile">
      <main className="page-main">
        <header className="reward-receipt-header">
          <div className="shell">
            <Eyebrow>Stellar reward receipt</Eyebrow>
            <div className="reward-receipt-heading">
              <div>
                <h1>{receipt.amount} XLM</h1>
                <p>{receipt.missionTitle} · {receipt.circleName}</p>
              </div>
              <StatusPill tone={statusTone(receipt.status)}>{statusLabel(receipt.status)}</StatusPill>
            </div>
          </div>
        </header>

        <div className="shell reward-receipt-body">
          <section className="hairline-card reward-receipt-panel">
            <dl className="reward-receipt-meta">
              <div>
                <dt>Asset</dt>
                <dd>Native XLM</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{networkLabel(receipt.network)}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>{shortenAddress(receipt.destinationPublicKey)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formattedDate(receipt.createdAt)}</dd>
              </div>
              <div>
                <dt>Confirmed</dt>
                <dd>{formattedDate(receipt.confirmedAt)}</dd>
              </div>
              {receipt.ledger ? (
                <div>
                  <dt>Ledger</dt>
                  <dd>{receipt.ledger}</dd>
                </div>
              ) : null}
            </dl>

            {receipt.transactionHash ? (
              <dl className="reward-receipt-transaction">
                <dt>Transaction hash</dt>
                <dd><code>{receipt.transactionHash}</code></dd>
                {receipt.explorerUrl ? (
                  <dd>
                    <a href={receipt.explorerUrl} rel="noreferrer" target="_blank">
                      Verify on Stellar Horizon
                    </a>
                  </dd>
                ) : null}
              </dl>
            ) : null}

            {receipt.status === "failed" ? (
              <div className="reward-receipt-failure" role="alert">
                <strong>Settlement failed</strong>
                <p>{receipt.failureMessage ?? "The reward was not confirmed on Stellar. Try the claim again from your profile."}</p>
              </div>
            ) : null}
            {receipt.status === "submitted" || receipt.status === "claimable" ? (
              <p className="reward-receipt-pending" role="status">
                This reward is tracked durably. The receipt will show the transaction proof when Stellar confirms it.
              </p>
            ) : null}

            <p className="reward-receipt-disclaimer">
              This reward uses a real {networkLabel(receipt.network)} transaction. Testnet XLM has no monetary value.
            </p>
            <Link className="mission-action-link" href="/profile/me">Back to profile</Link>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
