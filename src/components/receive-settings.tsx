"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Endpoint = {
  id: string;
  network: string;
  address: string;
  label: string | null;
  enabled: boolean;
  visibility: "contacts_only" | "public";
  ownershipStatus: "authenticated" | "verified" | "unverified";
};

type ApiResponse = { ok: boolean; message?: string };

function abbreviate(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

const NETWORKS = ["stellar", "base", "ethereum", "solana"] as const;

export function ReceiveSettings() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [stellarWallet, setStellarWallet] = useState<string | null>(null);
  const [network, setNetwork] = useState<string>("base");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/receive-endpoints");
      const payload = (await response.json().catch(() => null)) as (ApiResponse & {
        endpoints?: Endpoint[];
        stellarWallet?: string;
      }) | null;
      if (payload?.ok) {
        if (Array.isArray(payload.endpoints)) setEndpoints(payload.endpoints);
        if (typeof payload.stellarWallet === "string") setStellarWallet(payload.stellarWallet);
      }
    } catch {
      // Settings load on next visit; actions surface their own errors.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/receive-endpoints");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          endpoints?: Endpoint[];
          stellarWallet?: string;
        }) | null;
        if (!cancelled && payload?.ok) {
          if (Array.isArray(payload.endpoints)) setEndpoints(payload.endpoints);
          if (typeof payload.stellarWallet === "string") setStellarWallet(payload.stellarWallet);
        }
      } catch {
        // Settings load on next visit; actions surface their own errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function fail(message: string) {
    setError(message);
    setNotice("");
    setBusy("");
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError("");
    const response = await fetch("/api/receive-endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, address }),
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!payload?.ok) {
      fail(payload?.message ?? "That address could not be added.");
      return;
    }
    setAddress("");
    setBusy("");
    setNotice("Address added. Enable it below to receive — new addresses start disabled.");
    refresh();
  }

  async function handleToggle(endpoint: Endpoint) {
    setBusy(`toggle-${endpoint.id}`);
    setError("");
    const url =
      endpoint.network === "stellar" && endpoint.ownershipStatus === "authenticated"
        ? "/api/receive-endpoints/stellar"
        : `/api/receive-endpoints/${endpoint.id}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !endpoint.enabled }),
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse | null;
    setBusy("");
    if (!payload?.ok) {
      fail(payload?.message ?? "That setting could not be changed.");
      return;
    }
    setNotice(endpoint.enabled ? "Receiving disabled for that address." : "Receiving enabled.");
    refresh();
  }

  async function handleEnableStellar() {
    setBusy("stellar");
    setError("");
    const response = await fetch("/api/receive-endpoints/stellar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse | null;
    setBusy("");
    if (!payload?.ok) {
      fail(payload?.message ?? "The Stellar wallet could not be enabled.");
      return;
    }
    setNotice("Your Stellar wallet can now receive from your contacts.");
    refresh();
  }

  const stellarEntry = endpoints.find((entry) => entry.network === "stellar");

  return (
    <div>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="control-note">{notice}</p> : null}
      <p className="control-note">HOME ★ Stellar — your authenticated wallet. Other networks are linked receive-only endpoints.</p>

      {stellarWallet ? (
        <div className="content-panel">
          <strong>Stellar</strong>{" "}
          <span className="control-note" title={stellarWallet}>{abbreviate(stellarWallet)}</span>{" "}
          <span className="v-chip">Authenticated</span>
          {stellarEntry?.enabled ? (
            <span className="control-note"> · Enabled for {stellarEntry.visibility === "public" ? "public" : "contacts"}</span>
          ) : null}
          <p>
            {stellarEntry?.enabled ? (
              <button className="button button-outline button-small" disabled={busy === `toggle-${stellarEntry.id}`} onClick={() => handleToggle(stellarEntry)} type="button">
                Disable receiving
              </button>
            ) : (
              <button className="button button-small" disabled={busy === "stellar"} onClick={handleEnableStellar} type="button">
                {busy === "stellar" ? "Enabling…" : "Enable for contacts"}
              </button>
            )}
          </p>
        </div>
      ) : null}

      {NETWORKS.filter((value) => value !== "stellar").map((value) => {
        const entry = endpoints.find((endpoint) => endpoint.network === value);
        return (
          <div className="content-panel" key={value}>
            <strong style={{ textTransform: "capitalize" }}>{value}</strong>{" "}
            {entry ? (
              <>
                <span className="control-note" title={entry.address}>{abbreviate(entry.address)}</span>{" "}
                <span className="v-chip">Unverified address</span>
                <p>
                  <button
                    className={entry.enabled ? "button button-outline button-small" : "button button-small"}
                    disabled={busy === `toggle-${entry.id}`}
                    onClick={() => handleToggle(entry)}
                    type="button"
                  >
                    {entry.enabled ? "Disable" : "Enable"}
                  </button>
                </p>
              </>
            ) : (
              <span className="control-note">No receive address</span>
            )}
          </div>
        );
      })}

      <div className="content-panel">
        <h3>Add a receive address</h3>
        <form onSubmit={handleAdd}>
          <label className="field">
            <span>Network</span>
            <select onChange={(event) => setNetwork(event.target.value)} value={network}>
              <option value="base">Base</option>
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
            </select>
          </label>
          <label className="field">
            <span>Address</span>
            <input onChange={(event) => setAddress(event.target.value)} value={address} placeholder="0x… / wallet address" />
          </label>
          <p className="field-help">Manual addresses stay unverified until real wallet-signature verification exists.</p>
          <p>
            <button className="button button-small" disabled={busy === "add"} type="submit">
              {busy === "add" ? "Adding…" : "Add"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
