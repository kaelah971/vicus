import Link from "next/link";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/*
 * Vicus visual primitives. Pure presentational components with no data access, so they are
 * safe to use from server and client components alike. Every primitive takes real values
 * from its caller; nothing here invents data.
 */

export type Tone = "white" | "violet" | "blue" | "green" | "pink" | "orange";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ---------------- Icons ---------------- */

export type GlyphName =
  | "arrow"
  | "arrow-up-right"
  | "bar"
  | "bolt"
  | "book"
  | "build"
  | "building"
  | "cash"
  | "chat"
  | "check"
  | "coins"
  | "compass"
  | "credit"
  | "eye"
  | "gift"
  | "globe"
  | "grid"
  | "heart"
  | "home"
  | "layers"
  | "lock"
  | "pay"
  | "question"
  | "receive"
  | "redeem"
  | "search"
  | "send"
  | "shield"
  | "spark"
  | "star"
  | "swap"
  | "target"
  | "transfer"
  | "trend"
  | "user"
  | "users";

const GLYPH_PATHS: Record<GlyphName, string> = {
  arrow: "M4 12h15m-6-6 6 6-6 6",
  "arrow-up-right": "M6 18 18 6m-9 0h9v9",
  bar: "M3 19h18M5 19l2-6h4l2 6m-2-6 2-6h4l2 6",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  book: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5m0-15v15m0 0A1.5 1.5 0 0 0 6.5 21H19",
  build: "m9 7-5 5 5 5m6-10 5 5-5 5",
  building: "M3 9 12 4l9 5M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 20h18",
  cash: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  chat: "M5 5h14v10H9l-4 4V5Z",
  check: "m5 12 4.5 4.5L19 7",
  coins: "M7 8c0-1.7 2.2-3 5-3s5 1.3 5 3-2.2 3-5 3-5-1.3-5-3Zm0 0v4c0 1.7 2.2 3 5 3s5-1.3 5-3V8m-10 4v4c0 1.7 2.2 3 5 3s5-1.3 5-3v-4",
  compass: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
  credit: "M4 20V11m5.3 9V6m5.4 14v-6M20 20V9",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  gift: "M4 11h16v9H4zM3 7h18v4H3zm9 0v13M12 7C10.5 3.5 7 4 8 6.5 8.5 7.6 12 7 12 7Zm0 0c1.5-3.5 5-3 4-.5-.5 1.1-4 .5-4 .5Z",
  globe: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-9 9h18M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z",
  grid: "M4 4h6.5v6.5H4zm9.5 0H20v6.5h-6.5zM4 13.5h6.5V20H4zm9.5 0H20V20h-6.5z",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z",
  home: "M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  layers: "m12 4 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  pay: "M3 6h18v12H3zM3 10h18M7 15h3",
  question: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-2.5 7a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4V15m0 2.5v.01",
  receive: "M12 4v12m-5-5 5 5 5-5M5 20h14",
  redeem: "M4.5 12A7.5 7.5 0 1 0 7 6.4M4 3.5V8h4.5",
  search: "M10.8 5a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6ZM16 16l4 4",
  send: "M21 3 3 10.5l7.2 2.3L12.5 20 21 3Zm-10.8 9.8L15 8",
  shield: "M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Zm-3 9 2.2 2.2L15.5 10",
  spark: "M12 3v5m0 8v5M3 12h5m8 0h5M5.6 5.6l3.5 3.5m5.8 5.8 3.5 3.5m0-12.8-3.5 3.5m-5.8 5.8-3.5 3.5",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z",
  swap: "M7 4 3 8l4 4M3 8h14m0 12 4-4-4-4m4 4H7",
  target: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 3.7a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z",
  transfer: "M4 8h15l-3.5-3.5M20 16H5l3.5 3.5",
  trend: "m3 17 6-6 4 4 8-8m-6 0h6v6",
  user: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4.5 20.5c1.3-3.6 4.2-5 7.5-5s6.2 1.4 7.5 5",
  users: "M9 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM2.5 20c1-3.2 3.5-4.7 6.5-4.7s5.5 1.5 6.5 4.7M16 5.3a3.5 3.5 0 0 1 0 6.4m2 3.8c1.6.6 2.8 2 3.5 4.5",
};

export function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d={GLYPH_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.7}
      />
    </svg>
  );
}

/* ---------------- Domain → visual identity ---------------- */

type Meta = { label: string; tone: Tone; icon: GlyphName };

export const ASSET_CLASSES: Array<Meta & { value: string; short: string }> = [
  { value: "stablecoin", label: "Stablecoins", short: "Tokenized money", tone: "blue", icon: "coins" },
  { value: "treasury_fund", label: "Treasuries & Funds", short: "Tokenized treasuries", tone: "green", icon: "building" },
  { value: "equity_fund", label: "Equities", short: "Tokenized equities", tone: "violet", icon: "trend" },
  { value: "fixed_income", label: "Fixed Income", short: "Tokenized bonds", tone: "blue", icon: "lock" },
  { value: "commodity", label: "Commodities", short: "Tokenized commodities", tone: "orange", icon: "bar" },
  { value: "private_credit", label: "Private Credit", short: "Tokenized credit", tone: "pink", icon: "credit" },
  { value: "alternative", label: "Alternatives", short: "Tokenized alternatives", tone: "pink", icon: "spark" },
  { value: "real_estate", label: "Real Estate", short: "Tokenized property", tone: "violet", icon: "home" },
  { value: "other_financial", label: "Other", short: "Other assets", tone: "white", icon: "layers" },
];

export function assetClassMeta(category: string): Meta {
  return ASSET_CLASSES.find((entry) => entry.value === category) ?? { label: category, tone: "white", icon: "book" };
}

const ECOSYSTEMS: Record<string, { label: string; tone: Tone; mark: string }> = {
  stellar: { label: "Stellar", tone: "white", mark: "S" },
  ethereum: { label: "Ethereum", tone: "violet", mark: "E" },
  base: { label: "Base", tone: "blue", mark: "B" },
  solana: { label: "Solana", tone: "green", mark: "S" },
};

export function ecosystemMeta(ecosystem: string | null | undefined, label?: string | null) {
  const key = (ecosystem ?? "").toLowerCase();
  const known = ECOSYSTEMS[key];
  return {
    label: label ?? known?.label ?? (ecosystem || "Multi-ecosystem"),
    tone: known?.tone ?? ("white" as Tone),
    mark: known?.mark ?? (ecosystem?.[0]?.toUpperCase() || "•"),
  };
}

const CAPABILITY_META: Record<string, { tone: Tone; icon: GlyphName }> = {
  send: { tone: "blue", icon: "send" },
  receive: { tone: "green", icon: "receive" },
  pay: { tone: "orange", icon: "pay" },
  cash_out: { tone: "orange", icon: "cash" },
  swap: { tone: "violet", icon: "swap" },
  transfer: { tone: "blue", icon: "transfer" },
  build: { tone: "violet", icon: "build" },
  invest: { tone: "green", icon: "trend" },
  redeem: { tone: "pink", icon: "redeem" },
  collateral: { tone: "pink", icon: "lock" },
  save: { tone: "green", icon: "coins" },
};

export function capabilityMeta(type: string) {
  return CAPABILITY_META[type] ?? { tone: "white" as Tone, icon: "spark" as GlyphName };
}

const MISSION_TYPES: Record<string, Meta> = {
  quiz: { label: "Learn", tone: "blue", icon: "book" },
  text: { label: "Contribute", tone: "pink", icon: "chat" },
  research: { label: "Research", tone: "orange", icon: "search" },
  onchain_action: { label: "Use", tone: "green", icon: "bolt" },
};

export function missionTypeMeta(type: string): Meta {
  return MISSION_TYPES[type] ?? { label: type, tone: "violet", icon: "target" };
}

/* ---------------- Atoms ---------------- */

export function Orb({
  tone = "violet",
  icon,
  size = "md",
  children,
}: {
  tone?: Tone;
  icon?: GlyphName;
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
}) {
  return (
    <span aria-hidden="true" className={cx("v-orb", `v-orb-${size}`, `tone-${tone}`)}>
      {icon ? <Glyph name={icon} size={size === "lg" ? 22 : size === "sm" ? 14 : 18} /> : children}
    </span>
  );
}

function tokenMark(code: string) {
  const upper = code.toUpperCase();
  if (upper.includes("USD") && upper !== "USDY") return { text: "$" };
  if (upper === "USDY") return { icon: "building" as GlyphName };
  if (upper === "EDUCATION") return { icon: "book" as GlyphName };
  return { text: upper.slice(0, 2) };
}

/** CSS-rendered dark token with a white embossed mark and a network badge (matches the hero tokens). */
export function AssetToken({
  code,
  ecosystem,
  ecosystemLabel,
  size = "md",
}: {
  code: string;
  ecosystem?: string | null;
  ecosystemLabel?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const mark = tokenMark(code);
  const eco = ecosystem ? ecosystemMeta(ecosystem, ecosystemLabel) : null;
  return (
    <span aria-hidden="true" className={cx("v-token", `v-token-${size}`)}>
      <span className="v-token-face">
        {mark.icon ? <Glyph name={mark.icon} size={size === "xl" ? 54 : size === "lg" ? 34 : size === "sm" ? 14 : 22} /> : mark.text}
      </span>
      {eco ? <span className={cx("v-token-badge", `tone-${eco.tone}`)}>{eco.mark}</span> : null}
    </span>
  );
}

export function EcoChip({ ecosystem, label }: { ecosystem?: string | null; label?: string | null }) {
  const eco = ecosystemMeta(ecosystem, label);
  return (
    <span className={cx("v-chip", `tone-${eco.tone}`)}>
      <span aria-hidden="true" className="v-chip-dot" />
      {eco.label}
    </span>
  );
}

export function Chip({ children, tone, icon }: { children: ReactNode; tone?: Tone; icon?: GlyphName }) {
  return (
    <span className={cx("v-chip", tone && `tone-${tone}`)}>
      {icon ? <Glyph name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md", tone }: { name: string; size?: "sm" | "md" | "lg"; tone?: Tone }) {
  const letters =
    name
      .replace(/^@/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "V";
  const tones: Tone[] = ["violet", "blue", "green", "pink", "orange"];
  const hashed = tones[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length];
  return (
    <span aria-hidden="true" className={cx("v-avatar", `v-avatar-${size}`, `tone-${tone ?? hashed}`)}>
      {letters}
    </span>
  );
}

/* ---------------- Molecules ---------------- */

export function SectionHead({
  eyebrow,
  title,
  line,
  action,
  center = false,
  id,
}: {
  eyebrow?: string;
  title: ReactNode;
  line?: ReactNode;
  action?: ReactNode;
  center?: boolean;
  id?: string;
}) {
  return (
    <div className={cx("v-section-head", center && "v-section-head-center")}>
      <div>
        {eyebrow ? <span className="v-eyebrow">{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
        {line ? <p>{line}</p> : null}
      </div>
      {action ? <div className="v-section-head-action">{action}</div> : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  tone = "white",
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone?: Tone;
  icon?: GlyphName;
  hint?: string;
}) {
  return (
    <div className={cx("v-metric", `tone-${tone}`)} title={hint}>
      {icon ? <Orb icon={icon} size="sm" tone={tone} /> : null}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export type FlowStep = {
  label: string;
  icon: GlyphName;
  tone?: Tone;
  line?: string;
  state?: "done" | "active" | "todo";
};

export function StepFlow({
  steps,
  variant = "row",
  label,
}: {
  steps: FlowStep[];
  variant?: "row" | "compact";
  label?: string;
}) {
  return (
    <ol aria-label={label} className={cx("v-flow", `v-flow-${variant}`)}>
      {steps.map((step, index) => (
        <li
          className={cx("v-flow-step", step.state && `is-${step.state}`)}
          key={step.label}
          style={{ "--i": index } as CSSProperties}
        >
          <Orb icon={step.state === "done" ? "check" : step.icon} size={variant === "compact" ? "sm" : "lg"} tone={step.tone ?? "violet"} />
          <span className="v-flow-label">{step.label}</span>
          {step.line ? <span className="v-flow-line">{step.line}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export type ActionItem = {
  key: string;
  label: string;
  href: string;
  tone: Tone;
  icon: GlyphName;
  state?: string;
  live?: boolean;
  external?: boolean;
};

/** Frosted control surface of luminous action orbs (Send / Receive / Build …). */
export function ActionTray({ actions, layout = "grid" }: { actions: ActionItem[]; layout?: "grid" | "stack" }) {
  return (
    <div className={cx("v-action-tray", `v-action-tray-${layout}`)}>
      {actions.map((action) => {
        const body = (
          <>
            <Orb icon={action.icon} size="lg" tone={action.tone} />
            <span className="v-action-text">
              <strong>{action.label}</strong>
              {action.state ? (
                <small>
                  <span aria-hidden="true" className={cx("v-state-dot", action.live && "is-live")} />
                  {action.state}
                </small>
              ) : null}
            </span>
          </>
        );
        return action.external ? (
          <a className="v-action" href={action.href} key={action.key} rel="noreferrer" target="_blank">
            {body}
          </a>
        ) : (
          <Link className="v-action" href={action.href} key={action.key}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

export function TabBar({ items, label }: { items: Array<{ href: string; label: string; count?: number }>; label: string }) {
  return (
    <nav aria-label={label} className="v-tabbar">
      <div className="v-tabbar-inner">
        {items.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
            {typeof item.count === "number" ? <span>{item.count}</span> : null}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function PhoneFrame({
  children,
  className,
  edgeTone,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** When set, the device outline carries the travelling edge light in this tone. */
  edgeTone?: Tone;
  label?: string;
}) {
  return (
    <figure aria-label={label} className={cx("v-phone", edgeTone && cx(edgeClass("live"), `tone-${edgeTone}`), className)}>
      {edgeTone ? <EdgeLight /> : null}
      <span aria-hidden="true" className="v-phone-island" />
      <div className="v-phone-screen">{children}</div>
    </figure>
  );
}

/** Distinct strip for an open onchain activation mission. */
export function MissionStrip({
  href,
  title,
  context,
  points,
  reward,
  rewardNetwork,
  proofNetwork = "Stellar Mainnet",
  cta = "Start activation",
}: {
  href: string;
  title: string;
  context?: string;
  points: number;
  reward: string;
  rewardNetwork?: string | null;
  proofNetwork?: string;
  cta?: string;
}) {
  const hasReward = reward !== "No reward configured";
  return (
    <Link className={cx("v-mission-strip", edgeClass("live"), "tone-green")} href={href}>
      <EdgeLight />
      <span className="v-mission-strip-tag">
        <span aria-hidden="true" className="v-state-dot is-live" /> Mission available
      </span>
      <span className="v-mission-strip-main">
        <strong>{title}</strong>
        {context ? <small>{context}</small> : null}
      </span>
      <StepFlow
        label="Activation steps"
        steps={[
          { icon: "bolt", label: "Use", tone: "green" },
          { icon: "shield", label: "Prove", tone: "blue" },
          { icon: "gift", label: "Earn", tone: "white" },
        ]}
        variant="compact"
      />
      <span className="v-mission-strip-meta">
        <span className="v-chip tone-violet">{points} pts</span>
        {hasReward ? (
          <span className="v-chip tone-white">
            {reward}
            {rewardNetwork ? ` · ${rewardNetwork}` : ""}
          </span>
        ) : null}
        <span className="v-chip">Proof · {proofNetwork}</span>
      </span>
      <span className="v-mission-strip-cta">
        {cta} <Glyph name="arrow" size={16} />
      </span>
    </Link>
  );
}

/* ---------------- Travelling edge light ---------------- */

export type EdgeState = "live" | "slow";

/** Class names for the travelling perimeter light. An accent — apply selectively. */
export function edgeClass(state: EdgeState = "live") {
  return cx("v-edge", state === "slow" && "v-edge-slow");
}

/**
 * The light itself: a rounded rect tracing the host's border (pathLength 100), drawn as a
 * dim tail, a mid section and a bright head. Place as the FIRST child of a `.v-edge` host.
 */
export function EdgeLight() {
  return (
    <svg aria-hidden="true" className="v-edge-svg" focusable="false">
      <rect className="v-edge-bloom-wide" pathLength={100} />
      <rect className="v-edge-bloom" pathLength={100} />
      <rect className="v-edge-tail" pathLength={100} />
      <rect className="v-edge-mid" pathLength={100} />
      <rect className="v-edge-head" pathLength={100} />
    </svg>
  );
}

/**
 * Card whose border carries one luminous segment travelling clockwise from the top-left.
 * Pure CSS (see `.v-edge` in vicus-system.css); `phase` offsets neighbouring cards.
 */
export function AnimatedEdgeCard({
  as: Tag = "div",
  children,
  className,
  phase = 0,
  state = "live",
  tone,
  ...rest
}: {
  as?: "div" | "section" | "article" | "aside";
  children: ReactNode;
  className?: string;
  phase?: number;
  state?: EdgeState;
  tone?: Tone;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag
      className={cx(edgeClass(state), tone && `tone-${tone}`, className)}
      style={{ "--edge-phase": phase } as CSSProperties}
      {...rest}
    >
      <EdgeLight />
      {children}
    </Tag>
  );
}

export function GlowField({ tones = ["violet", "blue"] as Tone[] }: { tones?: Tone[] }) {
  return (
    <span aria-hidden="true" className="v-glow-field">
      {tones.map((tone, index) => (
        <span className={cx("v-glow", `tone-${tone}`)} key={`${tone}-${index}`} style={{ "--i": index } as CSSProperties} />
      ))}
    </span>
  );
}
