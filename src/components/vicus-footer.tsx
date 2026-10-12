import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import s from "./vicus-footer.module.css";

/*
 * Landing footer — "The Tokenized Horizon".
 * Upper band: brand, statement, real navigation (live HTML).
 * Lower band, back to front:
 *   1. a pre-rendered cinematic environment (terrain, planet + ring, horizon light, river)
 *      — public/footer/horizon*.webp, art-directed for mobile, lazy-loaded via next/image;
 *   2. live atmosphere (horizon breath, lens streak, haze, river shimmer, orbit, stars);
 *   3–4. live glass/metal asset tokens with labels, linking to real Discover views;
 *   5. the journey line, then the legal row.
 * No JS runs here: every motion is a CSS keyframe on transform/opacity and all of it
 * stops under prefers-reduced-motion.
 */

const GITHUB_URL = "https://github.com/kaelah971/vicus";

type FooterLink = { label: string; href: string; external?: boolean };

const GROUPS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Explore",
    links: [
      { label: "Discover assets", href: "/discover" },
      { label: "Missions", href: "/missions" },
      { label: "Spaces", href: "/spaces" },
      { label: "Tokenization Lab", href: "/lab" },
      { label: "People", href: "/people" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Asset passports", href: "/discover" },
      { label: "Lessons", href: "/spaces" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Community", href: "/people" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "Host on Vicus", href: "/host" },
      { label: "Project spaces", href: "/spaces" },
      { label: "Activation campaigns", href: "/missions?type=onchain_action" },
      { label: "Apply for a Space", href: "/host" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "Built on Stellar", href: "https://stellar.org", external: true },
      { label: "Stellar hub", href: "/ecosystems/stellar" },
    ],
  },
];

const JOURNEY = ["Discover", "Learn", "Use", "Earn", "Share", "Return"];

type NodeKind = "stellar" | "stable" | "rwa" | "treasury" | "commodity";

const NODES: Array<{ kind: NodeKind; label: [string, string?]; href: string; tone: string }> = [
  { kind: "stellar", label: ["Stellar", "ecosystem"], href: "/ecosystems/stellar", tone: "196, 170, 255" },
  { kind: "stable", label: ["Stablecoins"], href: "/discover?class=stablecoin", tone: "86, 150, 255" },
  { kind: "rwa", label: ["Real-world", "assets"], href: "/discover", tone: "168, 104, 255" },
  { kind: "treasury", label: ["Treasuries", "& funds"], href: "/discover?class=treasury_fund", tone: "56, 214, 130" },
  { kind: "commodity", label: ["Commodities"], href: "/discover?class=commodity", tone: "255, 152, 84" },
];

const SYMBOL_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.6,
};

function NodeSymbol({ kind }: { kind: NodeKind }) {
  return (
    <svg aria-hidden="true" className={s.symbol} focusable="false" shapeRendering="geometricPrecision" viewBox="0 0 24 24">
      {kind === "stellar" && (
        <>
          <defs>
            <mask id="vf-stellar-cut" maskUnits="userSpaceOnUse">
              <rect fill="#fff" height="24" width="24" />
              <path d="M2.87 13.97 19.93 7.07M4.07 16.93 21.13 10.03" stroke="#000" strokeLinecap="round" strokeWidth="4.4" />
            </mask>
          </defs>
          <circle {...SYMBOL_STROKE} cx="12" cy="12" mask="url(#vf-stellar-cut)" r="7.2" />
          <path {...SYMBOL_STROKE} d="M2.87 13.97 19.93 7.07M4.07 16.93 21.13 10.03" />
        </>
      )}
      {kind === "stable" && (
        <path
          {...SYMBOL_STROKE}
          d="M12 4.5v15M15.6 8.6c-.5-1.4-1.9-2.3-3.7-2.3-2.1 0-3.7 1.1-3.7 2.8 0 3.9 7.6 2 7.6 5.9 0 1.7-1.7 2.8-3.9 2.8-1.9 0-3.4-.9-3.9-2.4"
        />
      )}
      {kind === "rwa" && (
        <path {...SYMBOL_STROKE} d="M5 19.5V9l7-4.2L19 9v10.5M3.5 19.5h17M9 11.5v5.5M12 11.5v5.5M15 11.5v5.5" />
      )}
      {kind === "treasury" && (
        <path
          {...SYMBOL_STROKE}
          d="M12 20v-7M12 13c0-3.9 2.7-6.8 7-6.8 0 4-2.8 6.8-7 6.8ZM12 15.2c0-3-2.2-5.2-5.6-5.2 0 3.1 2.3 5.2 5.6 5.2Z"
        />
      )}
      {kind === "commodity" && (
        <path {...SYMBOL_STROKE} d="M12 3.8 19.2 8v8L12 20.2 4.8 16V8Zm-7.2 4.2L12 12.2 19.2 8M12 12.2v8" />
      )}
    </svg>
  );
}

function HorizonNode({ kind, label, href, tone }: (typeof NODES)[number]) {
  return (
    <Link
      aria-label={label.filter(Boolean).join(" ")}
      className={`${s.node} ${s[`node_${kind}`]}`}
      href={href}
      style={{ "--tone-rgb": tone } as CSSProperties}
    >
      <span className={s.nodeDrift}>
        <span aria-hidden="true" className={s.nodeLabel}>
          {label[0]}
          {label[1] ? <br /> : null}
          {label[1]}
        </span>
        <span aria-hidden="true" className={s.leader} />
        <span className={s.nodeBody}>
          <span aria-hidden="true" className={s.reflection} />
          <span aria-hidden="true" className={s.ground} />
          {kind === "stellar" ? <span aria-hidden="true" className={s.halo} /> : null}
          <span className={s.token}>
            <span aria-hidden="true" className={s.aura} />
            <span className={s.face}>
              <NodeSymbol kind={kind} />
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}

function FooterAnchor({ link, children, className }: { link: FooterLink; children: ReactNode; className?: string }) {
  return link.external ? (
    <a className={className} href={link.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link className={className} href={link.href}>
      {children}
    </Link>
  );
}

/* Deterministic sky glints (percent of the stage), so server render is stable. */
function glints(seed: number, count: number) {
  let value = seed;
  const next = () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
  return Array.from({ length: count }, () => ({
    left: `${(next() * 100).toFixed(2)}%`,
    top: `${(4 + next() * 26).toFixed(2)}%`,
    size: next() > 0.75 ? 3 : 2,
  }));
}

const GLINTS = [glints(7, 7), glints(23, 6), glints(41, 6)];

const RIVER_MASK = { "--river-mask": "url(/footer/horizon-river.webp)" } as CSSProperties;

export function VicusFooter() {
  const year = new Date().getFullYear();

  return (
    <footer aria-labelledby="vicus-footer-title" className={s.footer}>
      <div className={`shell ${s.upper}`}>
        <div className={s.brand}>
          <Link aria-label="Vicus home" className={s.mark} href="/">
            <svg aria-hidden="true" focusable="false" height="22" viewBox="0 0 24 24" width="22">
              <defs>
                <linearGradient id="vf-mark" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#b48cff" />
                </linearGradient>
              </defs>
              <path d="M12 2c.7 5.6 3.4 8.6 10 10-6.6 1.4-9.3 4.4-10 10-.7-5.6-3.4-8.6-10-10 6.6-1.4 9.3-4.4 10-10Z" fill="url(#vf-mark)" />
            </svg>
            <span>VICUS</span>
          </Link>
          <h2 className={s.statement} id="vicus-footer-title">
            Where tokenized assets find their people.
          </h2>
          <p className={s.support}>Discover. Learn. Use. Contribute.</p>
          <div className={s.social}>
            <a aria-label="Vicus on GitHub" className={s.socialButton} href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
              <svg aria-hidden="true" focusable="false" height="17" viewBox="0 0 24 24" width="17">
                <path
                  d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"
                  fill="currentColor"
                />
              </svg>
            </a>
          </div>
        </div>

        <nav aria-label="Footer" className={s.columns}>
          {GROUPS.map((group) => (
            <div className={s.group} key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    <FooterAnchor className={s.link} link={link}>
                      {link.label}
                      {link.external ? (
                        <svg aria-hidden="true" className={s.ext} focusable="false" height="11" viewBox="0 0 24 24" width="11">
                          <path d="M7 17 17 7m-8 0h8v8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                      ) : null}
                      {link.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
                    </FooterAnchor>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className={s.scene}>
        <div className={s.stage} style={RIVER_MASK}>
          {/* Layer 1 — cinematic environment */}
          <Image
            alt=""
            className={`${s.env} ${s.envWide}`}
            fill
            sizes="(max-width: 1013px) 1013px, 100vw"
            src="/footer/horizon.webp"
          />
          {/* Lazy + display:none outside its breakpoint, so each viewport fetches one crop only. */}
          <Image alt="" className={`${s.env} ${s.envMobile}`} fill sizes="100vw" src="/footer/horizon-mobile.webp" />

          {/* Layer 2 — live atmosphere */}
          <div aria-hidden="true" className={s.atmosphere}>
            {GLINTS.map((group, index) => (
              <div className={`${s.glints} ${s[`glints${index}`]}`} key={index}>
                {group.map((glint, key) => (
                  <span key={key} style={{ height: glint.size, left: glint.left, top: glint.top, width: glint.size }} />
                ))}
              </div>
            ))}
            <svg className={s.orbit} focusable="false" preserveAspectRatio="none" viewBox="0 0 200 60">
              <ellipse cx="100" cy="30" fill="none" pathLength="100" rx="99" ry="29" stroke="url(#vf-orbit-fade)" strokeDasharray="0.35 1.4" strokeWidth="0.35" />
              <defs>
                <linearGradient id="vf-orbit-fade" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#c9b2ff" stopOpacity="0" />
                  <stop offset="0.3" stopColor="#c9b2ff" stopOpacity="0.55" />
                  <stop offset="0.7" stopColor="#e6dcff" stopOpacity="0.6" />
                  <stop offset="1" stopColor="#c9b2ff" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div className={s.haze} />
            <div className={s.sunBreath} />
            <div className={s.streak} />
            <div className={s.river}>
              <div className={s.riverFlow} />
            </div>
          </div>

          {/* Layers 3–4 — live tokens + labels */}
          <div className={s.nodes}>
            {NODES.map((node) => (
              <HorizonNode key={node.kind} {...node} />
            ))}
          </div>
        </div>

        <div aria-hidden="true" className={s.floorFade} />

        <ol aria-label="The Vicus journey" className={s.journey}>
          {JOURNEY.map((step, index) => (
            <li key={step}>
              <span className={s.step}>{step}</span>
              {index < JOURNEY.length - 1 ? (
                <span aria-hidden="true" className={s.arrow}>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className={`shell ${s.legal}`}>
        <span>© {year} Vicus</span>
        <p>
          A learning community for tokenized assets — not financial advice. Asset access and reward eligibility vary
          by issuer and region.
        </p>
        <span className={s.micro}>Stellar-first. Multi-ecosystem aware.</span>
      </div>
    </footer>
  );
}
