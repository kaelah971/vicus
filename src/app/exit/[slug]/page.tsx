import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ExitRunner } from "@/components/exit-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { SWAP_TARGET_SLUG } from "@/lib/external-utility/config";
import { getReturnRoutes } from "@/lib/return-stellar/routes";

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
          <div className="stack">
            {session ? <ExitRunner /> : <WalletConnectPrompt />}
            {session ? <ReturnHomeCard /> : null}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

/**
 * Return-home truth: leg 1 (Jupiter exit) is executable above; leg 2
 * (USDC home to Stellar) is modeled but gated. A completed exit leaves the
 * user owning Solana USDC — never a whole-journey failure.
 */
function ReturnHomeCard() {
  const routes = getReturnRoutes();
  return (
    <section className="card">
      <p className="eyebrow">Step 2 · Return home</p>
      <h2>Return to Stellar</h2>
      <p className="muted">
        Exiting leaves USDC safely in your Solana wallet. Only USDC can ever
        cross home — AAPLx itself never leaves Solana.
      </p>
      {routes.map((route) => (
        <div key={route.id} className="route-row route-gated">
          <div>
            <p>
              <strong>
                {route.sourceAsset} on {route.sourceNetwork} → Stellar
              </strong>{" "}· <span className="pill pill-gated">Not executable</span>
            </p>
            <p className="muted">{route.reasonUnavailable}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
