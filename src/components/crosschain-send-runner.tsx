"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import * as FreighterApi from "@stellar/freighter-api";

type Contact = { id: string; displayName: string; handle: string | null };

type DestinationOption = {
  key: string;
  label: string;
  executable: boolean;
  unavailableReason: string | null;
  explorerTx: string;
};

type TransferView = {
  id: string;
  sourceNetwork: string;
  destinationNetwork: string;
  destinationLabel: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  status: string;
  environment: string;
  sourceTxHash: string | null;
  destinationTxHash: string | null;
  retryable: boolean;
  lastError: string | null;
  completedAt: string | null;
};

type SendView = {
  transfer: TransferView;
  recipientHandle: string | null;
  recipientNetwork: string;
  environment: string;
};

type Preparation = {
  transferId: string;
  unsignedXdr?: string;
  unsignedTransaction?: string;
  networkPassphrase: string;
};

type ApiResponse = { ok: boolean; message?: string; code?: string };

function abbreviate(value: string) {
  return value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

async function post<T>(url: string, body?: unknown): Promise<T & ApiResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await response.json().catch(() => ({ ok: false, message: "The send request failed." }))) as T & ApiResponse;
}

export function CrosschainSendRunner() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [recipient, setRecipient] = useState("");
  const [network, setNetwork] = useState("base");
  const [amount, setAmount] = useState("");
  const [send, setSend] = useState<SendView | null>(null);
  const [history, setHistory] = useState<SendView[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/contacts", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as (ApiResponse & { contacts?: Contact[] }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.contacts)) setContacts(payload.contacts);
      } catch {
        /* contacts stay empty rather than faked */
      }
      try {
        const response = await fetch("/api/access/config", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as (ApiResponse & { destinations?: DestinationOption[] }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.destinations)) setDestinations(payload.destinations);
      } catch {
        /* destinations stay empty rather than faked */
      }
      try {
        const response = await fetch("/api/crosschain-send", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as (ApiResponse & { sends?: SendView[] }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.sends)) {
          setHistory(payload.sends);
          if (payload.sends[0] && payload.sends[0].transfer.status !== "completed") setSend(payload.sends[0]);
        }
      } catch {
        /* history stays empty rather than faked */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload-safe tracking: poll the owned send, never create another.
  const trackedId = send?.transfer.id ?? null;
  const trackedStatus = send?.transfer.status ?? null;
  useEffect(() => {
    if (!trackedId || trackedStatus === "completed" || trackedStatus === "failed") return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/crosschain-send/${trackedId}`, { cache: "no-store" });
        const payload = (await response.json()) as ApiResponse & { send?: SendView };
        if (payload.ok && payload.send) setSend(payload.send);
      } catch {
        /* retryable: keep the last known state */
      }
    }, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [trackedId, trackedStatus]);

  function fail(message: string) {
    setError(message);
    setNotice("");
    setBusy("");
  }

  function resolveRecipientInput(): { handle?: string; contactId?: string } {
    const trimmed = recipient.trim();
    const match = contacts.find(
      (contact) => contact.id === trimmed || (contact.handle && `@${contact.handle}` === trimmed) || contact.handle === trimmed.replace(/^@/, ""),
    );
    if (match && trimmed === match.id) return { contactId: match.id };
    return { handle: trimmed.replace(/^@/, "") };
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("create");
    setError("");
    setNotice("Resolving the recipient's receive endpoint…");
    const created = await post<{ send?: SendView }>("/api/crosschain-send", {
      ...resolveRecipientInput(),
      destinationNetwork: network,
      amount: amount.trim(),
    });
    if (!created.ok || !created.send) {
      fail(created.message ?? "That send could not be started.");
      return;
    }
    setSend(created.send);
    setHistory((prev) => [created.send!, ...prev.filter((entry) => entry.transfer.id !== created.send!.transfer.id)]);
    setBusy("");
    setNotice(
      created.send.transfer.status === "draft"
        ? "Review the plan, then approve the burn in Freighter."
        : "Resumed the existing send — nothing was duplicated.",
    );
  }

  async function handleApproveAndBurn() {
    if (!send || busy) return;
    setBusy("burn");
    setError("");
    // Burn preparation + recording reuse the proven Access endpoints: the
    // user signs the Stellar burn in Freighter; Vicus never holds keys.
    const prepared = await post<{ preparation?: Preparation }>(
      `/api/access/transfers/${send.transfer.id}/prepare`,
    );
    const unsignedXdr = prepared.ok && prepared.preparation
      ? (prepared.preparation.unsignedXdr ?? prepared.preparation.unsignedTransaction)
      : null;
    if (!prepared.ok || !prepared.preparation || !unsignedXdr) {
      fail(prepared.message ?? "The burn could not be prepared.");
      return;
    }
    let signedXdr: string | null = null;
    try {
      const signTransaction = (
        FreighterApi as {
          signTransaction?: (xdr: string, opts?: Record<string, string>) => Promise<{ signedTxXdr?: string; signedTransaction?: string }>;
        }
      ).signTransaction;
      if (!signTransaction) {
        fail("Freighter is not available. Connect Freighter, then try again.");
        return;
      }
      const signed = await signTransaction(unsignedXdr, { networkPassphrase: prepared.preparation.networkPassphrase });
      signedXdr = signed.signedTxXdr ?? signed.signedTransaction ?? null;
    } catch {
      fail("The Freighter signature was dismissed. Nothing was submitted.");
      return;
    }
    if (!signedXdr) {
      fail("Freighter did not return a signed transaction. Nothing was submitted.");
      return;
    }
    const attached = await post<{ transfer?: TransferView }>(`/api/access/transfers/${send.transfer.id}/burn`, {
      signedXdr,
    });
    if (!attached.ok || !attached.transfer) {
      fail(attached.message ?? "The burn could not be recorded.");
      return;
    }
    const refreshed = await post<{ send?: SendView }>(`/api/crosschain-send/${send.transfer.id}/refresh`);
    setSend(refreshed.ok && refreshed.send ? refreshed.send : { ...send, transfer: attached.transfer });
    setBusy("");
    setNotice("Burn submitted. Vicus now tracks attestation and delivery.");
  }

  async function handleRefresh() {
    if (!send || busy) return;
    setBusy("refresh");
    const refreshed = await post<{ send?: SendView }>(`/api/crosschain-send/${send.transfer.id}/refresh`);
    if (refreshed.ok && refreshed.send) {
      setSend(refreshed.send);
      setNotice("");
    } else {
      setError(refreshed.message ?? "Status could not be refreshed.");
    }
    setBusy("");
  }

  const transfer = send?.transfer ?? null;
  const done = transfer?.status === "completed";

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Home ★ Stellar · Send · Cross-chain</p>
        <h1>Send USDC to @handle, cross-chain</h1>
        <p className="muted">
          Stellar Testnet USDC → Circle CCTP → your contact&apos;s Base or Ethereum USDC endpoint.{" "}
          <strong>Testnet only.</strong> I know the person — Vicus resolves where they can receive.
        </p>
      </section>

      <section className="card">
        <h2>To</h2>
        <form onSubmit={handleCreate} className="stack">
          <label className="field">
            <span>Recipient (@handle or saved contact)</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="@ada"
              list="cc-contact-handles"
            />
            <datalist id="cc-contact-handles">
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.handle ? `@${contact.handle}` : contact.displayName} />
              ))}
            </datalist>
          </label>
          <div className="field">
            <span>Receive on</span>
            <div className="row">
              {destinations
                .filter((d) => d.key === "base" || d.key === "ethereum" || d.key === "solana")
                .map((d) => (
                  <label key={d.key} className="check">
                    <input
                      type="radio"
                      name="cc-network"
                      checked={network === d.key}
                      onChange={() => setNetwork(d.key)}
                      disabled={!d.executable}
                    />
                    <span>
                      {d.label}
                      {d.executable ? "" : ` — ${d.unavailableReason ?? "not available"}`}
                    </span>
                  </label>
                ))}
            </div>
          </div>
          <label className="field">
            <span>Amount (USDC)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="5" />
          </label>
          <button type="submit" disabled={busy === "create"}>
            {busy === "create" ? "Resolving…" : "Review send"}
          </button>
        </form>
        {error && <p className="muted">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
      </section>

      {transfer && (
        <section className="card">
          <p className="eyebrow">
            {transfer.environment === "testnet" ? "Stellar Testnet" : transfer.environment} · {transfer.status}
          </p>
          <p>
            <strong>{transfer.amount} USDC</strong> · Stellar →{" "}
            <strong>{send?.recipientHandle ? `@${send.recipientHandle}` : "recipient"}</strong> on{" "}
            {transfer.destinationLabel}
          </p>
          <p className="muted">
            Route: Stellar USDC ↓ Circle CCTP ↓ {transfer.destinationLabel} USDC · to {abbreviate(transfer.destinationAddress)}
          </p>
          {transfer.lastError && transfer.status !== "completed" && <p className="muted">{transfer.lastError}</p>}
          {!done && transfer.status === "draft" && (
            <button type="button" onClick={handleApproveAndBurn} disabled={busy === "burn"}>
              {busy === "burn" ? "Waiting for Freighter…" : "Sign burn with Freighter"}
            </button>
          )}
          {!done && transfer.status !== "draft" && (
            <button type="button" onClick={handleRefresh} disabled={busy === "refresh"}>
              {busy === "refresh" ? "Checking…" : "Check status"}
            </button>
          )}
          {done && (
            <>
              <p>
                <strong>
                  {transfer.amount} USDC sent to {send?.recipientHandle ? `@${send.recipientHandle}` : "recipient"}
                </strong>{" "}
                · Stellar → {transfer.destinationLabel} · Testnet
              </p>
              <p className="muted">
                {transfer.sourceTxHash && <a href={`https://stellar.expert/explorer/testnet/tx/${transfer.sourceTxHash}`} target="_blank" rel="noreferrer">View source</a>}
                {transfer.destinationTxHash && (
                  <>
                    {" · "}
                    <a
                      href={`${destinations.find((d) => d.key === transfer.destinationNetwork)?.explorerTx ?? ""}${transfer.destinationTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View destination
                    </a>
                  </>
                )}
              </p>
            </>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h2>Recent cross-chain sends</h2>
          {history.slice(0, 5).map((entry) => (
            <p key={entry.transfer.id} className="muted">
              {entry.transfer.amount} USDC → {entry.recipientHandle ? `@${entry.recipientHandle}` : abbreviate(entry.transfer.destinationAddress)} ·{" "}
              {entry.transfer.destinationLabel} · {entry.transfer.status}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
