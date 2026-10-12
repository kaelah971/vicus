"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Networks } from "@stellar/stellar-sdk";
import * as FreighterApi from "@stellar/freighter-api";
import { ActionTray, SectionHead } from "@/components/vicus-ui";

type SendAsset = { slug: string; code: string; permissioned: boolean };
type Contact = { id: string; displayName: string; handle: string | null };

type Preparation = {
  transferId: string;
  unsignedXdr: string;
  networkLabel: string;
  assetCode: string;
  amount: string;
  senderBalance: string;
  destinationHandle: string | null;
  destinationAddress: string;
  permissioned: boolean;
};

type Transfer = {
  id: string;
  assetCode: string;
  amount: string;
  destinationHandle: string | null;
  destinationAddress: string;
  status: string;
  transactionHash: string | null;
  ledger: number | null;
  failureReason: string | null;
  lastError: string | null;
  confirmedAt: string | null;
};

type ApiResponse = { ok: boolean; message?: string; code?: string };

const EXPLORER_TX = "https://stellar.expert/explorer/public/tx/";

function abbreviate(value: string) {
  return value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function SendRunner({ initialAsset }: { initialAsset: string | null }) {
  const [assets, setAssets] = useState<SendAsset[]>([]);
  const [asset, setAsset] = useState(initialAsset ?? "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/send/assets");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          assets?: SendAsset[];
        }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.assets)) {
          setAssets(payload.assets);
          if (!initialAsset && payload.assets[0]) setAsset(payload.assets[0].slug);
        }
      } catch {
        // Asset list failure surfaces on review instead of blocking render.
      }
      try {
        const response = await fetch("/api/contacts");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          contacts?: Contact[];
        }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.contacts)) {
          setContacts(payload.contacts);
        }
      } catch {
        // Contacts are a convenience; handles work without them.
      }
      try {
        const response = await fetch("/api/send/history");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          transfers?: Transfer[];
        }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.transfers)) {
          setHistory(payload.transfers);
        }
      } catch {
        // History is a convenience; the active transfer drives the flow.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialAsset]);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/send/history");
      const payload = (await response.json().catch(() => null)) as (ApiResponse & {
        transfers?: Transfer[];
      }) | null;
      if (payload?.ok && Array.isArray(payload.transfers)) setHistory(payload.transfers);
    } catch {
      // History is a convenience; the active transfer drives the flow.
    }
  }, []);

  async function post<T>(url: string, body: unknown): Promise<T & ApiResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json().catch(() => ({ ok: false, message: "The send request failed." }))) as T & ApiResponse;
  }

  function fail(message: string) {
    setError(message);
    setNotice("");
    setBusy("");
  }

  async function handleReview(event: FormEvent) {
    event.preventDefault();
    setBusy("review");
    setError("");
    setNotice("Checking the recipient and balances on Stellar Mainnet…");
    const prepared = await post<{ preparation?: Preparation }>("/api/send/prepare", {
      circleSlug: asset,
      handle: recipient,
      amount,
    });
    if (!prepared.ok || !prepared.preparation) {
      fail(prepared.message ?? "The transfer could not be prepared.");
      return;
    }
    setPreparation(prepared.preparation);
    setTransfer(null);
    setBusy("");
    setNotice("Review the details, then sign with Freighter.");
  }

  async function handleSign() {
    if (!preparation) return;
    setBusy("sign");
    setError("");
    setNotice("Waiting for your Freighter signature on Stellar Mainnet…");
    try {
      const signTransaction = (
        FreighterApi as {
          signTransaction?: (
            xdr: string,
            opts?: Record<string, string>,
          ) => Promise<{ signedTxXdr?: string; signedTransaction?: string }>;
        }
      ).signTransaction;
      if (!signTransaction) throw new Error("freighter-unavailable");
      const signed = await signTransaction(preparation.unsignedXdr, {
        networkPassphrase: Networks.PUBLIC,
      });
      const signedXdr = signed.signedTxXdr ?? signed.signedTransaction ?? null;
      if (!signedXdr) throw new Error("freighter-declined");
      setNotice("Submitting to Stellar Mainnet and confirming…");
      const submitted = await post<{ transfer?: Transfer }>("/api/send/submit", {
        transferId: preparation.transferId,
        signedXdr,
      });
      setBusy("");
      if (!submitted.ok || !submitted.transfer) {
        fail(submitted.message ?? "The transfer could not be submitted.");
        return;
      }
      setTransfer(submitted.transfer);
      if (submitted.transfer.status === "confirmed") {
        setNotice("Transfer confirmed on Stellar Mainnet.");
      } else {
        setNotice(submitted.transfer.lastError ?? "The transfer did not confirm.");
      }
      refreshHistory();
    } catch (error) {
      if (error instanceof Error && (error.message === "freighter-declined" || error.message === "freighter-unavailable")) {
        fail("Freighter did not sign. Switch Freighter to Mainnet and approve the payment.");
        return;
      }
      fail("The transfer could not be signed.");
    }
  }

  const activeAsset = assets.find((entry) => entry.slug === asset);

  if (transfer && transfer.status === "confirmed") {
    return (
      <div>
        <SectionHead
          eyebrow="Send"
          title="Transfer confirmed."
          line={`${transfer.amount} ${transfer.assetCode} sent on Stellar Mainnet.`}
        />
        <div className="content-panel">
          <p style={{ fontSize: 28, fontWeight: 700 }}>
            {transfer.amount} {transfer.assetCode}
          </p>
          <p className="control-note">
            sent to {transfer.destinationHandle ? `@${transfer.destinationHandle}` : abbreviate(transfer.destinationAddress)}
            {" · "}Stellar Mainnet
          </p>
        </div>
        <ActionTray
          actions={[
            ...(transfer.transactionHash
              ? [{ key: "tx", label: "View on explorer", href: `${EXPLORER_TX}${transfer.transactionHash}`, tone: "violet" as const, icon: "eye" as const, external: true }]
              : []),
            { key: "again", label: "Send more", href: "/send", tone: "white" as const, icon: "arrow" as const },
          ]}
          layout="grid"
        />
        <p style={{ marginTop: 12 }}>
          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => {
              setTransfer(null);
              setPreparation(null);
              setAmount("");
              setRecipient("");
              setNotice("");
              setError("");
            }}
          >
            Start a new transfer
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionHead
        eyebrow="Send"
        title="Know the person, not the address."
        line="Send a real Stellar asset to a Vicus contact. You sign on Stellar Mainnet — Vicus never holds funds."
      />
      <p className="control-note">STELLAR MAINNET · native payment · no bridge · no conversion</p>

      {!preparation ? (
        <form className="content-panel" onSubmit={handleReview}>
          <label className="field">
            <span>Asset</span>
            <select onChange={(event) => setAsset(event.target.value)} value={asset}>
              {assets.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.code}{entry.permissioned ? " · permissioned" : ""}
                </option>
              ))}
            </select>
          </label>
          {activeAsset?.permissioned ? (
            <p className="field-help">Permissioned transfer — the recipient needs an authorized trustline.</p>
          ) : null}
          <label className="field">
            <span>To (@handle)</span>
            <input
              list="send-contacts"
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="@ada"
              value={recipient}
            />
            <datalist id="send-contacts">
              {contacts
                .filter((contact) => contact.handle)
                .map((contact) => (
                  <option key={contact.id} value={`@${contact.handle}`}>
                    {contact.displayName}
                  </option>
                ))}
            </datalist>
          </label>
          <label className="field">
            <span>Amount</span>
            <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="5" value={amount} />
          </label>
          <p className="field-help">Up to 7 decimals. The recipient must already hold a trustline for this asset — Vicus never creates one for them.</p>
          <p>
            <button className="button button-small" disabled={busy === "review"} type="submit">
              {busy === "review" ? "Checking…" : "Review transfer"}
            </button>
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="control-note">{notice}</p> : null}
        </form>
      ) : (
        <div>
          <div className="content-panel">
            <dl className="mission-meta">
              <div><dt>Amount</dt><dd>{preparation.amount} {preparation.assetCode}</dd></div>
              <div><dt>To</dt><dd>{preparation.destinationHandle ? `@${preparation.destinationHandle}` : abbreviate(preparation.destinationAddress)}</dd></div>
              <div><dt>Network</dt><dd>{preparation.networkLabel}</dd></div>
              <div><dt>Available</dt><dd>{preparation.senderBalance} {preparation.assetCode}</dd></div>
              {preparation.permissioned ? <div><dt>Transfer</dt><dd>Permissioned — recipient eligibility verified onchain</dd></div> : null}
            </dl>
            <p className="control-note">No bridge · No conversion</p>
          </div>
          <p>
            <button className="button button-small" disabled={busy === "sign"} onClick={handleSign} type="button">
              {busy === "sign" ? "Waiting for signature…" : "Sign with Freighter"}
            </button>{" "}
            <button
              className="button button-outline button-small"
              onClick={() => {
                setPreparation(null);
                setError("");
                setNotice("");
              }}
              type="button"
            >
              Back
            </button>
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="control-note">{notice}</p> : null}
          <p className="field-help">Never share a secret key — Freighter signing proves ownership.</p>
        </div>
      )}

      {transfer && transfer.status === "failed" ? (
        <div className="content-panel">
          <p className="form-error">{transfer.lastError ?? "The transfer did not complete."}</p>
          {transfer.transactionHash ? (
            <p className="control-note">
              <a href={`${EXPLORER_TX}${transfer.transactionHash}`} rel="noreferrer" target="_blank">
                Check the transaction hash before retrying
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="content-panel">
          <p className="control-note">Your private transfer history.</p>
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                {entry.amount} {entry.assetCode} → {entry.destinationHandle ? `@${entry.destinationHandle}` : abbreviate(entry.destinationAddress)} · {entry.status}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
