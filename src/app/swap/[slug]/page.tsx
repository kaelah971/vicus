import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SwapRunner } from "@/components/swap-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { isSwapTargetSlug } from "@/lib/external-utility/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Swap USDC for tokenized stocks",
  description: "Swap Solana USDC for verified xStocks with live Jupiter routing.",
};

export default async function SwapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSwapTargetSlug(slug)) notFound();

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Order data is unavailable">
                The database could not provide utility swaps right now.
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
          {session ? <SwapRunner slug={slug} /> : <WalletConnectPrompt />}
        </div>
      </main>
    </AppShell>
  );
}
