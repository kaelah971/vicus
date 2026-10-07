"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

const assetInterestOptions = [
  "Stablecoins",
  "Tokenized treasuries",
  "Private credit",
  "Tokenized funds",
  "Commodities",
  "Real estate",
  "Payments",
];

type ProfileEditorProps = {
  initialDisplayName: string;
  initialBio: string;
  initialPreferredEcosystems: string[];
  initialAssetInterests: string[];
  ecosystems: Array<{ value: string; label: string }>;
};

export function ProfileEditor({
  initialDisplayName,
  initialBio,
  initialPreferredEcosystems,
  initialAssetInterests,
  ecosystems,
}: ProfileEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [preferredEcosystems, setPreferredEcosystems] = useState(initialPreferredEcosystems);
  const [assetInterests, setAssetInterests] = useState(initialAssetInterests);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setEditing(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editing]);

  function toggleValue(value: string, current: string[], update: (next: string[]) => void) {
    update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, bio, preferredEcosystems, assetInterests }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setError(typeof body?.message === "string" ? body.message : "The profile could not be updated.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("The profile could not be updated. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button className="button button-outline button-small" onClick={() => setEditing(true)} type="button">
        Edit profile
      </button>
    );
  }

  return (
    <div className="profile-editor-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setEditing(false)}>
      <form aria-labelledby="profile-editor-title" aria-modal="true" className="profile-editor" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveProfile} role="dialog">
        <div className="profile-editor-header">
          <div>
            <span className="eyebrow" id="profile-editor-title">Edit profile</span>
            <p>Preferences shape your Vicus context. They are not proof of ownership.</p>
          </div>
          <button aria-label="Close profile editor" className="button button-text button-small" onClick={() => setEditing(false)} ref={closeRef} type="button">
            Close
          </button>
        </div>
      <label className="profile-editor-field">
        <span>Display name</span>
        <input maxLength={160} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
      </label>
      <label className="profile-editor-field">
        <span>Short bio</span>
        <textarea maxLength={280} onChange={(event) => setBio(event.target.value)} rows={3} value={bio} />
      </label>
      <fieldset className="profile-editor-options">
        <legend>Preferred ecosystems</legend>
        {ecosystems.map((ecosystem) => (
          <label key={ecosystem.value}>
            <input
              checked={preferredEcosystems.includes(ecosystem.value)}
              onChange={() => toggleValue(ecosystem.value, preferredEcosystems, setPreferredEcosystems)}
              type="checkbox"
            />
            <span>{ecosystem.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="profile-editor-options">
        <legend>Asset interests</legend>
        {assetInterestOptions.map((interest) => (
          <label key={interest}>
            <input
              checked={assetInterests.includes(interest)}
              onChange={() => toggleValue(interest, assetInterests, setAssetInterests)}
              type="checkbox"
            />
            <span>{interest}</span>
          </label>
        ))}
      </fieldset>
      {error ? <p className="profile-editor-error" role="alert">{error}</p> : null}
      <button aria-busy={busy} className="button button-violet button-small" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save profile"}
      </button>
      </form>
    </div>
  );
}
