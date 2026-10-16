import Link from "next/link";
import { SectionHead } from "@/components/vicus-ui";
import { getLoyaltySummary } from "@/lib/loyalty/service";
import { LOYALTY_LEVELS } from "@/lib/loyalty/rules";

/**
 * P6.3 — Loyalty progress card. Server-rendered from verified records:
 * approved mission submissions only, each counted once. Zero activity
 * renders an honest empty state — never sample earnings or leaderboards.
 * Levels are recognition only (no monetary value, token, or eligibility).
 */
export async function LoyaltyCard({ userId, demo = false }: { userId: string; demo?: boolean }) {
  let summary = null;
  try {
    summary = await getLoyaltySummary(userId);
  } catch {
    summary = null;
  }
  if (!summary) {
    return (
      <section className="p-section" aria-labelledby="loyalty-title">
        <SectionHead eyebrow="Loyalty" id="loyalty-title" title="Progress" />
        <p className="muted">Loyalty progress is unavailable right now. No fallback progress is shown.</p>
      </section>
    );
  }
  const { progress, recent, counts } = summary;
  const span = progress.nextLevel ? progress.nextLevel.minXp - progress.level.minXp : 1;
  const pct = Math.min(100, Math.round((progress.xpIntoLevel / span) * 100));

  return (
    <section className="p-section" aria-labelledby="loyalty-title" data-loyalty="true">
      <SectionHead
        eyebrow="Loyalty"
        id="loyalty-title"
        title={`${progress.level.name} · ${progress.xp} pts`}
        line={
          progress.nextLevel
            ? `${progress.xpForNext} pts to ${progress.nextLevel.name} · streak ${progress.currentStreak}d · best ${progress.longestStreak}d`
            : `Top level · streak ${progress.currentStreak}d · best ${progress.longestStreak}d`
        }
      />
      {progress.eventCount === 0 ? (
        <p className="muted">
          No verified participation yet — progress starts at zero and only approved missions move it.{" "}
          <Link className="v-text-link" href="/discover">
            Explore missions →
          </Link>
        </p>
      ) : (
        <>
          <div className="loy-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${progress.nextLevel?.name ?? "top level"}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <ol className="loy-levels" aria-label="Levels">
            {LOYALTY_LEVELS.map((tier, i) => (
              <li key={tier.name} data-reached={i <= progress.levelIndex} aria-current={i === progress.levelIndex ? "step" : undefined}>
                <strong>{tier.name}</strong>
                <small>{tier.minXp} pts</small>
              </li>
            ))}
          </ol>
          {recent.length > 0 ? (
            <ul className="v-list">
              {recent.map((item) => (
                <li key={item.id}>
                  <Link className="v-row" href={`/missions/${item.missionId}`}>
                    <span className="v-row-main">
                      <strong>{item.missionTitle}</strong>
                      <small>
                        {item.circleName} · {item.at.toISOString().slice(0, 10)}
                      </small>
                    </span>
                    <small>+{item.points} pts</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {counts.pending > 0 || counts.needsWork > 0 ? (
        <p className="muted small">
          {counts.pending > 0 ? `${counts.pending} awaiting review` : ""}
          {counts.pending > 0 && counts.needsWork > 0 ? " · " : ""}
          {counts.needsWork > 0 ? `${counts.needsWork} need${counts.needsWork === 1 ? "s" : ""} work` : ""}
          {" — pending work never earns progress."}
        </p>
      ) : null}
      <p className="muted small">
        Levels recognize participation only — no monetary value, tokens, or eligibility.
        {demo ? " Demo participant record." : ""}
      </p>
    </section>
  );
}
