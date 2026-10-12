import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AccessRunner } from "@/components/access-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access from Stellar",
  description: "Move native USDC from Stellar to other networks with Circle CCTP.",
};

export default async function AccessPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Access data is unavailable">
                The database could not provide Access right now.
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
          {session ? <AccessRunner /> : <WalletConnectPrompt />}
        </div>
      </main>
    </AppShell>
  );
}
