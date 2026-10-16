import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState, EmptyState, Icon } from "@/components/vicus";
import { Orb } from "@/components/vicus-ui";
import { RewardClaimCard } from "@/components/reward-claim-card";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { isDatabaseUnavailableError } from "@/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserRewardStates } from "@/lib/data/rewards";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="profile">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Rewards are unavailable">The database could not provide rewards right now.</DataState>
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
          <div className="shell circle-page-body">
            <WalletConnectPrompt />
          </div>
        </main>
      </AppShell>
    );
  }

  let rewards: Awaited<ReturnType<typeof getUserRewardStates>> = [];
  try {
    rewards = await getUserRewardStates(session.user.id, session.wallet.publicKey);
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
  }
  const attentionRewards = rewards.filter((reward) =>
    ["eligible", "claimable", "submitted", "failed"].includes(reward.status),
  );
  const confirmedRewards = rewards.filter((reward) => reward.status === "confirmed" && reward.id);

  return (
    <AppShell active="profile">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Rewards</p>
              <h1>Your rewards</h1>
              <p className="muted">Native XLM only · network shown on every reward. Tokenized-asset drops need an authorized provider — none connected. Claim behavior unchanged.</p>
            </section>
            <section className="card">
              {attentionRewards.length > 0 ? (
                <div className="profile-reward-list">
                  {attentionRewards.map((reward) => <RewardClaimCard key={reward.submissionId} reward={reward} />)}
                </div>
              ) : null}
              {confirmedRewards.length > 0 ? (
                <div className="v-list">
                  {confirmedRewards.map((reward) => (
                    <Link className="v-row" href={`/rewards/${reward.id}`} key={reward.id}>
                      <Orb icon="gift" size="md" tone="white" />
                      <span className="v-row-main">
                        <strong>{reward.amount} XLM</strong>
                        <small>{reward.missionTitle} · {reward.network === "testnet" ? "Stellar Testnet" : "Stellar Public Network"}</small>
                      </span>
                      <span className="v-text-link">Receipt <Icon name="arrow-right" size={15} /></span>
                    </Link>
                  ))}
                </div>
              ) : attentionRewards.length === 0 ? (
                <EmptyState title="No rewards yet">Reward-enabled missions unlock XLM after approval.</EmptyState>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
