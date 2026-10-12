"use client";

import { useEffect, useRef, useState } from "react";

type OrderView = {
  id: string;
  targetSlug: string;
  targetCode: string;
  targetContract: string;
  sourceAsset: string;
  sourceNetwork: string;
  sourceAmountSubunits: string;
  sourceAmountDisplay: string;
  destinationNetwork: string;
  executionWallet: string | null;
  venue: string;
  eligibilityAcknowledged: boolean;
  eligibilityCopy: string;
  accessTransferId: string | null;
  quote: { amountOutDisplay: string | null; minOutDisplay: string | null; quotedAt: string | null };
  destinationUsdcAmount: string | null;
  targetAmount: string | null;
  approvalHash: string | null;
  swapHash: string | null;
  status: string;
  executionEnabled: boolean;
  disabledReasons: string[];
  failureReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type Bootstrap = {
  ok: boolean;
  signedIn?: boolean;
  target?: {
    code: string;
    label: string;
    assetClass: string;
    issuer: string;
    network: string;
    contractAddress: string;
    decimals: number;
    officialUrl: string;
    representation: string;
    eligibilityNote: string;
    executable: boolean;
    unavailableReason: string | null;
  };
  executionEnabled?: boolean;
  disabledReasons?: string[];
  orders?: OrderView[];
  code?: string;
  message?: string;
};

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown }): Promise<unknown>;
    };
  }
}

const BASE_CHAIN_ID = "0x2105";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; order?: OrderView; code?: string; message?: string };
}

export function AcquireRunner() {
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
        const response = await fetch("/api/asset-access/orders", { cache: "no-store" });
        const data = (await response.json()) as Bootstrap;
        if (cancelled) return;
        setBootstrap(data);
        const existing = data.orders?.[0] ?? null;
        if (existing) {
          setOrder(existing);
          setResumeId(existing.id);
        }
      } catch {
        if (!cancelled) setBootstrap({ ok: false, message: "Could not load the route." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume tracking on reload: poll the owned order, never create another.
  useEffect(() => {
    if (!resumeId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/asset-access/orders/${resumeId}`, { cache: "no-store" });
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

  async function connectBaseWallet() {
    setNotice(null);
    const provider = window.ethereum;
    if (!provider) {
      setNotice("No Base wallet found. Install a wallet that supports Base, then try again.");
      return;
    }
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        setNotice("The wallet did not share an address.");
        return;
      }
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      if (chainId !== BASE_CHAIN_ID) {
        setNotice("That wallet is not on Base. Switch it to Base (chain 8453) before continuing.");
        return;
      }
      setWallet(`0x${address.slice(2).toLowerCase()}`);
    } catch {
      setNotice("The wallet request was dismissed. Nothing was created.");
    }
  }

  async function createOrder() {
    if (!wallet || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await postJson("/api/asset-access/orders", {
      targetSlug: "aaplc-on-base",
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
    const result = await postJson(`/api/asset-access/orders/${order.id}/quote`, {});
    setBusy(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      if (result.order.failureReason === "quote-unavailable") {
        setNotice("No executable venue price right now — the order keeps waiting. Nothing was invented.");
      }
    } else {
      setNotice(result.message ?? "The quote could not be refreshed.");
    }
  }

  if (!bootstrap) return <p className="muted">Loading the route…</p>;
  if (!bootstrap.ok || !bootstrap.target) {
    return <p className="muted">{bootstrap.message ?? "The route is unavailable right now."}</p>;
  }
  const target = bootstrap.target;

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Home ★ Stellar · Pay with Stellar USDC · Target {target.code} on Base</p>
        <h1>Access {target.code} with Stellar USDC</h1>
        <p className="muted">{target.representation}</p>
        <dl className="fact-list">
          <div><dt>Issuer</dt><dd>{target.issuer}</dd></div>
          <div><dt>Network</dt><dd>{target.network}</dd></div>
          <div><dt>Contract</dt><dd className="mono">{target.contractAddress}</dd></div>
          <div><dt>Eligibility</dt><dd>{target.eligibilityNote}</dd></div>
        </dl>
        <p className="muted small">
          Vicus handles the path: Stellar USDC → Circle CCTP → Base USDC → verified venue → {target.code}.
          This page never moves funds by itself — every leg is signed by you.
        </p>
      </section>

      {!order ? (
        <section className="card">
          <h2>Start the route</h2>
          <label className="field">
            <span>Amount (Stellar USDC, max 6 decimals)</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="25" />
          </label>
          <div className="row">
            {wallet ? (
              <p className="muted small">Base wallet <span className="mono">{wallet.slice(0, 10)}…{wallet.slice(-6)}</span> connected.</p>
            ) : (
              <button type="button" className="btn" onClick={() => void connectBaseWallet()}>Connect Base wallet</button>
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
          <h2>Route status</h2>
          <ol className="route-steps">
            <li className="done">Order created — {order.sourceAmountDisplay} Stellar USDC → {order.targetCode}</li>
            <li className={order.accessTransferId ? "done" : "pending"}>
              {order.accessTransferId ? "Bridge leg linked — track it in Access" : "Bridge leg — move USDC in Access, then link it here"}
            </li>
            <li className={order.quote.amountOutDisplay ? "done" : "pending"}>
              {order.quote.amountOutDisplay
                ? `Live venue quote — ≈ ${order.quote.amountOutDisplay} ${order.targetCode} (min ${order.quote.minOutDisplay})`
                : "Venue quote — refresh for the live onchain price"}
            </li>
            <li className="pending">
              Acquisition — {order.executionEnabled ? "available" : "not executable yet"}
            </li>
          </ol>
          {!order.executionEnabled ? (
            <div className="notice-block">
              <p><strong>USDC that arrives on Base stays yours.</strong> Acquisition is disabled for now:</p>
              <ul>
                {order.disabledReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {order.failureReason === "quote-unavailable" ? (
                <p className="muted small">No executable venue price right now — nothing was invented, the order keeps waiting.</p>
              ) : null}
            </div>
          ) : null}
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void refreshQuote()}>
              {busy ? "Refreshing…" : "Refresh live quote"}
            </button>
            <a className="btn ghost" href="/access">Open Access for the bridge leg</a>
          </div>
          {notice ? <p className="notice">{notice}</p> : null}
          <p className="muted small mono">Order {order.id} · status {order.status} · resumes automatically on reload.</p>
        </section>
      )}
    </div>
  );
}
