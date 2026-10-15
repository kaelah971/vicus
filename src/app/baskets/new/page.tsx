import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DataState } from "@/components/vicus";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { GlowField } from "@/components/vicus-ui";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { listCircles } from "@/lib/data/circles";
import { BasketCreateForm } from "@/components/basket-create-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create a basket",
  description: "Save a personal discovery-only asset theme. Never investable.",
};

export default async function NewBasketPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Baskets are unavailable">
                The database could not provide baskets right now.
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

  let assets: { slug: string; code: string; issuer: string; network: string }[] = [];
  try {
    const circles = await listCircles(session.user.id);
    assets = circles
      .filter((circle) => circle.slug && circle.code !== "Education")
      .map((circle) => ({
        slug: circle.slug,
        code: circle.code,
        issuer: circle.issuerSource,
        network: circle.network,
      }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.slug.localeCompare(b.slug));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Baskets are unavailable">
                The database could not provide the asset catalogue right now.
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
        <header className="v-page-head">
          <GlowField tones={["violet", "blue"]} />
          <div className="shell">
            <span className="v-eyebrow">Baskets · Yours</span>
            <h1>Create a basket</h1>
            <p>Save a personal discovery theme from real catalogue assets. Discovery only — never investable.</p>
          </div>
        </header>
        <div className="shell">
          <BasketCreateForm assets={assets} />
        </div>
      </main>
    </AppShell>
  );
}
