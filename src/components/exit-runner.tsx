"use client";

import { useEffect, useRef, useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";

const RPC_URL = "https://api.mainnet-beta.solana.com";

type OrderView = {
  id: string;
  sourceAmountDisplay: string;
  executionWallet: string | null;
  venue: string;
  quote: { amountOutDisplay: string | null; minOutDisplay: string | null; quotedAt: string | null };
  swapSignature: string | null;
  swapExplorerUrl: string | null;
  targetAmount: string | null;
  status: string;
  failureReason: string | null;
  lastError: string | null;
  eligibilityCopy: string;
  fundingNote: string;
};

type Bootstrap = {
  ok: boolean;
  signedIn?: boolean;
  target?: { code: string; issuer: string; network: string };
  orders?: OrderView[];
  message?: string;
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

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ ok: false }))) as {
    ok: boolean;
    order?: OrderView;
    swapTransaction?: string;
    code?: string;
    message?: string;
  };
}

export function ExitRunner() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [amount, setAmount] = useState("0.05");
  const [wallet, setWallet] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/external-utility/exit", { cache: "no-store" });
        const data = (await response.json()) as Bootstrap;
        if (cancelled) return;
        setBootstrap(data);
        const existing = data.orders?.[0] ?? null;
        if (existing) {
          setOrder(existing);
          setResumeId(existing.id);
          if (existing.executionWallet) setWallet(existing.executionWallet);
        }
      } catch {
        if (!cancelled) setBootstrap({ ok: false, message: "Could not load the exit route." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resumeId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/external-utility/exit/${resumeId}`, { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; order?: OrderView };
        if (data.ok && data.order) setOrder(data.order);
      } catch {
        /* retryable */
      }
    }, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [resumeId]);

  async function connectWallet() {
    setNotice(null);
    const provider = window.solana;
    if (!provider) {
      setNotice("No Solana wallet found. Install a Solana wallet, then try again.");
      return;
    }
    try {
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        setNotice("The wallet did not share a valid address.");
        return;
      }
      setWallet(address);
    } catch {
      setNotice("The wallet request was dismissed. Nothing was created.");
    }
  }

  async function createOrder() {
    if (!wallet || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await postJson("/api/external-utility/exit", {
      sourceAmount: amount.trim(),
      executionWallet: wallet,
      eligibilityAcknowledged: ack,
    });
    setBusy(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      setResumeId(result.order.id);
    } else {
      setNotice(result.message ?? "That exit could not be created.");
    }
  }

  async function refreshQuote() {
    if (!order || busy) return;
    setBusy(true);
    const result = await postJson(`/api/external-utility/exit/${order.id}/quote`, {});
    setBusy(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      if (result.order.failureReason === "quote-unavailable") {
        setNotice("No executable Jupiter exit price right now — the order keeps waiting. Nothing was invented.");
      }
    } else {
      setNotice(result.message ?? "The exit quote could not be refreshed.");
    }
  }

  async function executeExit() {
    if (!order || !wallet || busy) return;
    const provider = window.solana;
    if (!provider) {
      setNotice("Reconnect the Solana wallet that owns this exit.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const prepared = await postJson(`/api/external-utility/exit/${order.id}/prepare`, {});
      if (!prepared.ok || !prepared.swapTransaction || !prepared.order) {
        setNotice(prepared.message ?? "The exit could not be prepared. Refresh the quote and try again.");
        setBusy(false);
        return;
      }
      setOrder(prepared.order);
      const bytes = Uint8Array.from(atob(prepared.swapTransaction), (char) => char.charCodeAt(0));
      const transaction = VersionedTransaction.deserialize(bytes);
      const signed = await provider.signTransaction(transaction);
      const connection = new Connection(RPC_URL, "confirmed");
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 2,
      });
      const confirmed = await postJson(`/api/external-utility/exit/${order.id}/confirm`, { signature });
      if (confirmed.ok && confirmed.order) {
        setOrder(confirmed.order);
        if (confirmed.order.status !== "confirmed") {
          setNotice(confirmed.order.lastError ?? "Submitted — verification is still pending. It stays retryable.");
        }
      } else {
        setNotice(confirmed.message ?? "The exit was submitted; confirmation is pending. It stays retryable.");
      }
    } catch {
      setNotice("The wallet dismissed the signature. No transaction was submitted.");
    }
    setBusy(false);
  }

  if (!bootstrap) return <p className="muted">Loading the exit route…</p>;
  if (!bootstrap.ok) return <p className="muted">{bootstrap.message ?? "The exit route is unavailable."}</p>;
  const confirmed = order?.status === "confirmed";

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Home ★ Stellar · Exit · AAPLx → Solana USDC</p>
        <h1>Exit AAPLx to Solana USDC</h1>
        <p className="muted">
          Real Jupiter routing, fresh quote, wallet signs, Vicus verifies token deltas. Finishes at
          “Exited to Solana USDC” — no bridge claim.
        </p>
      </section>

      <section className="card">
        <div className="row">
          <label className="field">
            <span>AAPLx amount</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.05" />
          </label>
          <div className="field">
            <span>Execution wallet</span>
            {wallet ? (
              <p className="mono">{wallet}</p>
            ) : (
              <button type="button" onClick={connectWallet}>Connect Solana wallet</button>
            )}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>{order?.eligibilityCopy ?? "I confirm I am eligible under the issuer and venue terms."}</span>
        </label>
        <div className="row">
          <button type="button" onClick={createOrder} disabled={!wallet || !ack || busy}>
            {busy ? "Working…" : "Create exit order"}
          </button>
          {order && (
            <button type="button" onClick={refreshQuote} disabled={busy}>
              Refresh live quote
            </button>
          )}
        </div>
        {notice && <p className="muted">{notice}</p>}
      </section>

      {order && (
        <section className="card">
          <p className="eyebrow">Exit order · {order.status}</p>
          <p>
            Exiting <strong>{order.sourceAmountDisplay} AAPLx</strong>
            {order.quote.amountOutDisplay ? (
              <> → ≈ <strong>{order.quote.amountOutDisplay} USDC</strong> (min {order.quote.minOutDisplay})</>
            ) : (
              <> — no executable price yet</>
            )}
          </p>
          {order.swapExplorerUrl && (
            <p><a href={order.swapExplorerUrl} target="_blank" rel="noreferrer">View on Solana Explorer</a></p>
          )}
          {order.lastError && <p className="muted">{order.lastError}</p>}
          {!confirmed && order.quote.amountOutDisplay && (
            <button type="button" onClick={executeExit} disabled={busy}>
              {busy ? "Working…" : "Sign + exit with wallet"}
            </button>
          )}
          {confirmed && <p><strong>Exited to Solana USDC.</strong></p>}
        </section>
      )}
    </div>
  );
}
