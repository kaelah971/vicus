import "server-only";

import Link from "next/link";
import type { ReactNode } from "react";
import { listEcosystems } from "@/lib/data/circles";
import { VicusWordmark } from "@/components/vicus";
import { WalletAuthButton } from "@/components/wallet-auth";

export type AppShellSection = "discover" | "missions" | "profile" | "admin";

export async function AppShell({
  active,
  children,
}: {
  active?: AppShellSection;
  children: ReactNode;
}) {
  let ecosystems: Array<{ value: string; label: string }> = [];
  try {
    ecosystems = await listEcosystems();
  } catch {
    ecosystems = [];
  }

  const navLink = (section: AppShellSection) =>
    `nav-link sidebar-link${active === section ? " nav-link-active" : ""}`;

  return (
    <>
      <aside aria-label="Primary navigation" className="desktop-sidebar">
        <VicusWordmark />
        <nav className="sidebar-links">
          <Link aria-current={active === "discover" ? "page" : undefined} className={navLink("discover")} href="/discover">
            Discover
          </Link>
          <Link aria-current={active === "missions" ? "page" : undefined} className={navLink("missions")} href="/missions">
            Missions
          </Link>
          <Link aria-current={active === "profile" ? "page" : undefined} className={navLink("profile")} href="/profile/me">
            Profile
          </Link>
        </nav>
        {ecosystems.length > 0 ? (
          <div className="sidebar-ecosystems">
            <span className="sidebar-section-label">Ecosystems</span>
            {ecosystems.map((ecosystem) => (
              <Link className="sidebar-ecosystem-link" href={`/discover?ecosystem=${encodeURIComponent(ecosystem.value)}`} key={ecosystem.value}>
                {ecosystem.label}
              </Link>
            ))}
          </div>
        ) : null}
      </aside>
      <header className="site-nav">
        <div className="shell nav-inner">
          <div className="mobile-wordmark"><VicusWordmark /></div>
          <div className="nav-actions">
            <WalletAuthButton />
            <Link className="nav-issuer" href="/admin">
              Issuer access
            </Link>
          </div>
        </div>
      </header>
      <div className="app-content">{children}</div>
    </>
  );
}
