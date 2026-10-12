"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { xdr as StellarXdr } from "@stellar/stellar-sdk";
import * as FreighterApi from "@stellar/freighter-api";
import { ActionTray, SectionHead, StepFlow } from "@/components/vicus-ui";

type DestinationOption = {
  key: string;
  label: string;
  domain: number;
  executable: boolean;
  unavailableReason: string | null;
  forwardingSupported: boolean;
  explorerTx: string;
};

type AccessConfig = {
  sourceNetwork: string;
  sourceLabel: string;
  homeLabel: string;
  asset: string;
  environment: string;
  stellarDomain: number;
  protocolNote: string;
  destinations: DestinationOption[];
};

type Transfer = {
  id: string;
  sourceNetwork: string;
  sourceWallet: string;
  destinationNetwork: string;
  destinationLabel: string;
  destinationDomain: number;
  asset: string;
  amount: string;
  amountSubunits6: string;
  destinationAddress: string;
  status: string;
  environment: string;
  forwarding: boolean;
  sourceTxHash: string | null;
  destinationTxHash: string | null;
  fee: string | null;
  expectedDestinationAmount: string;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Preparation = {
  transferId: string;
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
  sourceWallet: string;
  asset: string;
  amount: string;
  amountSubunits6: string;
  burnSubunits7: string;
  destinationNetwork: string;
  destinationDomain: number;
  sourceDomain: number;
  mintRecipientBytes32: string;
  usdcSac: string;
  tokenMessengerMinter: string;
  hookData: string;
  finalityThreshold: number;
  maxFeeSubunits7: string;
};

type ApiResponse = { ok: boolean; message?: string; code?: string };

const STELLAR_EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";

function abbreviate(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function stepState(status: string, done: string[], active: string[]) {
  if (done.includes(status)) return "done" as const;
  if (active.includes(status)) return "active" as const;
  return "todo" as const;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function AccessRunner() {
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [destination, setDestination] = useState("base");
  const [amount, setAmount] = useState("1");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/access/config");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          config?: AccessConfig;
        }) | null;
        if (!cancelled && payload?.ok && payload.config) setConfig(payload.config);
      } catch {
        // Config failure surfaces on first action instead of blocking render.
      }
      try {
        const response = await fetch("/api/access/transfers");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          transfers?: Transfer[];
        }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.transfers)) {
          setHistory(payload.transfers);
          const active = payload.transfers.find((entry) => entry.status !== "completed" && entry.status !== "failed");
          if (active) setTransfer(active);
        }
      } catch {
        // History is a convenience; the active transfer drives the flow.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh resumes the same transfer after reload: poll while in flight.
  // The effect depends on the transfer identity primitives, not the object —
  // a new object identity on every status update must not reset the cadence.
  const pollId = transfer?.id;
  const pollHash = transfer?.sourceTxHash;
  const pollStatus = transfer?.status;
  useEffect(() => {
    if (!pollId || pollStatus === "completed" || pollStatus === "failed") return;
    if (!pollHash) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled || attempts >= 40) return;
      attempts += 1;
      try {
        const response = await fetch(`/api/access/transfers/${pollId}/refresh`, { method: "POST" });
        const payload = (await response.json().catch(() => null)) as (ApiResponse & { transfer?: Transfer }) | null;
        if (!cancelled && payload?.ok && payload.transfer) {
          setTransfer(payload.transfer);
          setHistory((prev) => prev.map((entry) => (entry.id === payload.transfer!.id ? payload.transfer! : entry)));
        }
      } catch {
        // Retryable by design; the next tick tries again.
      }
      if (!cancelled) setTimeout(tick, 8000);
    };
    const timer = setTimeout(tick, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollId, pollHash, pollStatus]);

  async function post<T>(url: string, body?: unknown): Promise<T & ApiResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await response.json().catch(() => ({ ok: false, message: "The Access request failed." }))) as T & ApiResponse;
  }

  function fail(message: string) {
    setError(message);
    setNotice("");
    setBusy("");
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("Starting your transfer…");
    const created = await post<{ transfer?: Transfer }>("/api/access/transfers", {
      destinationNetwork: destination,
      destinationAddress: address,
      amount,
    });
    if (!created.ok || !created.transfer) {
      fail(created.message ?? "The transfer could not be started.");
      return;
    }
    setTransfer(created.transfer);
    setHistory((prev) => [created.transfer!, ...prev.filter((entry) => entry.id !== created.transfer!.id)]);
    setBusy("");
    setNotice("Review the plan, then approve it in Freighter.");
  }

  async function signWithFreighter(unsignedXdr: string, passphrase: string): Promise<string | null> {
    try {
      const signTransaction = (
        FreighterApi as {
          signTransaction?: (
            xdr: string,
            opts?: Record<string, string>,
          ) => Promise<{ signedTxXdr?: string; signedTransaction?: string }>;
        }
      ).signTransaction;
      if (!signTransaction) return null;
      const signed = await signTransaction(unsignedXdr, { networkPassphrase: passphrase });
      return signed.signedTxXdr ?? signed.signedTransaction ?? null;
    } catch {
      return null;
    }
  }

  async function handleApproveAndBurn() {
    if (!transfer) return;
    setBusy("burn");
    setError("");
    const prepared = await post<{ preparation?: Preparation }>(`/api/access/transfers/${transfer.id}/prepare`);
    if (!prepared.ok || !prepared.preparation) {
      fail(prepared.message ?? "The burn could not be prepared.");
      return;
    }
    const plan = prepared.preparation;
    setNotice("Approve the USDC allowance in Freighter…");
    try {
      const sdk = await import("@stellar/stellar-sdk");
      const server = new sdk.rpc.Server(plan.rpcUrl);
      const fromScVal = new sdk.Address(plan.sourceWallet).toScVal();
      const minterScVal = new sdk.Address(plan.tokenMessengerMinter).toScVal();
      const usdcScVal = new sdk.Address(plan.usdcSac).toScVal();
      const latestLedger = await server.getLatestLedger();
      const expirationLedger = latestLedger.sequence + 100_000;

      const buildAndSign = async (contractId: string, method: string, args: StellarXdr.ScVal[]) => {
        const account = await server.getAccount(plan.sourceWallet);
        const contract = new sdk.Contract(contractId);
        const tx = new sdk.TransactionBuilder(account, {
          fee: "10000000",
          networkPassphrase: plan.networkPassphrase,
        })
          .addOperation(contract.call(method, ...args))
          .setTimeout(120)
          .build();
        const simulated = await server.simulateTransaction(tx);
        if (sdk.rpc.Api.isSimulationError(simulated)) {
          throw new Error(`Simulation failed: ${JSON.stringify(simulated)}`);
        }
        const assembled = sdk.rpc.assembleTransaction(tx, simulated).build();
        const signedXdr = await signWithFreighter(assembled.toXDR(), plan.networkPassphrase);
        if (!signedXdr) throw new Error("freighter-declined");
        return signedXdr;
      };

      // Step 1: SAC allowance approval (user signs, Freighter holds the secret).
      await buildAndSign(plan.usdcSac, "approve", [
        fromScVal,
        minterScVal,
        sdk.nativeToScVal(BigInt(plan.burnSubunits7), { type: "i128" }),
        sdk.nativeToScVal(expirationLedger, { type: "u32" }),
      ]);

      setNotice("Sign the burn in Freighter…");
      // Step 2: deposit_for_burn_with_hook with the Circle forwarding hook.
      const burnSignedXdr = await buildAndSign(plan.tokenMessengerMinter, "deposit_for_burn_with_hook", [
        fromScVal,
        sdk.nativeToScVal(BigInt(plan.burnSubunits7), { type: "i128" }),
        sdk.nativeToScVal(plan.destinationDomain, { type: "u32" }),
        sdk.xdr.ScVal.scvBytes(Buffer.from(hexToBytes(plan.mintRecipientBytes32))),
        usdcScVal,
        sdk.xdr.ScVal.scvBytes(Buffer.alloc(32)),
        sdk.nativeToScVal(BigInt(plan.maxFeeSubunits7), { type: "i128" }),
        sdk.nativeToScVal(plan.finalityThreshold, { type: "u32" }),
        sdk.xdr.ScVal.scvBytes(Buffer.from(hexToBytes(plan.hookData))),
      ]);

      setNotice("Submitting the burn to Stellar…");
      const parsed = sdk.TransactionBuilder.fromXDR(burnSignedXdr, plan.networkPassphrase);
      const sendResult = await server.sendTransaction(parsed as never);
      if ((sendResult as { status: string }).status === "ERROR") {
        throw new Error(`Send failed: ${JSON.stringify(sendResult)}`);
      }
      const burnHash = (sendResult as { hash: string }).hash;
      let getResult = await server.getTransaction(burnHash);
      while (getResult.status === "NOT_FOUND") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        getResult = await server.getTransaction(burnHash);
      }
      if (getResult.status !== "SUCCESS") {
        throw new Error("The burn transaction did not succeed on Stellar.");
      }

      const attached = await post<{ transfer?: Transfer }>(`/api/access/transfers/${transfer.id}/burn`, {
        sourceTxHash: burnHash,
        signedXdr: burnSignedXdr,
        network: plan.network,
      });
      setBusy("");
      if (!attached.ok || !attached.transfer) {
        fail(attached.message ?? "The burn could not be recorded.");
        return;
      }
      setTransfer(attached.transfer);
      setNotice("Burn confirmed. Waiting for Circle attestation…");
    } catch (error) {
      if (error instanceof Error && error.message === "freighter-declined") {
        fail("Freighter did not sign. Switch Freighter to Testnet and approve the request.");
        return;
      }
      fail(error instanceof Error ? error.message : "The burn could not complete.");
    }
  }

  const handleRefresh = useCallback(async () => {
    if (!transfer) return;
    setBusy("refresh");
    setError("");
    const refreshed = await post<{ transfer?: Transfer }>(`/api/access/transfers/${transfer.id}/refresh`);
    setBusy("");
    if (!refreshed.ok || !refreshed.transfer) {
      fail(refreshed.message ?? "Status could not be refreshed.");
      return;
    }
    setTransfer(refreshed.transfer);
  }, [transfer]);

  const status = transfer?.status ?? "draft";
  const executable = (config?.destinations ?? []).filter((entry) => entry.executable);
  const coming = (config?.destinations ?? []).filter((entry) => !entry.executable);
  const activeDestination = executable.find((entry) => entry.key === transfer?.destinationNetwork);

  const steps = [
    { label: "Plan", icon: "book" as const, line: "Amount and destination.", state: stepState(status, ["approving", "burn_pending", "burned", "attesting", "forwarding", "completed"], ["draft"]) },
    { label: "Burn", icon: "send" as const, line: "Sign on Stellar.", state: stepState(status, ["burned", "attesting", "forwarding", "completed"], ["approving", "burn_pending"]) },
    { label: "Attest", icon: "shield" as const, line: "Circle signs the burn.", state: stepState(status, ["forwarding", "completed"], ["burned", "attesting"]) },
    { label: "Arrive", icon: "coins" as const, line: "USDC lands.", state: stepState(status, ["completed"], ["forwarding"]) },
  ];

  if (transfer && status === "completed") {
    return (
      <div>
        <SectionHead
          eyebrow="Access from Stellar"
          title="USDC arrived."
          line={`Stellar → ${transfer.destinationLabel}, native USDC via Circle CCTP.`}
        />
        <div className="content-panel">
          <p className="control-note">Home · Stellar</p>
          <p style={{ fontSize: 28, fontWeight: 700 }}>
            {transfer.expectedDestinationAmount} USDC
          </p>
          <p className="control-note">
            Stellar → {transfer.destinationLabel} · {transfer.amount} USDC sent
            {transfer.fee ? ` · ${transfer.fee} USDC service fee` : ""}
          </p>
        </div>
        <ActionTray
          actions={[
            ...(transfer.sourceTxHash
              ? [{ key: "source", label: "View source", href: `${STELLAR_EXPLORER_TX}${transfer.sourceTxHash}`, tone: "violet" as const, icon: "eye" as const, external: true }]
              : []),
            ...(transfer.destinationTxHash && activeDestination
              ? [{ key: "dest", label: "View destination", href: `${activeDestination.explorerTx}${transfer.destinationTxHash}`, tone: "green" as const, icon: "eye" as const, external: true }]
              : []),
            { key: "again", label: "Move more USDC", href: "/access", tone: "white" as const, icon: "arrow" as const },
          ]}
          layout="grid"
        />
        <p style={{ marginTop: 12 }}>
          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => {
              setTransfer(null);
              setAmount("1");
              setAddress("");
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
        eyebrow="Access from Stellar"
        title="One Stellar home. Tokenized assets everywhere."
        line="Move native USDC from Stellar to other networks with Circle CCTP. You sign on Stellar — Circle forwards the arrival."
      />
      <p className="control-note">
        Home · Stellar ({config?.sourceLabel ?? "Stellar Testnet"}) · Access ·{" "}
        {executable.map((entry) => entry.label).join(" · ") || "…"}
        {coming.length > 0 ? ` · ${coming.map((entry) => `${entry.label} (soon)`).join(" · ")}` : ""}
      </p>

      {!transfer || status === "draft" ? (
        <form className="content-panel" onSubmit={handleCreate}>
          <label className="field">
            <span>To</span>
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              {executable.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label} (Testnet)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Amount (USDC, up to 6 decimals)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1.00"
              value={amount}
            />
          </label>
          <p className="field-help">Stellar shows 7 decimals; CCTP settles in 6. Extra digits stay on Stellar.</p>
          <label className="field">
            <span>Destination address</span>
            <input
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x…"
              value={address}
            />
          </label>
          {coming.length > 0 ? (
            <p className="field-help">
              {coming.map((entry) => `${entry.label}: ${entry.unavailableReason}`).join(" ")}
            </p>
          ) : null}
          <p>
            <button className="button button-small" disabled={busy === "create"} type="submit">
              {busy === "create" ? "Starting…" : "Review transfer"}
            </button>
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="control-note">{notice}</p> : null}
        </form>
      ) : null}

      {!transfer && history.length > 0 ? (
        <div className="content-panel">
          <p className="control-note">Recent transfers — resume tracking any time.</p>
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  className="button button-outline button-small"
                  onClick={() => {
                    setTransfer(entry);
                    setError("");
                    setNotice(entry.status === "completed" ? "" : "Tracking resumed.");
                  }}
                  type="button"
                >
                  {entry.amount} USDC → {entry.destinationLabel} · {entry.status}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {transfer && status !== "draft" ? (
        <div>
          <StepFlow label="Transfer progress" steps={steps} variant="row" />
          <div className="content-panel">
            <dl className="mission-meta">
              <div><dt>From</dt><dd>Stellar ({transfer.environment === "testnet" ? "Testnet" : transfer.environment})</dd></div>
              <div><dt>Asset</dt><dd>{transfer.asset} · Native USDC via Circle CCTP</dd></div>
              <div><dt>To</dt><dd>{transfer.destinationLabel} (Testnet)</dd></div>
              <div><dt>Amount sent</dt><dd>{transfer.amount} USDC</dd></div>
              <div><dt>Service fee</dt><dd>{transfer.fee ? `${transfer.fee} USDC` : "Quoted by Circle during tracking"}</dd></div>
              <div><dt>Expected arrival</dt><dd>{transfer.expectedDestinationAmount} USDC</dd></div>
              <div><dt>Destination</dt><dd title={transfer.destinationAddress}>{abbreviate(transfer.destinationAddress)}</dd></div>
              <div>
                <dt>Status</dt>
                <dd>
                  {status === "burn_pending" || status === "approving" ? "Waiting for your Freighter signature" : null}
                  {status === "burned" ? "Burn confirmed on Stellar" : null}
                  {status === "attesting" ? "Waiting for Circle attestation" : null}
                  {status === "forwarding" ? "Circle is forwarding to the destination" : null}
                  {transfer.retryable && transfer.lastError ? ` · ${transfer.lastError}` : ""}
                </dd>
              </div>
            </dl>
            <div aria-hidden="true" className="control-note">
              STELLAR {status === "burned" || status === "attesting" || status === "forwarding" || status === "completed" ? "●" : "○"} Burn confirmed
              {" ↓ "}CIRCLE {status === "forwarding" || status === "completed" ? "●" : "○"} Attestation ready
              {" ↓ "}{transfer.destinationLabel.toUpperCase()} {status === "completed" ? "●" : "○"} Minting
            </div>
            {transfer.sourceTxHash ? (
              <p className="control-note">
                <a href={`${STELLAR_EXPLORER_TX}${transfer.sourceTxHash}`} rel="noreferrer" target="_blank">
                  View source transaction
                </a>
              </p>
            ) : null}
          </div>
          {!transfer.sourceTxHash ? (
            <p>
              <button className="button button-small" disabled={busy === "burn"} onClick={handleApproveAndBurn} type="button">
                {busy === "burn" ? "Waiting for signature…" : "Approve on Stellar"}
              </button>
            </p>
          ) : (
            <p>
              <button className="button button-outline button-small" disabled={busy === "refresh"} onClick={handleRefresh} type="button">
                {busy === "refresh" ? "Checking…" : "Check status"}
              </button>
            </p>
          )}
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="control-note">{notice}</p> : null}
          <p className="field-help">Never share a secret key — Freighter signing proves ownership.</p>
        </div>
      ) : null}
    </div>
  );
}
