import Link from "next/link";
import { StatusPill } from "@/components/vicus";
import type { PersonCard as PersonCardData } from "@/lib/social/service";

export function personInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "VC"
  );
}

export function PersonCard({ person }: { person: PersonCardData }) {
  return (
    <article className="mission-card">
      <div className="mission-card-header">
        <div aria-hidden="true" className="avatar-orb">
          {personInitials(person.user.displayName)}
        </div>
        <span className="mission-type">@{person.user.handle}</span>
      </div>
      <h3>
        <Link href={`/u/${person.user.handle}`}>{person.user.displayName}</Link>
      </h3>
      <div className="mission-meta">
        {person.relationships.map((relationship) => (
          <StatusPill key={relationship} tone={relationship === "Contributor" ? "green" : "muted"}>
            {relationship}
          </StatusPill>
        ))}
      </div>
      <dl className="mission-meta">
        <div>
          <dt>Approved</dt>
          <dd>
            {person.approvedContributionCount} contributions · {person.approvedPoints} points
          </dd>
        </div>
      </dl>
      <div className="mission-footer">
        <Link className="mission-action-link" href={`/u/${person.user.handle}`}>
          View profile
        </Link>
      </div>
    </article>
  );
}
