"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssetRegistrationRecord } from "@/lib/registrations/service";

export type RegistrationClaim = {
  applicationId: string;
  applicationName: string;
  name: string;
  network: string;
  identifier: string;
};

const TYPES = [
  { value: "stellar-classic", label: "Stellar Classic (code + issuer)", networks: ["stellar"] },
  { value: "stellar-contract", label: "Stellar contract (C… ID)", networks: ["stellar"] },
  { value: "evm", label: "EVM (Base / Ethereum contract)", networks: ["base", "ethereum"] },
  { value: "solana", label: "Solana (mint address)", networks: ["solana"] },
];

function statusLabel(status: string) {
  if (status === "pending") return "Pending admin review";
  if (status === "needs_review") return "Needs more evidence";
  if (status === "approved") return "Registered in the catalogue";
  return "Not registered";
}

export function AssetRegistrationPanel({
  registrations,
  claims,
}: {
  registrations: AssetRegistrationRecord[];
  claims: RegistrationClaim[];
}) {
  const router = useRouter();
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("stellar-classic");
  const [network, setNetwork] = useState("stellar");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [issuerClaim, setIssuerClaim] = useState("");
  const [documentationUrls, setDocumentationUrls] = useState("");
  const [chainEvidenceUrls, setChainEvidenceUrls] = useState("");
  const [issuerWebsite, setIssuerWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const networks = useMemo(
    () => TYPES.find((entry) => entry.value === assetType)?.networks ?? ["stellar"],
    [assetType],
  );

  function fillFromClaim(claim: RegistrationClaim) {
    setAssetName(claim.name);
    setIdentifier(claim.identifier ?? "");
    setError("");
    setOk("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setOk("");
    setBusy(true);
    try {
      const split = (raw: string) =>
        raw.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName,
          assetType,
          network,
          identifier,
          code: code || null,
          issuerClaim: issuerClaim || null,
          documentationUrls: split(documentationUrls),
          chainEvidenceUrls: split(chainEvidenceUrls),
          issuerWebsite: issuerWebsite || null,
          spaceApplicationId: null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok: boolean;
        message?: string;
      } | null;
      if (!payload || payload.ok !== true) {
        setError(
          payload && typeof payload.message === "string" && payload.message
            ? payload.message
            : "The registration request could not be saved.",
        );
      } else {
        setOk("Request saved. It is pending admin review — nothing is verified yet.");
        setAssetName("");
        setIdentifier("");
        setCode("");
        setIssuerClaim("");
        setDocumentationUrls("");
        setChainEvidenceUrls("");
        setIssuerWebsite("");
        router.refresh();
      }
    } catch {
      setError("The registration request could not be saved. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="control-note">
        Registration records that an admin reviewed your sources and allowed the asset into the
        catalogue. It is <strong>not</strong> issuer verification, and it enables no trading,
        Send, Earn, Redeem, or distribution on its own. Rejected or pending requests never appear
        as catalogue assets.
      </p>

      {claims.length > 0 ? (
        <div className="control-note" style={{ marginBottom: 12 }}>
          <strong>From your Space applications (claims, not verified):</strong>
          <ul>
            {claims.map((claim, index) => (
              <li key={`${claim.applicationId}-${index}`}>
                {claim.name} · {claim.network}
                {claim.identifier ? (
                  <>
                    {" · "}<span className="reg-mono">{claim.identifier}</span>
                  </>
                ) : null}{" "}
                <button
                  className="button button-small button-outline"
                  onClick={() => fillFromClaim(claim)}
                  type="button"
                >
                  Use in form
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={submit}>
        <div className="field-group">
          <label htmlFor="reg-name">Asset name</label>
          <input
            id="reg-name"
            onChange={(event) => setAssetName(event.target.value)}
            required
            value={assetName}
          />
        </div>
        <div className="reg-grid">
          <div className="field-group">
            <label htmlFor="reg-type">Asset type</label>
            <select
              id="reg-type"
              onChange={(event) => {
                setAssetType(event.target.value);
                setNetwork(
                  (TYPES.find((entry) => entry.value === event.target.value)?.networks ?? ["stellar"])[0] ?? "stellar",
                );
              }}
              value={assetType}
            >
              {TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="reg-network">Network</label>
            <select id="reg-network" onChange={(event) => setNetwork(event.target.value)} value={network}>
              {networks.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="reg-identifier">
            Canonical identifier (issuer account · contract ID · contract address · mint)
          </label>
          <input
            id="reg-identifier"
            className="reg-mono"
            onChange={(event) => setIdentifier(event.target.value)}
            required
            value={identifier}
          />
        </div>
        <div className="reg-grid">
          <div className="field-group">
            <label htmlFor="reg-code">Code / symbol {assetType === "stellar-classic" ? "(required)" : "(optional)"}</label>
            <input id="reg-code" onChange={(event) => setCode(event.target.value)} value={code} />
          </div>
          <div className="field-group">
            <label htmlFor="reg-issuer">Issuer claim (your words, not proof)</label>
            <input
              id="reg-issuer"
              onChange={(event) => setIssuerClaim(event.target.value)}
              value={issuerClaim}
            />
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="reg-docs">Official issuer/product documentation URLs (one per line, at least one)</label>
          <textarea
            id="reg-docs"
            onChange={(event) => setDocumentationUrls(event.target.value)}
            required
            rows={2}
            value={documentationUrls}
          />
        </div>
        <div className="field-group">
          <label htmlFor="reg-evidence">Public chain records — Horizon / explorer URLs (one per line, at least one)</label>
          <textarea
            id="reg-evidence"
            onChange={(event) => setChainEvidenceUrls(event.target.value)}
            required
            rows={2}
            value={chainEvidenceUrls}
          />
        </div>
        <div className="field-group">
          <label htmlFor="reg-website">Issuer website (optional)</label>
          <input
            id="reg-website"
            onChange={(event) => setIssuerWebsite(event.target.value)}
            value={issuerWebsite}
          />
        </div>
        <p className="control-note">
          A URL alone is not verification. A chain record proves an on-chain object exists — it
          does not prove issuer endorsement, redemption rights, or legitimacy.
        </p>
        <button className="button button-small button-white" disabled={busy} type="submit">
          {busy ? "Saving…" : "Request registration"}
        </button>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? <p className="control-note">{ok}</p> : null}
      </form>

      <div style={{ marginTop: 20 }}>
        <strong>Your requests</strong>
        {registrations.length === 0 ? (
          <p className="control-note">No registration requests yet.</p>
        ) : (
          <ul>
            {registrations.map((registration) => (
              <li key={registration.id} style={{ marginBottom: 12 }}>
                <strong>{registration.assetName}</strong> · {registration.assetType} ·{" "}
                {registration.network} · <span className="mission-type">{statusLabel(registration.status)}</span>
                <br />
                <span className="reg-mono control-note">{registration.identifier}</span>
                {registration.reviewNote ? (
                  <p className="control-note">Reviewer: {registration.reviewNote}</p>
                ) : null}
                {registration.status === "pending" || registration.status === "needs_review" ? (
                  <p className="control-note">
                    Still unverified — why:{" "}
                    {registration.validationFindings
                      .filter((finding) => finding.severity !== "info")
                      .map((finding) => finding.message)
                      .join(" ") || "waiting for admin source review."}
                  </p>
                ) : null}
                {registration.status === "approved" ? (
                  <p className="control-note">
                    In the catalogue as admin-reviewed sources. Issuer remains unverified; no
                    financial capability was enabled.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
