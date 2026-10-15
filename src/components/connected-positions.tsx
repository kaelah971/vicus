"use client";

import { useState } from "react";
import { ButtonLink, EmptyState, StatusPill } from "@/components/vicus";
import { AssetToken, Chip, Orb, SectionHead } from "@/components/vicus-ui";
import {
  abbreviateWallet,
  formatReadTime,
  getFreshness,
} from "@/lib/positions/freshness";

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

type ChainResult = {
  ok: boolean;
  positions?: Position[];
  partial?: boolean;
  readAt?: string | null;
  code?: string;
  message?: string;
};

/**
 * One wallet's read evidence. The address travels WITH the data so a stale
 * read can never be mistaken for another account, and a failed refresh
 * marks (never silently refreshes) what is shown.
 */
type ChainState = {
  address: string;
  positions: Position[];
  readAt: string | null;
  partial: boolean;
  stale: boolean;
} | null;

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

function FreshnessLine({
  chainState,
  refreshing,
  nowMs,
  onRefresh,
}: {
  chainState: NonNullable<ChainState>;
  refreshing: boolean;
  nowMs: number;
  onRefresh: () => void;
}) {
  const freshness = getFreshness(nowMs, chainState.readAt, chainState.stale);
  return (
    <div className="pos-fresh">
      <p className="field-help">
        {freshness === "stale" ? "Stale — " : ""}
        Updated {formatReadTime(chainState.readAt)} · wallet{" "}
        {abbreviateWallet(chainState.address)}
        {chainState.partial ? " · some balances unread" : ""}
      </p>
      {freshness === "stale" ? <Chip tone="orange">Stale</Chip> : null}
      <button
        className="button button-outline button-small"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function ChainSection({
  chain,
  tone,
  icon,
  chainState,
  note,
  busy,
  onConnect,
  onRefresh,
  connectLabel,
  readingLabel,
  connectCopy,
  emptyTitle,
  emptyCopy,
}: {
  chain: "solana" | "base";
  tone: "violet" | "blue";
  icon: "bolt" | "globe";
  chainState: ChainState;
  note: string | null;
  busy: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  connectLabel: string;
  readingLabel: string;
  connectCopy: string;
  emptyTitle: string;
  emptyCopy: string;
}) {
  const connected = chainState !== null;
  const positions = chainState?.positions ?? [];
  // Snapshot at mount: freshness labels reflect the last render without
  // impure clock reads during render. Failure-driven staleness is state
  // and always current; age-based staleness refreshes on re-render.
  const [nowMs] = useState(() => Date.now());
  return (
    <section className="pos-section" aria-label={`${chain === "solana" ? "Solana" : "Base"} positions`}>
      <SectionHead
        eyebrow={chain === "solana" ? "Connected wallet · Solana" : "Connected wallet · Base"}
        title={chain === "solana" ? "Solana positions" : "Base positions"}
        line={
          connected
            ? "Execution-wallet assets, re-read from chain on demand."
            : connectCopy
        }
        action={
          connected && positions.length > 0 && !chainState.stale ? (
            <StatusPill tone="green">Live onchain</StatusPill>
          ) : undefined
        }
      />
      {connected ? (
        <FreshnessLine chainState={chainState} refreshing={busy} nowMs={nowMs} onRefresh={onRefresh} />
      ) : null}
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
                liveLabel={chainState.stale ? "Stale read" : "Live onchain"}
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

const PARTIAL_COPY = "One or more balances could not be read — the list may be partial.";

export function ConnectedPositions() {
  const [solana, setSolana] = useState<ChainState>(null);
  const [solanaNote, setSolanaNote] = useState<string | null>(null);
  const [base, setBase] = useState<ChainState>(null);
  const [baseNote, setBaseNote] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  function staleNote(readAt: string | null): string {
    return `Couldn't refresh just now — showing the ${formatReadTime(readAt)} read. Old data is never presented as fresh.`;
  }

  async function readSolana(address: string, setState: typeof setSolana, setNote: typeof setSolanaNote) {
    const result = await postJson("/api/positions/solana", { wallet: address });
    if (result.ok) {
      setState({
        address,
        positions: result.positions ?? [],
        readAt: typeof result.readAt === "string" ? result.readAt : new Date().toISOString(),
        partial: result.partial === true,
        stale: false,
      });
      setNote(result.partial ? PARTIAL_COPY : null);
      return;
    }
    throw new Error(result.message ?? "Solana balances could not be read.");
  }

  async function readBase(address: string) {
    const result = await postJson("/api/positions/base", { wallet: address });
    if (result.ok) {
      setBase({
        address,
        positions: result.positions ?? [],
        readAt: typeof result.readAt === "string" ? result.readAt : new Date().toISOString(),
        partial: result.partial === true,
        stale: false,
      });
      setBaseNote(result.partial ? PARTIAL_COPY : null);
      return;
    }
    throw new Error(result.message ?? "Base balances could not be read.");
  }

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
      // A different account replaces everything — holdings never bleed
      // across wallets. A failed read keeps prior data only if it belongs
      // to this same address, marked stale.
      setSolana((prev) => (prev && prev.address !== address ? null : prev));
      await readSolana(address, setSolana, setSolanaNote);
    } catch (error) {
      setSolana((prev) => {
        if (prev) {
          setSolanaNote(staleNote(prev.readAt));
          return { ...prev, stale: true };
        }
        setSolanaNote(error instanceof Error ? error.message : "Solana balances could not be read.");
        return null;
      });
    }
    setBusy("");
  }

  async function refreshSolana() {
    if (busy || !solana) return;
    setBusy("solana-refresh");
    try {
      await readSolana(solana.address, setSolana, setSolanaNote);
    } catch {
      setSolana((prev) => (prev ? { ...prev, stale: true } : prev));
      setSolanaNote(staleNote(solana.readAt));
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
      setBase((prev) => (prev && prev.address.toLowerCase() !== (address ?? "").toLowerCase() ? null : prev));
      await readBase(address);
    } catch (error) {
      setBase((prev) => {
        if (prev) {
          setBaseNote(staleNote(prev.readAt));
          return { ...prev, stale: true };
        }
        setBaseNote(error instanceof Error ? error.message : "Base balances could not be read.");
        return null;
      });
    }
    setBusy("");
  }

  async function refreshBase() {
    if (busy || !base) return;
    setBusy("base-refresh");
    try {
      await readBase(base.address);
    } catch {
      setBase((prev) => (prev ? { ...prev, stale: true } : prev));
      setBaseNote(staleNote(base.readAt));
    }
    setBusy("");
  }

  return (
    <>
      <ChainSection
        chain="solana"
        tone="violet"
        icon="bolt"
        chainState={solana}
        note={solanaNote}
        busy={busy !== ""}
        onConnect={connectSolana}
        onRefresh={refreshSolana}
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
        chainState={base}
        note={baseNote}
        busy={busy !== ""}
        onConnect={connectBase}
        onRefresh={refreshBase}
        connectLabel="Connect Base wallet"
        readingLabel="Reading…"
        connectCopy="Connect your Base execution wallet to view current positions."
        emptyTitle="No Base holdings detected"
        emptyCopy="This wallet holds no Vicus tokenized assets right now. Balances appear here the moment they exist onchain — nothing is assumed."
      />
    </>
  );
}
