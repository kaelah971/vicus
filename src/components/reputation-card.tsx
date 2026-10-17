import Link from "next/link";
import { SectionHead } from "@/components/vicus-ui";
import { getReputationSummary, type ReputationVisibility } from "@/lib/reputation/service";

/**
 * P7.1 — Contribution reputation card. Explainable verified counts plus
 * separately-labeled authored content. No scores, no XP (loyalty owns
 * progress), no leaderboard. Public visibility shows only public-safe
 * records: approved/authored items, no review notes, no wallets,
 * rewards, balances, or contacts.
 */
export async function ReputationCard({
  userId,
  visibility = "private",
}: {
  userId: string;
  visibility?: ReputationVisibility;
}) {
  let summary = null;
  try {
    summary = await getReputationSummary(userId, visibility);
  } catch {
    summary = null;
  }
  if (!summary) {
    return (
      <section className="p-section" aria-labelledby="reputation-title">
        <SectionHead eyebrow="Reputation" id="reputation-title" title="Contributions" />
        <p className="muted">Contribution history is unavailable right now. No fallback history is shown.</p>
      </section>
    );
  }
  const { verified, authored, counts, circles, pending } = summary;
  const hasAny = verified.length > 0 || authored.length > 0;
  const thesisTone = (status: string) =>
    status === "resolved" ? "green" : status === "open" ? "blue" : "muted";

  return (
    <section className="p-section" aria-labelledby="reputation-title" data-reputation="true">
      <SectionHead
        eyebrow="Reputation"
        id="reputation-title"
        title={
          hasAny
            ? `${counts.verifiedMissions + counts.verifiedCampaigns} verified · ${counts.theses + counts.posts + counts.answers} authored`
            : "No contributions yet"
        }
        line={
          hasAny
            ? "Verified means Vicus-checked or settled. Authored means written by this account — hypotheses, not validations."
            : undefined
        }
      />
      {!hasAny ? (
        <p className="muted">
          Nothing verified or published yet — only real records appear here.{" "}
          <Link className="v-text-link" href="/discover">
            Explore missions →
          </Link>
        </p>
      ) : (
        <>
          {verified.length > 0 ? (
            <>
              <h3 className="rep-h">Verified contributions</h3>
              <ul className="v-list">
                {verified.slice(0, 5).map((event) => (
                  <li key={event.key}>
                    <span className="v-row">
                      <span className="v-row-main">
                        <strong>{event.title}</strong>
                        <small>
                          {event.kind === "mission-approved" ? "Mission approved" : "Campaign reward paid"}
                          {event.circleSlug ? ` · ${event.circleSlug}` : ""} · {event.at.toISOString().slice(0, 10)}
                        </small>
                      </span>
                      <small className="rep-proof">evidence on record</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {authored.length > 0 ? (
            <>
              <h3 className="rep-h">Authored content</h3>
              <ul className="v-list">
                {authored.slice(0, 5).map((item) => (
                  <li key={item.key}>
                    <span className="v-row">
                      <span className="v-row-main">
                        <strong>{item.title}</strong>
                        <small>
                          {item.kind === "thesis" ? `Thesis · ${item.status}` : item.kind === "post" ? "Question/insight" : "Answer"}
                          {item.circleSlug ? ` · ${item.circleSlug}` : ""} · {item.at.toISOString().slice(0, 10)}
                        </small>
                      </span>
                      <small className={`rep-status rep-${thesisTone(item.status)}`}>{item.status}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                Theses are hypotheses, not predictions. Self-resolved theses are not independently validated.
              </p>
            </>
          ) : null}
          {circles.length > 0 ? (
            <p className="muted small">Circles contributed to: {circles.slice(0, 6).join(" · ")}</p>
          ) : null}
        </>
      )}
      {visibility === "private" && pending > 0 ? (
        <p className="muted small">{pending} submission{pending === 1 ? "" : "s"} awaiting review — pending work earns no verified credit.</p>
      ) : null}
    </section>
  );
}
