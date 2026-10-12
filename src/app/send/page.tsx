import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SendRunner } from "@/components/send-runner";
import { CrosschainSendRunner } from "@/components/crosschain-send-runner";
import { WalletConnectPrompt } from "@/components/wallet-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { isDatabaseUnavailableError } from "@/db";
import { DataState } from "@/components/vicus";
import { getSendableAsset } from "@/lib/send/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Send to @handle",
  description: "Send real Stellar assets to Vicus contacts on Stellar Mainnet.",
};

export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; mode?: string }>;
}) {
  const { asset, mode } = await searchParams;
  const initialAsset = typeof asset === "string" && getSendableAsset(asset) ? asset : null;
  const crosschain = mode === "cross-chain";

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return (
        <AppShell active="discover">
          <main className="page-main">
            <div className="shell data-error-shell">
              <DataState title="Send data is unavailable">
                The database could not provide Send right now.
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
          {session ? (
            <>
              <nav className="row" aria-label="Send mode">
                <a className="button button-outline button-small" href="/send" aria-current={crosschain ? undefined : "page"}>
                  Same network
                </a>
                <a className="button button-outline button-small" href="/send?mode=cross-chain" aria-current={crosschain ? "page" : undefined}>
                  Cross-chain · Testnet
                </a>
              </nav>
              {crosschain ? <CrosschainSendRunner /> : <SendRunner initialAsset={initialAsset} />}
            </>
          ) : (
            <WalletConnectPrompt />
          )}
        </div>
      </main>
    </AppShell>
  );
}
