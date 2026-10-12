import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ExitRunner } from "@/components/exit-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { SWAP_TARGET_SLUG } from "@/lib/external-utility/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Exit AAPLx to Solana USDC",
  description: "Exit the Apple xStock to Solana USDC with live Jupiter routing.",
};

export default async function ExitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== SWAP_TARGET_SLUG) notFound();

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Exit data is unavailable">
                The database could not provide exit orders right now.
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
          {session ? <ExitRunner /> : <WalletConnectPrompt />}
        </div>
      </main>
    </AppShell>
  );
}
