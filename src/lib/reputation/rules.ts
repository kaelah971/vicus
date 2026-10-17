/**
 * P7.1 — Evidence taxonomy (pure, no I/O). Reputation is explainable
 * verified counts plus separately-labeled authored content — never a
 * trust score, never XP (loyalty owns progress), never money.
 *
 * Strengths:
 * - verified: independently checked by Vicus or settled on-chain.
 *   Approved mission submissions (canonical: submission id) and PAID
 *   campaign completions (canonical: completion id). Pending, rejected,
 *   revoked, failed, or reserved items earn nothing.
 * - authored: user-created content shown with its status. A published
 *   thesis is a hypothesis, not a correct prediction; a self-resolved
 *   thesis is not independently validated performance; posts/answers
 *   are community signals, not approvals.
 *
 * Anti-multiplication: the same canonical id counts once; completions
 * sharing one underlying proof collapse to the earliest paid (P6.2 now
 * rejects cross-campaign reuse, this covers legacy rows).
 */

export const VERIFIED_KINDS = ["mission-approved", "campaign-paid"] as const;
export const AUTHORED_KINDS = ["thesis", "post", "answer"] as const;

export type VerifiedKind = (typeof VERIFIED_KINDS)[number];
export type AuthoredKind = (typeof AUTHORED_KINDS)[number];

export type VerifiedEvent = {
  /** Canonical id: submission id or completion id. Counted once. */
  key: string;
  kind: VerifiedKind;
  at: Date;
  /** Proof identity for cross-row dedupe (completions only). */
  proofKey: string | null;
  circleSlug: string | null;
  title: string;
};

export type AuthoredItem = {
  key: string;
  kind: AuthoredKind;
  at: Date;
  status: string;
  circleSlug: string | null;
  title: string;
};

/** Collapse exact duplicates and same-proof completions (earliest wins). */
export function dedupeVerifiedEvents(events: VerifiedEvent[]): VerifiedEvent[] {
  const byKey = new Map<string, VerifiedEvent>();
  for (const event of events) {
    if (!event.key || !(event.at instanceof Date) || Number.isNaN(event.at.getTime())) continue;
    const existing = byKey.get(event.key);
    if (!existing || event.at.getTime() < existing.at.getTime()) byKey.set(event.key, event);
  }
  const byProof = new Map<string, VerifiedEvent>();
  for (const event of byKey.values()) {
    if (!event.proofKey) {
      byProof.set(`id:${event.key}`, event);
      continue;
    }
    const existing = byProof.get(`proof:${event.proofKey}`);
    if (!existing || event.at.getTime() < existing.at.getTime()) byProof.set(`proof:${event.proofKey}`, event);
  }
  return [...byProof.values()].sort(
    (a, b) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** Deterministic recent-first ordering for authored items. */
export function orderAuthoredItems(items: AuthoredItem[]): AuthoredItem[] {
  return [...items].sort(
    (a, b) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** Thesis display status: open-but-past-close reads as expired. */
export function thesisDisplayStatus(status: string, closesAt: Date | null, now: number = Date.now()): string {
  if (status === "resolved" || status === "withdrawn") return status;
  if (status === "open" && closesAt instanceof Date && !Number.isNaN(closesAt.getTime()) && closesAt.getTime() <= now) {
    return "expired";
  }
  return "open";
}
