import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CampaignRunner } from "@/components/campaign-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activation campaign",
  description: "Complete a verified tokenized-asset action and earn Stellar USDC.",
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Campaign data is unavailable">
                The database could not provide this campaign right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          {session ? <CampaignRunner campaignId={id} /> : <WalletConnectPrompt />}
        </div>
      </main>
    </AppShell>
  );
}
