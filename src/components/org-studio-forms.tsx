"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type SaveResponse = { ok: boolean; message?: string };

async function postJson(url: string, payload: Record<string, unknown>): Promise<SaveResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed: unknown = await response.json().catch(() => null);
  if (typeof parsed !== "object" || parsed === null || typeof (parsed as SaveResponse).ok !== "boolean") {
    return { ok: false, message: "The response could not be understood. Try again later." };
  }
  return parsed as SaveResponse;
}

export function OrgCircleClaimForm({
  orgSlug,
  circles,
}: {
  orgSlug: string;
  circles: Array<{ id: string; name: string; hosted: boolean }>;
}) {
  const router = useRouter();
  const [circleId, setCircleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await postJson(`/api/orgs/${orgSlug}/circles`, { circleId });
      if (!result.ok) {
        setError(result.message ?? "The Circle could not be associated.");
      } else {
        setCircleId("");
        router.refresh();
      }
    } catch {
      setError("The Circle could not be associated. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="org-circle-claim">Host a Circle</label>
        <select id="org-circle-claim" onChange={(event) => setCircleId(event.target.value)} required value={circleId}>
          <option value="">Choose a Circle…</option>
          {circles.map((circle) => (
            <option key={circle.id} value={circle.id}>
              {circle.name}{circle.hosted ? " (already hosted)" : ""}
            </option>
          ))}
        </select>
        <p className="control-note">Only currently unhosted Circles can be claimed here. Hosted Circles move only through a global admin.</p>
      </div>
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Saving…" : "Host Circle"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function OrgMemberForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await postJson(`/api/orgs/${orgSlug}/members`, { handle, role });
      if (!result.ok) {
        setError(result.message ?? "The member could not be added.");
      } else {
        setHandle("");
        router.refresh();
      }
    } catch {
      setError("The member could not be added. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="org-member-handle">Member handle</label>
        <input
          id="org-member-handle"
          onChange={(event) => setHandle(event.target.value)}
          placeholder="member-handle"
          required
          value={handle}
        />
      </div>
      <div className="field-group">
        <label htmlFor="org-member-role">Role</label>
        <select id="org-member-role" onChange={(event) => setRole(event.target.value)} value={role}>
          <option value="editor">Editor (lessons + missions)</option>
          <option value="admin">Admin (also members, Circles, reviews)</option>
          <option value="owner">Owner (full organization control)</option>
        </select>
      </div>
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Saving…" : "Add member"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function OrgCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await postJson("/api/admin/organizations", {
        name,
        slug,
        description,
        websiteUrl: websiteUrl || null,
        ecosystemFocus: null,
      });
      if (!result.ok) {
        setError(result.message ?? "The organization could not be created.");
      } else {
        router.refresh();
      }
    } catch {
      setError("The organization could not be created. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mission-create-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="org-name">Name</label>
        <input id="org-name" onChange={(event) => setName(event.target.value)} required value={name} />
      </div>
      <div className="field-group">
        <label htmlFor="org-slug">Slug</label>
        <input id="org-slug" onChange={(event) => setSlug(event.target.value)} placeholder="circle" required value={slug} />
      </div>
      <div className="field-group">
        <label htmlFor="org-description">Description</label>
        <textarea id="org-description" onChange={(event) => setDescription(event.target.value)} required rows={3} value={description} />
      </div>
      <div className="field-group">
        <label htmlFor="org-website">Official website (optional)</label>
        <input id="org-website" onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://…" value={websiteUrl} />
      </div>
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Saving…" : "Create organization"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
