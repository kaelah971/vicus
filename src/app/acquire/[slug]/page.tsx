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
import { getSwapTarget, isSwapTargetSlug } from "@/lib/external-utility/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access a verified asset",
  description: "Fund a verified tokenized asset through its supported access routes.",
};

export default async function AcquirePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const routed = getAccessRoutesForSlug(slug);
  if (slug !== ROUTER_TARGET_ASSET.slug && !isSwapTargetSlug(slug) && routed.length === 0) notFound();

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

  // Any routed asset renders its funding routes — executable or gated.
  // Gated-only assets (e.g. NVDAc) show their exact reasons, never a 404.
  const swapTarget = getSwapTarget(slug);
  const routes = swapTarget ? getAccessRoutesForSlug(slug) : routed;
  const targetCode = swapTarget?.code ?? routes[0]?.targetCode ?? slug;
  if (swapTarget || routes.length > 0) {
    return (
      <AppShell active="discover">
        <main className="page-main">
          <div className="shell circle-page-body">
            <AccessRoutesRunner
              targetSlug={swapTarget?.slug ?? slug}
              targetCode={targetCode}
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
