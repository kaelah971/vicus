"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

const spaceProjectTypes = ["ecosystem", "issuer", "protocol", "foundation", "community", "other"] as const;

type ApplyResponse = { ok: boolean; message?: string };

const hostingOptions = ["Asset Circles", "Lessons", "Missions", "Community"] as const;

export function SpaceApplicationForm({ ecosystems }: { ecosystems: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const [proposedName, setProposedName] = useState("");
  const [proposedSlug, setProposedSlug] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [projectType, setProjectType] = useState<string>("issuer");
  const [ecosystemFocus, setEcosystemFocus] = useState("");
  const [purpose, setPurpose] = useState<string[]>([]);
  const [affiliationNote, setAffiliationNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function togglePurpose(option: string) {
    setPurpose((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitted(false);
    setBusy(true);
    try {
      const response = await fetch("/api/spaces/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedName,
          proposedSlug,
          description,
          websiteUrl: websiteUrl || null,
          projectType,
          ecosystemFocus: ecosystemFocus || null,
          requestedPurpose: `Hosting: ${purpose.length > 0 ? purpose.join(", ") : "to be discussed"}.`,
          affiliationNote: affiliationNote || null,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== "object" || payload === null || (payload as ApplyResponse).ok !== true) {
        setError(
          typeof payload === "object" && payload !== null && "message" in payload
            ? String((payload as ApplyResponse).message ?? "The application could not be submitted.")
            : "The application could not be submitted.",
        );
      } else {
        setSubmitted(true);
        setProposedName("");
        setProposedSlug("");
        setDescription("");
        setWebsiteUrl("");
        setPurpose([]);
        setAffiliationNote("");
        router.refresh();
      }
    } catch {
      setError("The application could not be submitted. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="space-apply-name">Project / community name</label>
        <input id="space-apply-name" onChange={(event) => setProposedName(event.target.value)} required value={proposedName} />
      </div>
      <div className="field-group">
        <label htmlFor="space-apply-slug">Desired Space slug</label>
        <input
          id="space-apply-slug"
          onChange={(event) => setProposedSlug(event.target.value)}
          placeholder="my-project"
          required
          value={proposedSlug}
        />
      </div>
      <div className="field-group">
        <label htmlFor="space-apply-type">Project type</label>
        <select id="space-apply-type" onChange={(event) => setProjectType(event.target.value)} value={projectType}>
          {spaceProjectTypes.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="field-group">
        <label htmlFor="space-apply-ecosystem">Ecosystem focus</label>
        <select id="space-apply-ecosystem" onChange={(event) => setEcosystemFocus(event.target.value)} value={ecosystemFocus}>
          <option value="">No single ecosystem</option>
          {ecosystems.map((ecosystem) => (
            <option key={ecosystem.value} value={ecosystem.value}>
              {ecosystem.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-group">
        <span className="field-label">What do you want to host?</span>
        {hostingOptions.map((option) => (
          <label className="check-field" key={option}>
            <input checked={purpose.includes(option)} onChange={() => togglePurpose(option)} type="checkbox" />
            {option}
          </label>
        ))}
      </div>
      <div className="field-group">
        <label htmlFor="space-apply-website">Website</label>
        <input id="space-apply-website" onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://…" value={websiteUrl} />
      </div>
      <div className="field-group">
        <label htmlFor="space-apply-description">Short description</label>
        <textarea id="space-apply-description" onChange={(event) => setDescription(event.target.value)} required rows={3} value={description} />
      </div>
      <div className="field-group">
        <label htmlFor="space-apply-affiliation">Additional context / proof of affiliation (optional)</label>
        <textarea id="space-apply-affiliation" onChange={(event) => setAffiliationNote(event.target.value)} rows={2} value={affiliationNote} />
      </div>
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Submitting…" : "Apply for a Space"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {submitted ? (
        <p className="control-note">Application received. Track its status below — no wallet action needed.</p>
      ) : null}
    </form>
  );
}
