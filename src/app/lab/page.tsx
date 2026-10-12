import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LabRunner } from "@/components/lab-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tokenization Lab",
  description: "Define, trust, issue, and verify a real demo asset on Stellar Testnet.",
};

export default async function LabPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="lab">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Lab data is unavailable">
                The database could not provide the Lab right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  return (
    <AppShell active="lab">
      <main className="page-main">
        <div className="shell circle-page-body">
          {session ? <LabRunner /> : <WalletConnectPrompt />}
        </div>
      </main>
    </AppShell>
  );
}
