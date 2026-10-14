import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { UseBrowser } from "@/components/use-browser";
import { getSubjectForAsset } from "@/lib/subjects/config";
import type { SheetSubject } from "@/components/asset-sheet";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { getUtilityDiscovery } from "@/lib/utility-discovery/service";

export const dynamic = "force-dynamic";

function buildUseSubjectMap(discovery: { stellar: Array<{ assetSlug: string }>; beyond: Array<{ assetSlug: string }> }): Record<string, SheetSubject> {
  const map: Record<string, SheetSubject> = {};
  for (const item of [...discovery.stellar, ...discovery.beyond]) {
    if (map[item.assetSlug] !== undefined) continue;
    const subject = getSubjectForAsset(item.assetSlug);
    map[item.assetSlug] = subject
      ? { name: subject.name, slug: subject.slug, type: subject.type, siblingSlugs: [...subject.representations] }
      : null;
  }
  return map;
}

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
            <section className="card u-page-head">
              <p className="eyebrow">Use</p>
              <h1>Put tokenized assets to work</h1>
              {session ? (
                <p className="control-note">
                  Ordered for your connected wallet — availability reflects your session, never assumed holdings.
                </p>
              ) : (
                <p className="control-note">
                  Browsing as guest with a stable order. <Link href="/profile/me">Connect a wallet</Link> to check actions against your account.
                </p>
              )}
            </section>
            <Suspense>
              <UseBrowser discovery={discovery} subjectMap={buildUseSubjectMap(discovery)} />
            </Suspense>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
