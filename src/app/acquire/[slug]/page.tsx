import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AcquireRunner } from "@/components/acquire-runner";
import { AccessRoutesRunner } from "@/components/access-routes-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { ROUTER_TARGET_ASSET } from "@/lib/asset-access/config";
import { getAccessRoutesForSlug } from "@/lib/asset-access/routes";
import { SWAP_TARGET_ASSET, SWAP_TARGET_SLUG } from "@/lib/external-utility/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access a verified asset",
  description: "Fund a verified tokenized asset through its supported access routes.",
};

export default async function AcquirePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== ROUTER_TARGET_ASSET.slug && slug !== SWAP_TARGET_SLUG) notFound();

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
                The database could not provide asset access right now.
              </DataState>
            </div>
          </main>
        </AppShell>
      );
    }
    throw error;
  }

  if (!session) {
    return (
      <AppShell active="discover">
        <main className="page-main">
          <div className="shell circle-page-body">
            <WalletConnectPrompt />
          </div>
        </main>
      </AppShell>
    );
  }

  // Generalized Access V1: AAPLx exposes its funding routes (Solana USDC
  // executable, Stellar USDC truthfully gated). Execution reuses the proven
  // Jupiter swap adapter — this page selects the route, /swap executes it.
  if (slug === SWAP_TARGET_SLUG) {
    const routes = getAccessRoutesForSlug(slug);
    return (
      <AppShell active="discover">
        <main className="page-main">
          <div className="shell circle-page-body">
            <AccessRoutesRunner
              targetSlug={SWAP_TARGET_ASSET.slug}
              targetCode={SWAP_TARGET_ASSET.code}
              routes={routes}
            />
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell active="discover">
      <main className="page-main">
        <div className="shell circle-page-body">
          <AcquireRunner />
        </div>
      </main>
    </AppShell>
  );
}
