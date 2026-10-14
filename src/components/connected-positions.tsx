"use client";

import { useState } from "react";
import { ButtonLink, EmptyState, StatusPill } from "@/components/vicus";
import { AssetToken, Chip, Orb, SectionHead } from "@/components/vicus-ui";

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

function HoldingCard({
  position,
  chainTone,
  liveLabel,
}: {
  position: Position;
  chainTone: "violet" | "blue";
  liveLabel: string;
}) {
  return (
    <article className="pos-hold">
      <div className="pos-hold-top">
        <AssetToken code={position.code} />
        <div className="pos-hold-id">
          <strong className="pos-hold-code">{position.code}</strong>
          <span className="pos-hold-net">{position.network}</span>
        </div>
        <span className="pos-hold-chip">
          <Chip tone={chainTone}>{position.network}</Chip>
        </span>
      </div>
      <p className="pos-balance">
        {position.balance} <small>{position.code}</small>
      </p>
      <p className="pos-issuer" title={position.issuer}>
        {liveLabel} · {position.issuer}
      </p>
      {position.lendingPosition && (
        <p className="pos-lending">
          {position.lendingPosition.protocol}: {position.lendingPosition.collateralDisplay}{" "}
          {position.lendingPosition.collateralCode} collateral ·{" "}
          {position.lendingPosition.borrowedDisplay} {position.lendingPosition.borrowedCode}{" "}
          borrowed
          {position.lendingPosition.healthFactor !== null
            ? ` · health ${position.lendingPosition.healthFactor.toFixed(2)}`
            : ""}{" "}
          <a href={position.lendingPosition.marketUrl} target="_blank" rel="noreferrer">
            Market
          </a>
        </p>
      )}
      {position.actions.length > 0 && (
        <p className="pos-actions-line">{position.actions.map((a) => a.title).join(" · ")}</p>
      )}
      <div className="pos-actions">
        <ButtonLink className="button-small" href={position.openHref} variant="outline">
          Open asset
        </ButtonLink>
      </div>
    </article>
  );
}

function ChainSection({
  chain,
  tone,
  icon,
  positions,
  note,
  busy,
  onConnect,
  connectLabel,
  readingLabel,
  connectCopy,
  emptyTitle,
  emptyCopy,
}: {
  chain: "solana" | "base";
  tone: "violet" | "blue";
  icon: "bolt" | "globe";
  positions: Position[] | null;
  note: string | null;
  busy: boolean;
  onConnect: () => void;
  connectLabel: string;
  readingLabel: string;
  connectCopy: string;
  emptyTitle: string;
  emptyCopy: string;
}) {
  const connected = positions !== null;
  return (
    <section className="pos-section" aria-label={`${chain === "solana" ? "Solana" : "Base"} positions`}>
      <SectionHead
        eyebrow={chain === "solana" ? "Connected wallet · Solana" : "Connected wallet · Base"}
        title={chain === "solana" ? "Solana positions" : "Base positions"}
        line={
          connected
            ? "Execution-wallet assets, read live at connect time."
            : connectCopy
        }
        action={
          connected && positions.length > 0 ? (
            <StatusPill tone="green">Live onchain</StatusPill>
          ) : undefined
        }
      />
      {!connected ? (
        <div className={`pos-connect pos-tone-${tone}`}>
          <div className="pos-connect-head">
            <Orb icon={icon} size="lg" tone={tone} />
            <div>
              <h3>{chain === "solana" ? "Connect Solana" : "Connect Base"}</h3>
              <p>{connectCopy} Past swaps never imply holdings.</p>
            </div>
          </div>
          <div className="pos-connect-action">
            <button
              className="button button-outline button-small"
              disabled={busy}
              onClick={onConnect}
              type="button"
            >
              {busy ? readingLabel : connectLabel}
            </button>
          </div>
          {note ? (
            <p className="field-help" role="status">
              {note}
            </p>
          ) : null}
        </div>
      ) : positions.length === 0 ? (
        <>
          <EmptyState
            title={emptyTitle}
            action={
              <ButtonLink className="button-small" href="/discover" variant="outline">
                Discover assets
              </ButtonLink>
            }
          >
            {emptyCopy}
          </EmptyState>
          {note ? (
            <p className="field-help pos-note" role="status">
              {note}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="pos-hold-grid">
            {positions.map((position) => (
              <HoldingCard
                key={position.assetSlug}
                chainTone={tone}
                liveLabel="Live onchain"
                position={position}
              />
            ))}
          </div>
          {note ? (
            <p className="field-help pos-note" role="status">
              {note}
            </p>
          ) : null}
        </>
      )}
    </section>
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
      <ChainSection
        chain="solana"
        tone="violet"
        icon="bolt"
        positions={solana}
        note={solanaNote}
        busy={busy !== ""}
        onConnect={connectSolana}
        connectLabel="Connect Solana wallet"
        readingLabel="Reading…"
        connectCopy="Connect your Solana execution wallet to view current positions."
        emptyTitle="No Solana holdings detected"
        emptyCopy="This wallet holds no Vicus tokenized assets right now. Balances appear here the moment they exist onchain — nothing is assumed."
      />
      <ChainSection
        chain="base"
        tone="blue"
        icon="globe"
        positions={base}
        note={baseNote}
        busy={busy !== ""}
        onConnect={connectBase}
        connectLabel="Connect Base wallet"
        readingLabel="Reading…"
        connectCopy="Connect your Base execution wallet to view current positions."
        emptyTitle="No Base holdings detected"
        emptyCopy="This wallet holds no Vicus tokenized assets right now. Balances appear here the moment they exist onchain — nothing is assumed."
      />
    </>
  );
}
