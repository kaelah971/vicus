"use client";

import { useState } from "react";

type Position = {
  assetSlug: string;
  code: string;
  network: string;
  assetClass: string;
  issuer: string;
  balance: string;
  walletSource: string;
  openHref: string;
  actions: { kind: string; title: string; state: string; href: string }[];
  lendingPosition?: {
    protocol: string;
    collateralCode: string;
    collateralDisplay: string;
    borrowedCode: string;
    borrowedDisplay: string;
    healthFactor: number | null;
    marketUrl: string;
  };
};

type ChainResult = { ok: boolean; positions?: Position[]; partial?: boolean; code?: string; message?: string };

type SolanaProvider = {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signTransaction<T>(tx: T): Promise<T>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
    ethereum?: {
      request(args: { method: string; params?: unknown }): Promise<unknown>;
    };
  }
}

async function postJson(url: string, body: unknown): Promise<ChainResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ ok: false }))) as ChainResult;
}

function PositionCard({ position }: { position: Position }) {
  return (
    <div className="watch-card">
      <p>
        <strong>{position.code}</strong>
        <span className="muted"> · {position.network}</span>
      </p>
      <p>
        Balance <strong>{position.balance} {position.code}</strong>
      </p>
      <p className="muted small">Live onchain · {position.issuer}</p>
      {position.lendingPosition && (
        <p className="muted small">
          {position.lendingPosition.protocol}: {position.lendingPosition.collateralDisplay} {position.lendingPosition.collateralCode} collateral
          · {position.lendingPosition.borrowedDisplay} {position.lendingPosition.borrowedCode} borrowed
          {position.lendingPosition.healthFactor !== null ? ` · health ${position.lendingPosition.healthFactor.toFixed(2)}` : ""}{" "}
          <a href={position.lendingPosition.marketUrl} target="_blank" rel="noreferrer">Market</a>
        </p>
      )}
      {position.actions.length > 0 && (
        <p className="muted small">{position.actions.map((a) => a.title).join(" · ")}</p>
      )}
      <a className="button button-outline button-small" href={position.openHref}>
        Open asset
      </a>
    </div>
  );
}

export function ConnectedPositions() {
  const [solana, setSolana] = useState<Position[] | null>(null);
  const [solanaNote, setSolanaNote] = useState<string | null>(null);
  const [base, setBase] = useState<Position[] | null>(null);
  const [baseNote, setBaseNote] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  async function connectSolana() {
    setSolanaNote(null);
    const provider = window.solana;
    if (!provider) {
      setSolanaNote("No Solana wallet found. Install one, then try again.");
      return;
    }
    if (busy) return;
    setBusy("solana");
    try {
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();
      const result = await postJson("/api/positions/solana", { wallet: address });
      if (result.ok) {
        setSolana(result.positions ?? []);
        setSolanaNote(result.partial ? "One or more balances could not be read — the list may be partial." : null);
      } else {
        setSolanaNote(result.message ?? "Solana balances could not be read.");
      }
    } catch {
      setSolanaNote("The wallet request was dismissed. Nothing was read.");
    }
    setBusy("");
  }

  async function connectBase() {
    setBaseNote(null);
    const provider = window.ethereum;
    if (!provider) {
      setBaseNote("No Base wallet found. Install one, then try again.");
      return;
    }
    if (busy) return;
    setBusy("base");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      if (chainId !== "0x2105") {
        setBaseNote("That wallet is not on Base. Switch it to Base (chain 8453) before continuing.");
        setBusy("");
        return;
      }
      const result = await postJson("/api/positions/base", { wallet: address });
      if (result.ok) {
        setBase(result.positions ?? []);
        setBaseNote(result.partial ? "One or more balances could not be read — the list may be partial." : null);
      } else {
        setBaseNote(result.message ?? "Base balances could not be read.");
      }
    } catch {
      setBaseNote("The wallet request was dismissed. Nothing was read.");
    }
    setBusy("");
  }

  return (
    <>
      <section className="card">
        <h2>Solana positions</h2>
        {solana === null ? (
          <>
            <p className="muted">Connect your Solana execution wallet to view current positions. Past swaps never imply holdings.</p>
            <button type="button" onClick={connectSolana} disabled={busy === "solana"}>
              {busy === "solana" ? "Reading…" : "Connect Solana wallet"}
            </button>
          </>
        ) : solana.length === 0 ? (
          <p className="muted">No Vicus tokenized assets in this wallet right now.</p>
        ) : (
          <div className="watch-grid">
            {solana.map((position) => (
              <PositionCard key={position.assetSlug} position={position} />
            ))}
          </div>
        )}
        {solanaNote && <p className="muted">{solanaNote}</p>}
      </section>

      <section className="card">
        <h2>Base positions</h2>
        {base === null ? (
          <>
            <p className="muted">Connect your Base execution wallet to view current positions.</p>
            <button type="button" onClick={connectBase} disabled={busy === "base"}>
              {busy === "base" ? "Reading…" : "Connect Base wallet"}
            </button>
          </>
        ) : base.length === 0 ? (
          <p className="muted">No Vicus tokenized assets in this wallet right now.</p>
        ) : (
          <div className="watch-grid">
            {base.map((position) => (
              <PositionCard key={position.assetSlug} position={position} />
            ))}
          </div>
        )}
        {baseNote && <p className="muted">{baseNote}</p>}
      </section>
    </>
  );
}
