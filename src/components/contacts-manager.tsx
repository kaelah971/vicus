"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { SectionHead } from "@/components/vicus-ui";

type Endpoint = {
  id: string;
  network: string;
  address: string;
  label: string | null;
  verifiedSource: string | null;
};

type Contact = {
  id: string;
  displayName: string;
  handle: string | null;
  linkedUserId: string | null;
  source: "vicus_user" | "manual";
  note: string | null;
  endpoints: Endpoint[];
};

type ApiResponse = { ok: boolean; message?: string };

function abbreviate(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function ContactsManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [network, setNetwork] = useState("stellar");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts");
      const payload = (await response.json().catch(() => null)) as (ApiResponse & {
        contacts?: Contact[];
      }) | null;
      if (payload?.ok && Array.isArray(payload.contacts)) setContacts(payload.contacts);
    } catch {
      // List loads on next visit; actions surface their own errors.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/contacts");
        const payload = (await response.json().catch(() => null)) as (ApiResponse & {
          contacts?: Contact[];
        }) | null;
        if (!cancelled && payload?.ok && Array.isArray(payload.contacts)) setContacts(payload.contacts);
      } catch {
        // List loads on next visit; actions surface their own errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(url: string, body: unknown, method = "POST") {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json().catch(() => ({ ok: false }))) as ApiResponse & {
      contact?: Contact;
    };
  }

  function fail(message: string) {
    setError(message);
    setNotice("");
    setBusy("");
  }

  async function handleSaveUser(event: FormEvent) {
    event.preventDefault();
    setBusy("user");
    setError("");
    const created = await post("/api/contacts", { handle });
    if (!created.ok || !created.contact) {
      fail(created.message ?? "That person could not be saved.");
      return;
    }
    setHandle("");
    setBusy("");
    setNotice(`${created.contact.displayName} saved to your contacts.`);
    refresh();
  }

  async function handleSaveManual(event: FormEvent) {
    event.preventDefault();
    setBusy("manual");
    setError("");
    const created = await post("/api/contacts", {
      displayName: name,
      network: address.trim() ? network : undefined,
      address: address.trim() ? address : undefined,
    });
    if (!created.ok || !created.contact) {
      fail(created.message ?? "That contact could not be saved.");
      return;
    }
    setName("");
    setAddress("");
    setBusy("");
    setNotice(`${created.contact.displayName} saved. Manual addresses stay unverified.`);
    refresh();
  }

  async function handleRemove(id: string, displayName: string) {
    setBusy(`remove-${id}`);
    setError("");
    const response = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as ApiResponse | null;
    setBusy("");
    if (!payload?.ok) {
      fail(payload?.message ?? "That contact could not be removed.");
      return;
    }
    setNotice(`${displayName} removed.`);
    refresh();
  }

  return (
    <div>
      <SectionHead
        eyebrow="Contacts"
        title="People, ready when transfers are."
        line="Save Vicus users or manual wallets. Contacts stay private — only you see this list."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="control-note">{notice}</p> : null}

      <div className="content-panel">
        <h3>Save a Vicus user</h3>
        <form onSubmit={handleSaveUser}>
          <label className="field">
            <span>Handle or display name</span>
            <input onChange={(event) => setHandle(event.target.value)} value={handle} placeholder="@handle" />
          </label>
          <p>
            <button className="button button-small" disabled={busy === "user"} type="submit">
              {busy === "user" ? "Saving…" : "Add contact"}
            </button>
          </p>
        </form>
      </div>

      <div className="content-panel">
        <h3>Add a manual wallet contact</h3>
        <form onSubmit={handleSaveManual}>
          <label className="field">
            <span>Name</span>
            <input onChange={(event) => setName(event.target.value)} value={name} placeholder="Treasury wallet" />
          </label>
          <label className="field">
            <span>Network</span>
            <select onChange={(event) => setNetwork(event.target.value)} value={network}>
              <option value="stellar">Stellar</option>
              <option value="base">Base</option>
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
            </select>
          </label>
          <label className="field">
            <span>Wallet address (optional)</span>
            <input onChange={(event) => setAddress(event.target.value)} value={address} placeholder="G… / 0x… " />
          </label>
          <p className="field-help">Manual addresses are user-supplied and stay unverified.</p>
          <p>
            <button className="button button-small" disabled={busy === "manual"} type="submit">
              {busy === "manual" ? "Saving…" : "Save"}
            </button>
          </p>
        </form>
      </div>

      <h3>Your contacts</h3>
      {contacts.length === 0 ? (
        <p className="control-note">No contacts yet. Save someone to get started.</p>
      ) : (
        <ul>
          {contacts.map((contact) => (
            <li key={contact.id} className="content-panel">
              <strong>{contact.displayName}</strong>{" "}
              {contact.handle ? <span className="control-note">@{contact.handle}</span> : null}
              <span className="control-note"> · {contact.source === "vicus_user" ? "Vicus user" : "Manual contact"}</span>
              {contact.endpoints.length > 0 ? (
                <p>
                  {contact.endpoints.map((endpoint) => (
                    <span className="v-chip" key={endpoint.id} title={endpoint.address}>
                      {endpoint.network} · {abbreviate(endpoint.address)}
                      {endpoint.verifiedSource === "manual" ? " · unverified" : ""}
                    </span>
                  ))}
                </p>
              ) : null}
              <p>
                <button
                  className="button button-outline button-small"
                  disabled={busy === `remove-${contact.id}`}
                  onClick={() => handleRemove(contact.id, contact.displayName)}
                  type="button"
                >
                  Remove
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
