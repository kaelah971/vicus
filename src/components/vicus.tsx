import Link from "next/link";
import type { ReactNode } from "react";
import type { Circle, MissionPreview } from "@/lib/vicus-data";
import type { CircleVerificationSummary } from "@/lib/data/types";
import type { SubmissionStatus } from "@/lib/missions/types";
import { AssetToken, EcoChip, EdgeLight, Glyph, Orb, assetClassMeta, edgeClass, missionTypeMeta } from "@/components/vicus-ui";

export type IconName =
  | "arrow-right"
  | "arrow-up-right"
  | "check"
  | "chevron-down"
  | "external"
  | "lock"
  | "plus"
  | "search"
  | "spark";

type CircleView = Circle & { verification?: CircleVerificationSummary };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function plural(count: number, one: string, many?: string) {
  return `${count} ${count === 1 ? one : (many ?? `${one}s`)}`;
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {name === "arrow-right" && <path {...common} d="M4 12h15m-6-6 6 6-6 6" />}
      {name === "arrow-up-right" && <path {...common} d="M5 19 19 5m-9 0h9v9" />}
      {name === "check" && <path {...common} d="m5 12 4.5 4.5L19 7" />}
      {name === "chevron-down" && <path {...common} d="m6 9 6 6 6-6" />}
      {name === "external" && (
        <>
          <path {...common} d="M14 5h5v5M19 5l-8 8" />
          <path {...common} d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect {...common} height="10" rx="2" width="14" x="5" y="10" />
          <path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === "plus" && <path {...common} d="M12 5v14M5 12h14" />}
      {name === "search" && (
        <>
          <circle {...common} cx="10.8" cy="10.8" r="5.8" />
          <path {...common} d="m16 16 4 4" />
        </>
      )}
      {name === "spark" && (
        <>
          <path {...common} d="M12 3v5m0 8v5M3 12h5m8 0h5M5.6 5.6l3.5 3.5m5.8 5.8 3.5 3.5m0-12.8-3.5 3.5m-5.8 5.8-3.5 3.5" />
          <circle {...common} cx="12" cy="12" r="2.2" />
        </>
      )}
    </svg>
  );
}

export function VicusWordmark({ href = "/" }: { href?: string }) {
  return (
    <Link aria-label="Vicus home" className="wordmark" href={href}>
      VICUS
    </Link>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="marketing-nav">
        <div className="shell marketing-nav-inner">
          <VicusWordmark />
        </div>
      </header>
      {children}
    </>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

export function ButtonLink({
  children,
  href,
  variant = "white",
  className,
  external = false,
}: {
  children: ReactNode;
  href: string;
  variant?: "white" | "outline" | "violet" | "text" | "glass" | "gradient";
  className?: string;
  external?: boolean;
}) {
  return (
    <Link
      className={cx("button", `button-${variant}`, className)}
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {children}
      {external && <Icon name="external" size={15} />}
    </Link>
  );
}

export function StatusPill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "violet" | "blue" | "muted" | "green";
}) {
  return <span className={cx("status-pill", `status-${tone}`)}>{children}</span>;
}

export function Badge({
  children,
  tone = "muted",
  demo = false,
}: {
  children: ReactNode;
  tone?: "violet" | "blue" | "muted" | "green";
  demo?: boolean;
}) {
  return (
    <span className={cx("badge", `badge-${tone}`, demo && "badge-demo")}>
      {children}
      {demo && <span className="badge-suffix">example</span>}
    </span>
  );
}

export function PortalVisual({
  compact = false,
  label = "Watch · portal · proof",
  className,
}: {
  compact?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cx("portal-visual", compact && "portal-visual-compact", className)}>
      <div aria-hidden="true" className="portal-stage">
        <span className="portal-track portal-track-one" />
        <span className="portal-track portal-track-two" />
        <span className="portal-glow portal-glow-one" />
        <span className="portal-glow portal-glow-two" />
        <span className="portal-orb">
          <span className="portal-orb-shine" />
        </span>
        <span className="portal-portal">
          <span className="portal-portal-core" />
        </span>
        <span className="portal-coin portal-coin-one" />
        <span className="portal-coin portal-coin-two" />
        <span className="portal-ring" />
        <span className="portal-ring portal-ring-two" />
      </div>
      <div className="portal-caption">
        <span>{label}</span>
        <span className="portal-caption-note">Static motion study</span>
      </div>
    </div>
  );
}

export function HairlineCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("hairline-card", className)}>{children}</div>;
}

function circleStatusTone(circle: Circle) {
  if (circle.state === "education") return "blue" as const;
  if (circle.state === "community") return "violet" as const;
  return "muted" as const;
}

export function CircleCard({
  circle,
  variant = "default",
  issuer,
  actionLabels,
}: {
  circle: CircleView;
  variant?: "default" | "feature" | "compact";
  /** Registry issuer shown on home-layer cards; omitted elsewhere. */
  issuer?: string | null;
  /** Engine-derived current actions; when provided they replace the generic row. */
  actionLabels?: string[];
}) {
  const roleAvailable = Boolean(circle.verification?.enabled);
  const assetClass = assetClassMeta(circle.category);

  return (
    <Link
      aria-label={`Open ${circle.name} circle`}
      className={cx(
        "circle-card",
        "asset-card",
        `asset-card-${variant}`,
        `tone-${assetClass.tone}`,
        // Only the featured asset carries the edge light; regular asset cards stay calm.
        variant === "feature" && edgeClass("live"),
      )}
      href={`/circles/${circle.slug}`}
    >
      {variant === "feature" ? <EdgeLight /> : null}
      <span aria-hidden="true" className="asset-card-glow" />
      <div className="asset-card-top">
        <AssetToken
          code={circle.code}
          ecosystem={circle.ecosystem ?? circle.network}
          ecosystemLabel={circle.ecosystemLabel}
          size={variant === "feature" ? "xl" : variant === "compact" ? "sm" : "md"}
        />
        <StatusPill tone={circleStatusTone(circle)}>{circle.stateLabel}</StatusPill>
      </div>
      <div className="asset-card-body">
        <h3>{circle.name}</h3>
        <span className="asset-card-class">{circle.assetClassLabel ?? circle.category}</span>
        {issuer ? <span className="asset-card-issuer">{issuer}</span> : null}
        {variant !== "compact" ? <p className="asset-card-line">{circle.summary}</p> : null}
      </div>
      <div className="asset-card-foot">
        <EcoChip ecosystem={circle.ecosystem ?? circle.network} label={circle.ecosystemLabel} />
        <span aria-label="Circle status" className="asset-card-acts">
          {actionLabels ? (
            actionLabels.length > 0 ? (
              actionLabels.slice(0, 3).map((label) => <span key={label}>{label}</span>)
            ) : null
          ) : (
            <>
              {circle.watched ? <span>Watching</span> : null}
              {roleAvailable ? <span>Role check</span> : null}
            </>
          )}
        </span>
        <span className="asset-card-open">
          Open <Icon name="arrow-right" size={15} />
        </span>
      </div>
    </Link>
  );
}

export function AssetPassport({
  circle,
  compact = false,
}: {
  circle: CircleView;
  compact?: boolean;
}) {
  return (
    <section className={cx("passport", compact && "passport-compact")} id="passport">
      <div className="passport-header">
        <div>
          <Eyebrow>Asset Passport</Eyebrow>
          <h2>Key facts</h2>
        </div>
        <StatusPill tone={circleStatusTone(circle)}>{circle.stateLabel}</StatusPill>
      </div>

      <dl className="passport-meta">
        <div>
          <dt>Asset</dt>
          <dd>{circle.code}</dd>
        </div>
        <div>
          <dt>Ecosystem</dt>
          <dd>{circle.ecosystemLabel ?? circle.ecosystem ?? circle.network}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{circle.network}</dd>
        </div>
        <div>
          <dt>Asset class</dt>
          <dd>{circle.assetClassLabel ?? circle.category}</dd>
        </div>
        <div>
          <dt>Source / status</dt>
          <dd>{circle.sourceStatus}</dd>
        </div>
      </dl>

      <div className="passport-body">
        <details className="passport-disclosure">
          <summary><Glyph name="book" size={14} /> What it is</summary>
          <p>{circle.description}</p>
        </details>
        <details className="passport-disclosure">
          <summary><Glyph name="shield" size={14} /> Eligibility / access</summary>
          <p>{circle.eligibilityNote}</p>
        </details>
        <details className="passport-disclosure passport-risk">
          <summary><Glyph name="lock" size={14} /> Risk and disclosure</summary>
          <p>{circle.riskNote}</p>
        </details>
      </div>

      <details className="passport-more">
        <summary>
          Full passport details <Icon name="chevron-down" size={15} />
        </summary>
        <div className="passport-body">
          <div className="passport-copy-block">
            <span className="field-label">Ecosystem</span>
            <p>
              {circle.ecosystemLabel ?? circle.ecosystem ?? circle.network} · {circle.network} · {circle.assetClassLabel ?? circle.category}.
              Vicus Circles stay compatible with future ecosystems, but role checks here remain Stellar-only.
            </p>
          </div>
          <div className="passport-copy-block">
            <span className="field-label">Asset identity</span>
            <p>
              {circle.code} · {circle.issuerSource}. Vicus shows only stored source-backed identity — no issuer,
              price, market-cap, or availability claims beyond what is recorded.
            </p>
          </div>
          <div className="passport-copy-block">
            <span className="field-label">What it does not promise</span>
            <p>
              No prices, yields, market caps, availability, or returns are stated or implied here. {circle.intendedUse}
            </p>
          </div>
        </div>
      </details>

      <div className="passport-footer">
        <div className="passport-source">
          <span className="field-label">Source status</span>
          <span className="source-status">{circle.sourceStatus}</span>
        </div>
        <div className="passport-source">
          <span className="field-label">Official sources</span>
          {circle.sourceUrl ? (
            <a href={circle.sourceUrl} rel="noreferrer" target="_blank">
              {circle.sourceLabel} <Icon name="external" size={14} />
            </a>
          ) : (
            <span className="source-status">{circle.sourceLabel}</span>
          )}
        </div>
        <div className="passport-source passport-verified">
          <span className="field-label">Last verified</span>
          <span>{circle.lastVerified}</span>
        </div>
      </div>

      {!compact && (
        <div className="passport-actions">
          <span className="field-label">Supported Vicus actions</span>
          <div className="action-tags">
            {circle.actions.map((action) => (
              <span className="action-tag" key={action}>
                <Icon name="check" size={14} /> {action}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type MissionCardData = MissionPreview & {
  id?: string;
  points?: number;
  status?: string;
  submissionStatus?: SubmissionStatus | null;
};

function missionStatusLabel(mission: MissionCardData) {
  if (mission.submissionStatus === "approved") return "Approved";
  if (mission.submissionStatus === "pending") return "Pending review";
  if (mission.submissionStatus === "needs_revision") return "Needs revision";
  if (mission.submissionStatus === "rejected") return "Rejected";
  if (mission.status === "open") return "Open";
  if (mission.status === "scheduled") return "Scheduled";
  if (mission.status === "closed") return "Closed";
  return "Preview only";
}

function missionStatusTone(mission: MissionCardData): "violet" | "blue" | "muted" | "green" {
  if (mission.submissionStatus === "approved") return "green";
  if (mission.submissionStatus === "pending") return "blue";
  if (mission.submissionStatus === "needs_revision") return "violet";
  return "muted";
}

function missionActionLabel(mission: MissionCardData) {
  if (mission.submissionStatus === "needs_revision") return "Revise response";
  if (mission.submissionStatus) return "View submission";
  return mission.status === "open" ? "Start mission" : "Read mission details";
}

/** Compact challenge tile: type colour, title, asset/network, points, reward, state, one CTA. */
export function MissionCard({
  mission,
  circle,
}: {
  mission: MissionCardData;
  circle?: { name: string; slug: string; ecosystemLabel?: string };
}) {
  const href = mission.id ? `/missions/${mission.id}` : null;
  const typeMeta = missionTypeMeta(mission.type);
  const hasReward = Boolean(mission.reward) && mission.reward !== "No reward configured";
  // Edge light follows real state: actionable → live, pending review → slow,
  // approved → static success, anything else (closed, rejected, scheduled) → calm.
  const actionable =
    mission.status === "open" && (!mission.submissionStatus || mission.submissionStatus === "needs_revision");
  const edge = actionable
    ? edgeClass("live")
    : mission.submissionStatus === "pending"
      ? edgeClass("slow")
      : null;

  return (
    <article
      className={cx(
        "mission-card",
        "mission-tile",
        `tone-${typeMeta.tone}`,
        edge,
        mission.submissionStatus === "approved" && "is-approved",
      )}
    >
      {edge ? <EdgeLight /> : null}
      <div className="mission-tile-top">
        <Orb icon={typeMeta.icon} size="md" tone={typeMeta.tone} />
        <span className="mission-tile-type">{typeMeta.label}</span>
        <StatusPill tone={missionStatusTone(mission)}>{missionStatusLabel(mission)}</StatusPill>
      </div>
      <h3>{href ? <Link href={href}>{mission.title}</Link> : mission.title}</h3>
      {circle ? (
        <span className="mission-tile-context">
          {circle.name}
          {circle.ecosystemLabel ? ` · ${circle.ecosystemLabel}` : ""}
        </span>
      ) : null}
      <div className="mission-tile-meta">
        <span className="v-chip tone-violet">{mission.points ?? "—"} pts</span>
        {hasReward ? (
          <span className="v-chip tone-white">
            <Glyph name="gift" size={13} /> {mission.reward}
          </span>
        ) : null}
        <span className="v-chip">{mission.review}</span>
      </div>
      <div className="mission-footer">
        {href ? (
          <Link className="mission-action-link" href={href}>
            {missionActionLabel(mission)} <Icon name="arrow-right" size={15} />
          </Link>
        ) : (
          <span>Mission details are not connected</span>
        )}
      </div>
    </article>
  );
}

export function RewardState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("reward-state", compact && "reward-state-compact")}>
      <div className="reward-state-header">
        <span className="state-orb state-orb-muted" />
        <StatusPill tone="blue">Reward path</StatusPill>
      </div>
      <h3>Native XLM settlement is available</h3>
      <p>
        Approved reward-enabled missions can create a real XLM transaction after wallet and network checks.
        Testnet XLM has no monetary value.
      </p>
      <dl className="reward-meta">
        <div>
          <dt>Eligibility</dt>
          <dd>Approved mission + verified wallet</dd>
        </div>
        <div>
          <dt>Settlement</dt>
          <dd>Direct native XLM payment</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>Durable transaction proof</dd>
        </div>
      </dl>
    </div>
  );
}

export function ActivityItem({
  label,
  title,
  detail,
  href,
}: {
  label: string;
  title: string;
  detail: string;
  href?: string;
}) {
  return (
    <div className="activity-item">
      <span className="activity-line" />
      <div>
        <span className="activity-label">{label}</span>
        <h3>{href ? <Link href={href}>{title}</Link> : title}</h3>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={cx("metric-card", accent && "metric-card-accent")}>
      <span className="field-label">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <Icon name="plus" size={18} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function DataState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state data-state">
      <span className="empty-mark">
        <Icon name="spark" size={18} />
      </span>
      <h3>{title}</h3>
      <div className="data-state-copy">{children}</div>
    </div>
  );
}
