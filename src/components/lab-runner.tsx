"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { Networks } from "@stellar/stellar-sdk";
import * as FreighterApi from "@stellar/freighter-api";
import { ASSET_CLASSES, ActionTray, Chip, SectionHead, StepFlow } from "@/components/vicus-ui";

const LAB_EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";

type LabRun = {
  id: string;
  assetName: string;
  assetCode: string;
  assetClass: string;
  representation: string;
  initialAmount: string;
  issuerPublicKey: string;
  holderPublicKey: string;
  status: string;
  trustlineTxHash: string | null;
  issuanceTxHash: string | null;
  ledger: number | null;
  issuedAt: string | null;
  contractId: string | null;
};

type ApiResponse = { ok: boolean; message?: string; code?: string };

function abbreviate(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function stepState(status: string, done: string[], active: string[]) {
  if (done.includes(status)) return "done" as const;
  if (active.includes(status)) return "active" as const;
  return "todo" as const;
}

export function LabRunner() {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [run, setRun] = useState<LabRun | null>(null);
  const [assetName, setAssetName] = useState("");
  const [assetCode, setAssetCode] = useState("");
  const [assetClass, setAssetClass] = useState("stablecoin");
  const [representation, setRepresentation] = useState("");
  const [initialAmount, setInitialAmount] = useState("1000");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const refreshRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/lab/runs");
      const payload = (await response.json().catch(() => null)) as (ApiResponse & { runs?: LabRun[] }) | null;
      if (payload?.ok && Array.isArray(payload.runs)) {
        setRuns(payload.runs);
        setHistoryLoaded(true);
      }
    } catch {
      // History is a convenience; the active run drives the flow.
    }
  }, []);

  async function handleLoadHistory() {
    await refreshRuns();
  }

  async function post<T>(url: string, body?: unknown): Promise<T & ApiResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await response.json().catch(() => ({ ok: false, message: "The Lab request failed." }))) as T & ApiResponse;
  }

  function fail(message: string) {
    setError(message);
    setNotice("");
    setBusy("");
  }

  async function handleDetectWallet() {
    setError("");
    try {
      const getAddress = (FreighterApi as { getAddress?: () => Promise<{ address?: string }> }).getAddress;
      if (!getAddress) {
        fail("Freighter is not available in this browser.");
        return;
      }
      const { address } = await getAddress();
      if (address) setHolder(address);
      else fail("No Freighter address found. Switch Freighter to a Testnet account.");
    } catch {
      fail("Freighter is not available in this browser.");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("define");
    setError("");
    setNotice("");
    const payload = await post<{ run?: LabRun }>("/api/lab/runs", {
      assetName,
      assetCode,
      assetClass,
      representation,
      initialAmount,
      holderPublicKey: holder.trim(),
    });
    if (!payload.ok || !payload.run) {
      fail(payload.message ?? "The Lab run could not be created.");
      return;
    }
    setRun(payload.run);
    setBusy("");
    setNotice("Draft recorded. Fund the Testnet holder, then establish the trustline.");
    refreshRuns();
  }

  async function handleFund() {
    if (!run) return;
    setBusy("fund");
    setError("");
    const payload = await post<{ funded?: boolean; alreadyFunded?: boolean }>(
      `/api/lab/runs/${run.id}/fund`,
    );
    setBusy("");
    if (!payload.ok) {
      fail(payload.message ?? "Testnet funding failed.");
      return;
    }
    setNotice(
      payload.funded
        ? "Test wallet funded on Testnet. Continue to the trustline."
        : "That account already holds Testnet funds. Continue to the trustline.",
    );
  }

  async function handleTrust() {
    if (!run) return;
    setBusy("trust");
    setError("");
    setNotice("Preparing the Testnet trustline for your signature…");
    const prepared = await post<{ xdr?: string }>(`/api/lab/runs/${run.id}/trustline/prepare`, {
      holderPublicKey: run.holderPublicKey,
    });
    if (!prepared.ok || !prepared.xdr) {
      fail(prepared.message ?? "The trustline could not be prepared.");
      return;
    }
    let signedXdr: string | null = null;
    try {
      const signTransaction = (
        FreighterApi as {
          signTransaction?: (
            xdr: string,
            opts?: Record<string, string>,
          ) => Promise<{ signedTxXdr?: string; signedTransaction?: string }>;
        }
      ).signTransaction;
      if (!signTransaction) throw new Error("unavailable");
      const signed = await signTransaction(prepared.xdr, { networkPassphrase: Networks.TESTNET });
      signedXdr = signed.signedTxXdr ?? signed.signedTransaction ?? null;
    } catch {
      fail("Freighter did not sign. Switch Freighter to Testnet and approve the ChangeTrust.");
      return;
    }
    if (!signedXdr) {
      fail("Freighter returned no signed transaction.");
      return;
    }
    setNotice("Submitting the signed trustline to Stellar Testnet…");
    const submitted = await post<{ run?: LabRun }>(`/api/lab/runs/${run.id}/submit`, { signedXdr });
    setBusy("");
    if (!submitted.ok || !submitted.run) {
      fail(submitted.message ?? "The trustline could not be confirmed.");
      return;
    }
    setRun(submitted.run);
    setNotice("Trustline confirmed on Testnet. Ready to issue.");
    refreshRuns();
  }

  async function handleIssue() {
    if (!run) return;
    setBusy("issue");
    setError("");
    setNotice("Issuing from the Lab issuer and verifying on Testnet…");
    const payload = await post<{ run?: LabRun }>(`/api/lab/runs/${run.id}/issue`);
    setBusy("");
    if (!payload.ok || !payload.run) {
      fail(payload.message ?? "Issuance could not complete.");
      return;
    }
    setRun(payload.run);
    setNotice("Issuance verified on Testnet.");
    refreshRuns();
  }

  const status = run?.status ?? "draft";
  const steps = [
    { label: "Define", icon: "book" as const, line: "Name, code, class.", state: stepState(status, ["trustline_pending", "trustline_confirmed", "issuing", "issued"], ["draft"]) },
    { label: "Trust", icon: "shield" as const, line: "Sign the trustline.", state: stepState(status, ["trustline_confirmed", "issuing", "issued"], ["trustline_pending"]) },
    { label: "Issue", icon: "send" as const, line: "Issuer sends units.", state: stepState(status, ["issued"], ["trustline_confirmed", "issuing"]) },
    { label: "Verify", icon: "eye" as const, line: "Confirmed onchain.", state: stepState(status, ["issued"], ["issuing", "trustline_confirmed"]) },
    { label: "Your asset", icon: "coins" as const, line: "Inspect the result.", state: stepState(status, ["issued"], []) },
  ];

  if (run && status === "issued") {
    return (
      <div>
        <SectionHead
          eyebrow="Tokenization Lab"
          title="You tokenized an asset on Stellar."
          line="A real demo asset, issued on Stellar Testnet and verified onchain."
        />
        <div className="content-panel">
          <dl className="mission-meta">
            <div><dt>Asset name</dt><dd>{run.assetName}</dd></div>
            <div><dt>Asset code</dt><dd>{run.assetCode}</dd></div>
            <div><dt>Asset class</dt><dd>{ASSET_CLASSES.find((entry) => entry.value === run.assetClass)?.label ?? run.assetClass}</dd></div>
            <div><dt>Network</dt><dd>Stellar Testnet</dd></div>
            <div><dt>Issuer</dt><dd title={run.issuerPublicKey}>{abbreviate(run.issuerPublicKey)}</dd></div>
            <div><dt>Holder</dt><dd title={run.holderPublicKey}>{abbreviate(run.holderPublicKey)}</dd></div>
            <div><dt>Initial issuance</dt><dd>{run.initialAmount} {run.assetCode}</dd></div>
            <div><dt>Trustline</dt><dd>Confirmed</dd></div>
            <div><dt>Issuance</dt><dd>Confirmed</dd></div>
            {run.contractId ? (
              <div><dt>Smart-contract representation</dt><dd title={run.contractId}>{abbreviate(run.contractId)}</dd></div>
            ) : null}
          </dl>
          <p className="control-note">
            A technical demonstration on Testnet. Legal ownership, reserves, custody, compliance,
            redemption, and real-world rights require separate arrangements.
          </p>
        </div>
        <ActionTray
          actions={[
            ...(run.issuanceTxHash
              ? [{ key: "tx", label: "View transaction", href: `${LAB_EXPLORER_TX}${run.issuanceTxHash}`, tone: "violet" as const, icon: "eye" as const, external: true }]
              : []),
            { key: "again", label: "Create another", href: "/lab", tone: "white" as const, icon: "arrow" as const },
          ]}
          layout="grid"
        />
        <p style={{ marginTop: 12 }}>
          <button className="button button-outline button-small" type="button" onClick={() => { setRun(null); setNotice(""); setError(""); }}>
            Start a new run
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionHead
        eyebrow="Tokenization Lab"
        title="Learn tokenization by doing it."
        line="Define a demo asset, sign a real trustline, receive a real Testnet issuance."
      />
      <StepFlow label="Lab progress" steps={steps} variant="row" />

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="control-note" role="status">{notice}</p> : null}

      {!run ? (
        <form className="mission-create-form" onSubmit={handleCreate}>
          <div className="field-group">
            <label htmlFor="lab-name">Asset name</label>
            <input id="lab-name" value={assetName} onChange={(event) => setAssetName(event.target.value)} required maxLength={120} placeholder="Demo Treasury Note" />
          </div>
          <div className="field-group">
            <label htmlFor="lab-code">Asset code · 1–12 letters/digits</label>
            <input id="lab-code" value={assetCode} onChange={(event) => setAssetCode(event.target.value.toUpperCase())} required maxLength={12} pattern="[A-Za-z0-9]{1,12}" placeholder="DEMO" autoComplete="off" spellCheck={false} />
          </div>
          <div className="field-group">
            <label htmlFor="lab-class">Asset class</label>
            <select id="lab-class" value={assetClass} onChange={(event) => setAssetClass(event.target.value)}>
              {ASSET_CLASSES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
            <p className="field-help">A category, not legal rights. Reserves, custody, and redemption need separate arrangements — stablecoin demos imply no reserves.</p>
          </div>
          <div className="field-group">
            <label htmlFor="lab-representation">What the asset represents</label>
            <textarea id="lab-representation" value={representation} onChange={(event) => setRepresentation(event.target.value)} required rows={2} maxLength={2000} placeholder="A classroom demo of a treasury position." />
          </div>
          <div className="field-group">
            <label htmlFor="lab-amount">Initial issuance · NOT max supply</label>
            <input id="lab-amount" value={initialAmount} onChange={(event) => setInitialAmount(event.target.value)} required inputMode="decimal" placeholder="1000" />
            <p className="field-help">Classic Stellar issuance does not encode a permanent fixed maximum.</p>
          </div>
          <div className="field-group">
            <label htmlFor="lab-holder">Testnet holder address</label>
            <input id="lab-holder" value={holder} onChange={(event) => setHolder(event.target.value)} required maxLength={56} placeholder="G…" autoComplete="off" spellCheck={false} />
            <p className="field-help">A dedicated Freighter Testnet account. Never share a secret key — signing proves ownership.</p>
            <p><button className="button button-outline button-small" type="button" onClick={handleDetectWallet}>Use Freighter address</button></p>
          </div>
          <button className="primary-action" disabled={busy === "define"} type="submit">
            {busy === "define" ? "Recording…" : "01 · Define asset"}
          </button>
        </form>
      ) : (
        <div className="content-panel">
          <p><strong>{run.assetName}</strong> · {run.assetCode} <Chip tone="violet">{run.status.replaceAll("_", " ")}</Chip></p>
          <p className="control-note">Holder {abbreviate(run.holderPublicKey)} · {run.initialAmount} {run.assetCode} · Stellar Testnet</p>

          {status === "draft" || status === "trustline_pending" ? (
            <div>
              <p className="field-help">Trustline — allows this Stellar account to hold the issued asset.</p>
              <p>
                <button className="button button-outline button-small" type="button" onClick={handleFund} disabled={busy === "fund"}>
                  {busy === "fund" ? "Funding…" : "Fund test wallet"}
                </button>{" "}
                <span className="control-note">Optional · Testnet Friendbot · your call.</span>
              </p>
              <p>
                <button className="primary-action" type="button" onClick={handleTrust} disabled={busy === "trust"}>
                  {busy === "trust" ? "Waiting for signature…" : "02 · Sign trustline in Freighter"}
                </button>
              </p>
            </div>
          ) : null}

          {status === "trustline_confirmed" || status === "issuing" ? (
            <div>
              <p className="field-help">Issuance — the issuer sends units of the asset into circulation.</p>
              <p>
                <button className="primary-action" type="button" onClick={handleIssue} disabled={busy === "issue"}>
                  {busy === "issue" ? "Issuing…" : "03 · Issue from Lab issuer"}
                </button>
              </p>
              <p className="field-help">Verification — Vicus confirms the result directly from Stellar.</p>
            </div>
          ) : null}

          {run.trustlineTxHash ? (
            <p className="control-note">
              Trustline: <Link href={`${LAB_EXPLORER_TX}${run.trustlineTxHash}`} target="_blank" rel="noreferrer">view transaction</Link>
            </p>
          ) : null}
        </div>
      )}

      {runs.length > 0 || !historyLoaded ? (
        <div style={{ marginTop: 16 }}>
          <p className="field-label">Your Lab runs</p>
          {!historyLoaded ? (
            <p><button className="button button-outline button-small" type="button" onClick={handleLoadHistory}>Show my runs</button></p>
          ) : null}
          <ul>
            {runs.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="mission-action-link" onClick={() => { setRun(entry); setError(""); setNotice(""); }}>
                  {entry.assetName} · {entry.assetCode}
                </button>{" "}
                <span className="control-note">{entry.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
