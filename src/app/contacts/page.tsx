import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ContactsManager } from "@/components/contacts-manager";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contacts",
  description: "Your private Vicus contacts for future asset transfers.",
};

export default async function ContactsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="profile">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Contacts data is unavailable">
                The database could not provide contacts right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  return (
    <AppShell active="profile">
      <main className="page-main">
        <div className="shell circle-page-body">
          {session ? <ContactsManager /> : <WalletConnectPrompt />}
        </div>
      </main>
    </AppShell>
  );
}
