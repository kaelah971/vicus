import Link from "next/link";
import { plural } from "@/components/vicus";
import { Avatar } from "@/components/vicus-ui";
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
    <Link aria-label={`View ${person.user.displayName}'s profile`} className="person-tile" href={`/u/${person.user.handle}`}>
      <Avatar name={person.user.displayName || person.user.handle} size="lg" />
      <span className="person-tile-main">
        <strong>{person.user.displayName}</strong>
        <small>@{person.user.handle}</small>
      </span>
      {person.relationships.length > 0 ? (
        <span className="person-tile-tags">
          {person.relationships.map((relationship) => (
            <span className={`v-chip${relationship === "Contributor" ? " tone-green" : ""}`} key={relationship}>
              {relationship === "Watcher"
                ? "WATCHING"
                : relationship === "Contributor"
                  ? "CONTRIBUTED"
                  : relationship === "Verified Holder"
                    ? "VERIFIED HOLDER"
                    : relationship === "Verified Trustline"
                      ? "VERIFIED"
                      : relationship}
            </span>
          ))}
        </span>
      ) : null}
      <span className="person-tile-stat">
        {plural(person.approvedContributionCount, "contribution")} · {plural(person.approvedPoints, "pt")}
      </span>
    </Link>
  );
}
