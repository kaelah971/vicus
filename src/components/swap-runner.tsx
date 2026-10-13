"use client";

import { useEffect, useRef, useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import {
  SWAP_RPC_URL,
  SWAP_SOURCE_CODE,
} from "@/lib/external-utility/client-config";

type OrderView = {
  id: string;
  targetSlug: string;
  targetCode: string;
  sourceAmountDisplay: string;
  executionWallet: string | null;
  venue: string;
  eligibilityAcknowledged: boolean;
  eligibilityCopy: string;
  fundingNote: string;
  quote: { amountOutDisplay: string | null; minOutDisplay: string | null; quotedAt: string | null };
  swapSignature: string | null;
  swapExplorerUrl: string | null;
  targetAmount: string | null;
  status: string;
  failureReason: string | null;
  lastError: string | null;
};

type Bootstrap = {
  ok: boolean;
  signedIn?: boolean;
  target?: { code: string; issuer: string; network: string; mint: string; representation: string; eligibilityNote: string };
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
    minOutSubunits?: string;
    code?: string;
    message?: string;
  };
}

export function SwapRunner({ slug }: { slug: string }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [amount, setAmount] = useState("25");
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
        const response = await fetch(`/api/external-utility/orders?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        const data = (await response.json()) as Bootstrap;
        if (cancelled) return;
        setBootstrap(data);
        const existing = (data.orders ?? []).find((order) => order.targetSlug === slug) ?? null;
        if (existing) {
          setOrder(existing);
          setResumeId(existing.id);
          if (existing.executionWallet) setWallet(existing.executionWallet);
        }
      } catch {
        if (!cancelled) setBootstrap({ ok: false, message: "Could not load the route." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Resume tracking on reload: poll the owned order, never create another.
  useEffect(() => {
    if (!resumeId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/external-utility/orders/${resumeId}`, { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; order?: OrderView };
        if (data.ok && data.order) setOrder(data.order);
      } catch {
        /* retryable: keep the last known state */
      }
    }, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [resumeId]);

  async function connectSolanaWallet() {
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
    const result = await postJson("/api/external-utility/orders", {
      targetSlug: slug,
      sourceAmount: amount.trim(),
      executionWallet: wallet,
      eligibilityAcknowledged: ack,
    });
    setBusy(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      setResumeId(result.order.id);
    } else {
      setNotice(result.message ?? "That order could not be created.");
    }
  }

  async function refreshQuote() {
    if (!order || busy) return;
    setBusy(true);
    const result = await postJson(`/api/external-utility/orders/${order.id}/quote`, {});
    setBusy(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      if (result.order.failureReason === "quote-unavailable") {
        setNotice("No executable Jupiter price right now — the order keeps waiting. Nothing was invented.");
      }
    } else {
      setNotice(result.message ?? "The quote could not be refreshed.");
    }
  }

  async function executeSwap() {
    if (!order || !wallet || busy) return;
    const provider = window.solana;
    if (!provider) {
      setNotice("Reconnect the Solana wallet that owns this order.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const prepared = await postJson(`/api/external-utility/orders/${order.id}/prepare`, {});
      if (!prepared.ok || !prepared.swapTransaction || !prepared.order) {
        setNotice(prepared.message ?? "The swap could not be prepared. Refresh the quote and try again.");
        setBusy(false);
        return;
      }
      setOrder(prepared.order);
      const bytes = Uint8Array.from(atob(prepared.swapTransaction), (char) => char.charCodeAt(0));
      const transaction = VersionedTransaction.deserialize(bytes);
      const signed = await provider.signTransaction(transaction);
      const connection = new Connection(SWAP_RPC_URL, "confirmed");
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 2,
      });
      const confirmed = await postJson(`/api/external-utility/orders/${order.id}/confirm`, { signature });
      if (confirmed.ok && confirmed.order) {
        setOrder(confirmed.order);
        if (confirmed.order.status !== "confirmed") {
          setNotice(confirmed.order.lastError ?? "Submitted — verification is still pending. It stays retryable.");
        }
      } else {
        setNotice(confirmed.message ?? "The swap was submitted; confirmation is pending. It stays retryable.");
      }
    } catch {
      setNotice("The wallet dismissed the signature. No transaction was submitted.");
    }
    setBusy(false);
  }

  if (!bootstrap) return <p className="muted">Loading the route…</p>;
  if (!bootstrap.ok || !bootstrap.target) {
    return <p className="muted">{bootstrap.message ?? "The route is unavailable right now."}</p>;
  }
  const target = bootstrap.target;
  const confirmed = order?.status === "confirmed";
  const targetCode = order?.targetCode ?? target.code;

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Home ★ Stellar · Utility beyond Stellar · {target.code} on {target.network}</p>
        <h1>Swap {SWAP_SOURCE_CODE} for {target.code}</h1>
        <p className="muted">{target.representation}</p>
        <dl className="fact-list">
          <div><dt>Issuer</dt><dd>{target.issuer}</dd></div>
          <div><dt>Network</dt><dd>{target.network}</dd></div>
          <div><dt>Mint</dt><dd className="mono">{target.mint}</dd></div>
          <div><dt>Venue</dt><dd>Jupiter routing</dd></div>
          <div><dt>Eligibility</dt><dd>{target.eligibilityNote}</dd></div>
        </dl>
        <p className="muted small">
          Funded with Solana USDC from your connected wallet — Vicus makes no Stellar bridge claim for this route.
          Vicus prepares the swap; your wallet signs; Vicus verifies the exact onchain result.
        </p>
      </section>

      {!order ? (
        <section className="card">
          <h2>Start the swap</h2>
          <label className="field">
            <span>Amount (Solana USDC, max 6 decimals)</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="25" />
          </label>
          <div className="row">
            {wallet ? (
              <p className="muted small">Solana wallet <span className="mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span> connected.</p>
            ) : (
              <button type="button" className="btn" onClick={() => void connectSolanaWallet()}>Connect Solana wallet</button>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
            <span>I confirm I am eligible under the issuer and venue terms. Vicus does not verify eligibility.</span>
          </label>
          <button type="button" className="btn primary" disabled={!wallet || !ack || busy} onClick={() => void createOrder()}>
            {busy ? "Creating…" : "Continue"}
          </button>
          {notice ? <p className="notice">{notice}</p> : null}
        </section>
      ) : (
        <section className="card">
          <h2>Swap status</h2>
          <ol className="route-steps">
            <li className="done">Order created — {order.sourceAmountDisplay} {SWAP_SOURCE_CODE} → {targetCode}</li>
            <li className={order.quote.amountOutDisplay ? "done" : "pending"}>
              {order.quote.amountOutDisplay
                ? `Live Jupiter quote — ≈ ${order.quote.amountOutDisplay} ${targetCode} (min ${order.quote.minOutDisplay})`
                : "Jupiter quote — refresh for the live price"}
            </li>
            <li className={confirmed ? "done" : "pending"}>
              {confirmed
                ? `Swapped — ${order.targetAmount} base units received`
                : "Sign and submit with your Solana wallet"}
            </li>
          </ol>
          {!confirmed ? (
            <div className="row">
              <button type="button" className="btn" disabled={busy} onClick={() => void refreshQuote()}>
                {busy ? "Refreshing…" : "Refresh live quote"}
              </button>
              <button type="button" className="btn primary" disabled={busy || !order.quote.amountOutDisplay} onClick={() => void executeSwap()}>
                {busy ? "Working…" : "Swap with wallet"}
              </button>
            </div>
          ) : (
            <div className="row">
              {order.swapExplorerUrl ? (
                <a className="btn ghost" href={order.swapExplorerUrl} rel="noreferrer" target="_blank">View on Solana explorer</a>
              ) : null}
              <a className="btn ghost" href={`/circles/${slug}`}>View asset</a>
            </div>
          )}
          {notice ? <p className="notice">{notice}</p> : null}
          <p className="muted small mono">Order {order.id} · status {order.status} · resumes automatically on reload.</p>
        </section>
      )}
    </div>
  );
}

