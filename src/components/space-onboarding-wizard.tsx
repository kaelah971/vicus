"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SpaceApplicationRecord } from "@/lib/organizations/service";
import type { SpaceApplicationAssetDoc, SpaceApplicationEligibility } from "@/db/schema";

const spaceProjectTypes = ["ecosystem", "issuer", "protocol", "foundation", "community", "other"] as const;

type DraftResponse = { ok: boolean; draft?: SpaceApplicationRecord; application?: SpaceApplicationRecord; message?: string };

async function api(path: string, method: string, body?: unknown): Promise<DraftResponse> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await response.json().catch(() => ({ ok: false }))) as DraftResponse;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small className="field-help">{hint}</small> : null}
    </label>
  );
}

const inputClass = "field-input";

export function SpaceOnboardingWizard({
  ecosystems,
  resumeId,
  onDone,
}: {
  ecosystems: Array<{ value: string; label: string }>;
  resumeId?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(resumeId ?? null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(() => resumeId != null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [identity, setIdentity] = useState({
    proposedName: "",
    proposedSlug: "",
    description: "",
    websiteUrl: "",
    projectType: "issuer",
    ecosystemFocus: "",
    requestedPurpose: "",
    affiliationNote: "",
  });
  const [assets, setAssets] = useState<SpaceApplicationAssetDoc[]>([]);
  const [eligibility, setEligibility] = useState<{
    authorizedRepresentative: boolean | null;
    issuerRelationship: string;
    distributionRequested: boolean | null;
    jurisdictions: string;
    permissionedNotes: string;
    kycProcesses: string;
    evidenceUrls: string;
  }>({
    authorizedRepresentative: null,
    issuerRelationship: "",
    distributionRequested: null,
    jurisdictions: "",
    permissionedNotes: "",
    kycProcesses: "",
    evidenceUrls: "",
  });

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    api(`/api/spaces/applications/${encodeURIComponent(resumeId)}`, "GET")
      .then((payload) => {
        if (cancelled) return;
        const app = payload.application;
        if (payload.ok && app && app.status === "draft") {
          setDraftId(app.id);
          setIdentity({
            proposedName: app.proposedName,
            proposedSlug: app.proposedSlug.startsWith("draft-") ? "" : app.proposedSlug,
            description: app.description,
            websiteUrl: app.websiteUrl ?? "",
            projectType: app.projectType,
            ecosystemFocus: app.ecosystemFocus ?? "",
            requestedPurpose: app.requestedPurpose,
            affiliationNote: app.affiliationNote ?? "",
          });
          setAssets(Array.isArray(app.assetDetails) ? app.assetDetails : []);
          const elig = app.eligibility as SpaceApplicationEligibility | null;
          if (elig) {
            setEligibility({
              authorizedRepresentative: elig.authorizedRepresentative,
              issuerRelationship: elig.issuerRelationship ?? "",
              distributionRequested: elig.distributionRequested,
              jurisdictions: elig.jurisdictions ?? "",
              permissionedNotes: elig.permissionedNotes ?? "",
              kycProcesses: elig.kycProcesses ?? "",
              evidenceUrls: (elig.evidenceUrls ?? []).join("\n"),
            });
          }
        } else if (!cancelled) {
          setError("That draft could not be opened. It may have been submitted already.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("The draft could not be loaded. Try again later.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  async function ensureDraft(): Promise<string | null> {
    if (draftId) return draftId;
    const created = await api("/api/spaces/applications/drafts", "POST");
    if (!created.ok || !created.draft) {
      setError(created.message ?? "The draft could not be started.");
      return null;
    }
    setDraftId(created.draft.id);
    return created.draft.id;
  }

  function eligibilityPayload() {
    return {
      authorizedRepresentative: eligibility.authorizedRepresentative,
      issuerRelationship: eligibility.issuerRelationship || null,
      distributionRequested: eligibility.distributionRequested,
      jurisdictions: eligibility.jurisdictions || null,
      permissionedNotes: eligibility.permissionedNotes || null,
      kycProcesses: eligibility.kycProcesses || null,
      evidenceUrls: eligibility.evidenceUrls.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    };
  }

  async function saveStep(nextStep: number) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const id = await ensureDraft();
      if (!id) return;
      const payload: Record<string, unknown> = step === 0
        ? {
          proposedName: identity.proposedName,
          proposedSlug: identity.proposedSlug || undefined,
          description: identity.description,
          websiteUrl: identity.websiteUrl || null,
          projectType: identity.projectType,
          ecosystemFocus: identity.ecosystemFocus || null,
          requestedPurpose: identity.requestedPurpose,
          affiliationNote: identity.affiliationNote || null,
        }
        : step === 1
          ? { assetDetails: assets }
          : { eligibility: eligibilityPayload() };
      const saved = await api(`/api/spaces/applications/${encodeURIComponent(id)}`, "PATCH", payload);
      if (!saved.ok) {
        setError(saved.message ?? "The draft could not be saved.");
        return;
      }
      setNotice("Draft saved. Come back any time to continue.");
      setStep(nextStep);
    } catch {
      setError("The draft could not be saved. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const id = draftId ?? (await ensureDraft());
      if (!id) return;
      const done = await api(`/api/spaces/applications/${encodeURIComponent(id)}/submit`, "POST");
      if (!done.ok) {
        setError(done.message ?? "The application could not be submitted.");
        return;
      }
      setSubmitted(true);
      router.refresh();
      onDone?.();
    } catch {
      setError("The application could not be submitted. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  function addAsset() {
    setAssets((current) => [
      ...current,
      { name: "", network: "", identifier: null, documentationUrls: [], issuerWebsite: null, verificationSources: [], requestedUse: null },
    ]);
  }

  const steps = ["Project", "Assets", "Eligibility", "Review"];

  if (submitted) {
    return (
      <div className="hairline-card">
        <p className="eyebrow">Application submitted</p>
        <h3>Pending review.</h3>
        <p className="control-note">
          Vicus admins will review the full application — identity, asset documents, and eligibility.
          Approval creates the organization; nothing else is granted or verified by applying.
        </p>
      </div>
    );
  }

  return (
    <div className="mission-create-form">
      <ol className="form-steps" aria-label="Onboarding progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} data-done={index < step}>
            <span>{index + 1}</span> {label}
          </li>
        ))}
      </ol>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="control-note" role="status">{notice}</p> : null}

      {step === 0 ? (
        <div className="stack">
          <Field label="Project or issuer name">
            <input className={inputClass} value={identity.proposedName} maxLength={180} onChange={(e) => setIdentity({ ...identity, proposedName: e.target.value })} placeholder="Example Collective" />
          </Field>
          <Field label="Space slug" hint="Lowercase letters, numbers, hyphens. Public URL of the future Space.">
            <input className={inputClass} value={identity.proposedSlug} maxLength={140} onChange={(e) => setIdentity({ ...identity, proposedSlug: e.target.value })} placeholder="example-collective" />
          </Field>
          <Field label="Project type">
            <select className={inputClass} value={identity.projectType} onChange={(e) => setIdentity({ ...identity, projectType: e.target.value })}>
              {spaceProjectTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Website">
            <input className={inputClass} value={identity.websiteUrl} inputMode="url" onChange={(e) => setIdentity({ ...identity, websiteUrl: e.target.value })} placeholder="https://" />
          </Field>
          <Field label="Description" hint="20–2000 characters. What the project is.">
            <textarea className={inputClass} value={identity.description} rows={4} onChange={(e) => setIdentity({ ...identity, description: e.target.value })} />
          </Field>
          <Field label="Ecosystem focus">
            <select className={inputClass} value={identity.ecosystemFocus} onChange={(e) => setIdentity({ ...identity, ecosystemFocus: e.target.value })}>
              <option value="">Unspecified</option>
              {ecosystems.map((eco) => <option key={eco.value} value={eco.value}>{eco.label}</option>)}
            </select>
          </Field>
          <Field label="Intended Vicus use" hint="20–2000 characters. What the Space would host.">
            <textarea className={inputClass} value={identity.requestedPurpose} rows={3} onChange={(e) => setIdentity({ ...identity, requestedPurpose: e.target.value })} />
          </Field>
          <Field label="Your affiliation (optional)">
            <input className={inputClass} value={identity.affiliationNote} maxLength={2000} onChange={(e) => setIdentity({ ...identity, affiliationNote: e.target.value })} placeholder="Role at the project" />
          </Field>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          <p className="control-note">
            List assets this project may reference or host. These are your claims, not verified
            facts — nothing here registers an asset on Vicus.
          </p>
          {assets.map((asset, index) => (
            <fieldset className="hairline-card" key={index}>
              <legend className="eyebrow">Asset {index + 1}</legend>
              <Field label="Asset name">
                <input className={inputClass} value={asset.name} onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, name: e.target.value } : a))} />
              </Field>
              <Field label="Network">
                <input className={inputClass} value={asset.network} placeholder="Stellar, Solana, Base…" onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, network: e.target.value } : a))} />
              </Field>
              <Field label="Identifier (optional)" hint="Asset code + issuer, contract, or mint.">
                <input className={inputClass} value={asset.identifier ?? ""} onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, identifier: e.target.value || null } : a))} />
              </Field>
              <Field label="Official documentation URLs (one per line)">
                <textarea className={inputClass} rows={2} value={asset.documentationUrls.join("\n")} onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, documentationUrls: e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) } : a))} />
              </Field>
              <Field label="Issuer website (optional)">
                <input className={inputClass} value={asset.issuerWebsite ?? ""} inputMode="url" onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, issuerWebsite: e.target.value || null } : a))} />
              </Field>
              <Field label="Verification sources (one per line, optional)">
                <textarea className={inputClass} rows={2} value={asset.verificationSources.join("\n")} onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, verificationSources: e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) } : a))} />
              </Field>
              <Field label="Requested use on Vicus (optional)">
                <input className={inputClass} value={asset.requestedUse ?? ""} onChange={(e) => setAssets((c) => c.map((a, i) => i === index ? { ...a, requestedUse: e.target.value || null } : a))} />
              </Field>
              <button type="button" className="button button-outline button-small" onClick={() => setAssets((c) => c.filter((_, i) => i !== index))}>
                Remove asset
              </button>
            </fieldset>
          ))}
          {assets.length < 10 ? (
            <button type="button" className="button button-outline" onClick={addAsset}>Add an asset</button>
          ) : (
            <p className="control-note">Up to 10 asset entries.</p>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <p className="control-note">
            Factual declarations only. This is not KYC, and Vicus does not verify issuers,
            approve securities, or grant distribution rights through this form.
          </p>
          <Field label="Are you an authorized representative of this project?">
            <select
              className={inputClass}
              value={eligibility.authorizedRepresentative === null ? "" : String(eligibility.authorizedRepresentative)}
              onChange={(e) => setEligibility({ ...eligibility, authorizedRepresentative: e.target.value === "" ? null : e.target.value === "true" })}
            >
              <option value="">Choose…</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Issuer relationship (optional)">
            <input className={inputClass} value={eligibility.issuerRelationship} onChange={(e) => setEligibility({ ...eligibility, issuerRelationship: e.target.value })} placeholder="Team member, partner, community…" />
          </Field>
          <Field label="Requesting token distribution rights?">
            <select
              className={inputClass}
              value={eligibility.distributionRequested === null ? "" : String(eligibility.distributionRequested)}
              onChange={(e) => setEligibility({ ...eligibility, distributionRequested: e.target.value === "" ? null : e.target.value === "true" })}
            >
              <option value="">Choose…</option>
              <option value="true">Yes — subject to separate issuer review</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Intended jurisdictions/users (optional)">
            <input className={inputClass} value={eligibility.jurisdictions} onChange={(e) => setEligibility({ ...eligibility, jurisdictions: e.target.value })} />
          </Field>
          <Field label="Permissioned-asset restrictions (optional)">
            <textarea className={inputClass} rows={2} value={eligibility.permissionedNotes} onChange={(e) => setEligibility({ ...eligibility, permissionedNotes: e.target.value })} />
          </Field>
          <Field label="KYC/compliance processes (optional)">
            <textarea className={inputClass} rows={2} value={eligibility.kycProcesses} onChange={(e) => setEligibility({ ...eligibility, kycProcesses: e.target.value })} />
          </Field>
          <Field label="Evidence URLs, one per line (optional)">
            <textarea className={inputClass} rows={2} value={eligibility.evidenceUrls} onChange={(e) => setEligibility({ ...eligibility, evidenceUrls: e.target.value })} />
          </Field>
        </div>
      ) : null}

      {step === 3 ? (
        <form onSubmit={submitApplication}>
          <div className="stack">
            <div className="hairline-card">
              <p className="eyebrow">Review</p>
              <h3>{identity.proposedName || "Untitled project"}</h3>
              <p className="control-note">
                /{identity.proposedSlug || "…"} · {identity.projectType}
                {identity.ecosystemFocus ? ` · ${identity.ecosystemFocus}` : ""}
              </p>
              <p>{identity.description || <em className="muted">No description yet.</em>}</p>
              <p className="control-note">Purpose: {identity.requestedPurpose || <em>not set</em>}</p>
              <p className="control-note">
                Assets: {assets.length === 0 ? "none listed" : assets.map((a) => a.name || "Untitled").join(", ")}
              </p>
              <p className="control-note">
                Eligibility: {eligibility.authorizedRepresentative === null || eligibility.distributionRequested === null
                  ? "incomplete — go back to Eligibility"
                  : `representative ${eligibility.authorizedRepresentative ? "yes" : "no"} · distribution ${eligibility.distributionRequested ? "requested (separate review)" : "not requested"}`}
              </p>
            </div>
            <p className="control-note">
              Submitting sends the full application for admin review. Approval creates the
              organization only — it verifies no assets, approves no securities, and grants
              no distribution rights.
            </p>
            <button type="submit" className="button button-white" disabled={busy}>
              {busy ? "Submitting…" : "Confirm and submit for review"}
            </button>
          </div>
        </form>
      ) : null}

      {step < 3 ? (
        <div className="form-actions">
          {step > 0 ? (
            <button type="button" className="button button-outline" disabled={busy} onClick={() => { setError(""); setNotice(""); setStep(step - 1); }}>
              Back
            </button>
          ) : null}
          <button type="button" className="button button-white" disabled={busy} onClick={() => void saveStep(step + 1)}>
            {busy ? "Saving…" : step === 2 ? "Save and review" : "Save draft and continue"}
          </button>
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" className="button button-outline" disabled={busy} onClick={() => setStep(2)}>
            Back to Eligibility
          </button>
        </div>
      )}
    </div>
  );
}
