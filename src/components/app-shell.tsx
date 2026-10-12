import "server-only";

import Link from "next/link";
import type { ReactNode } from "react";
import { listEcosystems } from "@/lib/data/circles";
import { VicusWordmark } from "@/components/vicus";
import { Glyph, type GlyphName } from "@/components/vicus-ui";
import { WalletAuthButton } from "@/components/wallet-auth";

export type AppShellSection = "discover" | "missions" | "lab" | "spaces" | "profile" | "admin" | "ecosystems" | "host";

type NavItem = { section: AppShellSection | "rewards"; href: string; label: string; icon: GlyphName };

const PRIMARY_NAV: NavItem[] = [
  { section: "discover", href: "/discover", label: "Explore", icon: "compass" },
  { section: "missions", href: "/missions", label: "Missions", icon: "target" },
  { section: "lab", href: "/lab", label: "Lab", icon: "spark" },
  { section: "spaces", href: "/spaces", label: "Spaces", icon: "grid" },
  // Rewards live on the profile (no dedicated claim route); the tab deep-links there.
  { section: "rewards", href: "/profile/me#rewards", label: "Rewards", icon: "gift" },
  { section: "profile", href: "/profile/me", label: "Profile", icon: "user" },
];

function BottomNav({ active }: { active?: AppShellSection }) {
  return (
    <nav aria-label="Primary" className="bottom-nav">
      {PRIMARY_NAV.map((item) => {
        const current = item.section === active;
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={`bottom-nav-item${current ? " is-active" : ""}`}
            href={item.href}
            key={item.section}
          >
            <span aria-hidden="true" className="bottom-nav-icon">
              <Glyph name={item.icon} size={20} />
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export async function AppShell({
  active,
  activeEcosystem = null,
  children,
}: {
  active?: AppShellSection;
  activeEcosystem?: string | null;
  children: ReactNode;
}) {
  let ecosystems: Array<{ value: string; label: string }> = [];
  try {
    ecosystems = await listEcosystems();
  } catch {
    ecosystems = [];
  }

  const navLink = (section: AppShellSection | "rewards") =>
    `nav-link sidebar-link${active === section ? " nav-link-active" : ""}`;

  return (
    <>
      <aside aria-label="Primary navigation" className="desktop-sidebar">
        <VicusWordmark />
        <nav className="sidebar-links">
          {PRIMARY_NAV.map((item) => (
            <Link
              aria-current={active === item.section ? "page" : undefined}
              className={navLink(item.section)}
              href={item.href}
              key={item.section}
            >
              <span aria-hidden="true" className="sidebar-link-icon">
                <Glyph name={item.icon} size={18} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        {ecosystems.length > 0 ? (
          <div className="sidebar-ecosystems">
            <span className="sidebar-section-label">Ecosystems</span>
            {ecosystems.map((ecosystem) => (
              <Link
                aria-current={activeEcosystem === ecosystem.value ? "page" : undefined}
                className={`sidebar-ecosystem-link${activeEcosystem === ecosystem.value ? " nav-link-active" : ""}`}
                href={`/ecosystems/${encodeURIComponent(ecosystem.value)}`}
                key={ecosystem.value}
              >
                {ecosystem.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="sidebar-ecosystems">
          <span className="sidebar-section-label">For projects</span>
          <Link
            aria-current={active === "host" ? "page" : undefined}
            className={`sidebar-ecosystem-link${active === "host" ? " nav-link-active" : ""}`}
            href="/host"
          >
            Host on Vicus
          </Link>
        </div>
      </aside>
      <header className="site-nav">
        <div className="shell nav-inner">
          <div className="mobile-wordmark"><VicusWordmark /></div>
          <div className="nav-actions">
            <WalletAuthButton ecosystems={ecosystems} />
            <Link className="nav-issuer" href="/admin">
              Issuer access
            </Link>
          </div>
        </div>
      </header>
      <div className="app-content">{children}</div>
      <BottomNav active={active} />
    </>
  );
}
