import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { UseBrowser } from "@/components/use-browser";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { getUtilityDiscovery } from "@/lib/utility-discovery/service";

export const dynamic = "force-dynamic";

export default async function UsePage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    session = null;
  }

  let discovery;
  try {
    discovery = await getUtilityDiscovery(
      session?.user.id ?? null,
      session?.wallet.publicKey ?? null,
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="use">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Utility data is unavailable">The database could not provide utility right now.</DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  return (
    <AppShell active="use">
      <main className="page-main">
        <div className="shell circle-page-body">
          <div className="stack">
            <section className="card">
              <p className="eyebrow">Use · verified utility only</p>
              <h1>Put tokenized assets to work</h1>
              <p className="muted">
                Everything below is a real, currently resolvable action — Stellar first,
                connected ecosystems below. No yields quoted, no winners picked.
              </p>
            </section>
            <UseBrowser discovery={discovery} />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
