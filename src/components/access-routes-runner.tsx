"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ACCESS_SOURCE_DECIMALS,
  ACCESS_SOURCE_MINT,
  SWAP_RPC_URL,
} from "@/lib/external-utility/client-config";

type AccessRouteView = {
  id: string;
  sourceNetwork: string;
  sourceAsset: string;
  sourceMint: string | null;
  targetCode: string;
  adapter: string;
  executable: boolean;
  reasonUnavailable: string | null;
  href: string;
};

type SwapOrderView = {
  id: string;
  sourceAmountDisplay: string;
  status: string;
  quote: { amountOutDisplay: string | null; minOutDisplay: string | null };
  swapExplorerUrl: string | null;
  lastError: string | null;
};

type SolanaProvider = {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signTransaction<T>(tx: T): Promise<T>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

function formatBaseUnits(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const base = BigInt(10) ** BigInt(decimals);
  return `${(value / base).toString()}.${(value % base).toString().padStart(decimals, "0")}`;
}

export function AccessRoutesRunner({
  targetSlug,
  targetCode,
  routes,
}: {
  targetSlug: string;
  targetCode: string;
  routes: AccessRouteView[];
}) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null | "unreadable">(null);
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [orders, setOrders] = useState<SwapOrderView[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/external-utility/orders", { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; orders?: SwapOrderView[] };
        if (!cancelled && data.ok) setOrders(data.orders ?? []);
      } catch {
        /* recent activity stays empty rather than faked */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function readBalance(address: string) {
    setBalanceBusy(true);
    try {
      const connection = new Connection(SWAP_RPC_URL, "confirmed");
      const accounts = await connection.getTokenAccountsByOwner(new PublicKey(address), {
        mint: new PublicKey(ACCESS_SOURCE_MINT),
      });
      let total = BigInt(0);
      for (const entry of accounts.value) {
        const parsed = entry.account.data as unknown as {
          parsed?: { info?: { tokenAmount?: { amount?: string } } };
        };
        const amount = parsed?.parsed?.info?.tokenAmount?.amount;
        if (typeof amount === "string" && /^[0-9]+$/.test(amount)) total += BigInt(amount);
      }
      setBalance(total.toString());
    } catch {
      setBalance("unreadable");
    }
    setBalanceBusy(false);
  }

  async function connectWallet() {
    setNotice(null);
    const provider = window.solana;
    if (!provider) {
      setNotice("No Solana wallet found. Install a Solana wallet, then try again.");
      return;
    }
    try {
      const { publicKey } = await provider.connect();
      // The connected provider determines the execution wallet — Vicus
      // accepts no typed-in substitute.
      const address = publicKey.toString();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        setNotice("The wallet did not share a valid address.");
        return;
      }
      setWallet(address);
      await readBalance(address);
    } catch {
      setNotice("The wallet request was dismissed. Nothing was created.");
    }
  }

  const executable = routes.filter((route) => route.executable);
  const gated = routes.filter((route) => !route.executable);

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Home ★ Stellar · Access · {targetCode}</p>
        <h1>Access {targetCode}</h1>
        <p className="muted">
          Fund with a supported route. Only listed routes exist — anything else is not a Vicus claim.
        </p>
      </section>

      <section className="card">
        <h2>Fund with</h2>
        {executable.map((route) => (
          <div key={route.id} className="route-row">
            <div>
              <p>
                <strong>
                  {route.sourceAsset} on {route.sourceNetwork}
                </strong>{" "}
                · <span className="pill">Available</span>
              </p>
              <p className="muted">
                Live {route.adapter === "jupiter-swap" ? "Jupiter" : route.adapter} routing. Your wallet signs;
                Vicus verifies.
              </p>
              {wallet && (
                <p className="muted">
                  {balance === null || balance === "unreadable"
                    ? balanceBusy
                      ? "Reading wallet balance…"
                      : "Balance unreadable — refresh before funding."
                    : `Balance: ${formatBaseUnits(balance, ACCESS_SOURCE_DECIMALS)} ${route.sourceAsset}`}
                </p>
              )}
            </div>
            <a className="button" href={route.href}>
              Continue to Swap
            </a>
          </div>
        ))}
        {gated.map((route) => (
          <div key={route.id} className="route-row route-gated">
            <div>
              <p>
                <strong>
                  {route.sourceAsset} on {route.sourceNetwork}
                </strong>{" "}
                · <span className="pill pill-gated">Not executable</span>
              </p>
              <p className="muted">{route.reasonUnavailable}</p>
            </div>
          </div>
        ))}
        <div className="row">
          {wallet ? (
            <p className="mono">{wallet}</p>
          ) : (
            <button type="button" onClick={connectWallet}>
              Connect Solana wallet
            </button>
          )}
        </div>
        {notice && <p className="muted">{notice}</p>}
        <p className="muted">
          Solana wallets are execution endpoints only — your Vicus identity stays Stellar-first.{" "}
          <span className="mono">{targetSlug}</span>
        </p>
      </section>

      {/* Recent executions only where a route can actually execute —
          gated-only assets must not borrow another asset's history. */}
      {executable.length > 0 && orders !== null && orders.length > 0 && (
        <section className="card">
          <h2>Recent access executions</h2>
          {orders.slice(0, 5).map((order) => (
            <p key={order.id} className="muted">
              {order.sourceAmountDisplay} USDC → {order.quote.amountOutDisplay ?? "awaiting price"} {targetCode} ·{" "}
              {order.status}
              {order.swapExplorerUrl && (
                <>
                  {" · "}
                  <a href={order.swapExplorerUrl} target="_blank" rel="noreferrer">
                    Explorer
                  </a>
                </>
              )}
              {order.lastError && order.status !== "confirmed" ? ` · ${order.lastError}` : ""}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
