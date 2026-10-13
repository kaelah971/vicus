"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph, type GlyphName } from "@/components/vicus-ui";

type MenuItem = { href: string; label: string; icon: GlyphName; section: string };
type MenuGroup = { heading: string; items: MenuItem[] };

/** Canonical href per section: only these highlight from the AppShell section. */
const PRIMARY_HREF: Record<string, string> = {
  discover: "/discover",
  use: "/use",
  circles: "/circles",
  activity: "/activity",
  profile: "/profile/me",
  missions: "/missions",
  rewards: "/rewards",
  spaces: "/spaces",
  lab: "/lab",
  host: "/host",
  admin: "/admin",
};

const PERSONAL_GROUPS: MenuGroup[] = [
  {
    heading: "Discover",
    items: [
      { href: "/discover", label: "Discover", icon: "compass", section: "discover" },
      { href: "/use", label: "Use", icon: "bolt", section: "use" },
      { href: "/circles", label: "Circles", icon: "grid", section: "circles" },
    ],
  },
  {
    heading: "Personal",
    items: [
      { href: "/activity", label: "Activity", icon: "chat", section: "activity" },
      { href: "/profile/me", label: "You", icon: "user", section: "profile" },
      { href: "/positions", label: "Positions", icon: "coins", section: "profile" },
      { href: "/watch", label: "Watch", icon: "eye", section: "profile" },
    ],
  },
  {
    heading: "Participate",
    items: [
      { href: "/missions", label: "Missions", icon: "target", section: "missions" },
      { href: "/rewards", label: "Rewards", icon: "gift", section: "rewards" },
    ],
  },
  {
    heading: "Tools",
    items: [
      { href: "/send", label: "Send", icon: "send", section: "use" },
      { href: "/contacts", label: "Contacts", icon: "users", section: "profile" },
    ],
  },
];

const PROJECT_GROUPS: MenuGroup[] = [
  {
    heading: "Build",
    items: [
      { href: "/spaces", label: "Spaces", icon: "layers", section: "spaces" },
      { href: "/lab", label: "Lab", icon: "spark", section: "lab" },
    ],
  },
  {
    heading: "For projects",
    items: [
      { href: "/host", label: "Host on Vicus", icon: "building", section: "host" },
      { href: "/admin", label: "Issuer access", icon: "lock", section: "admin" },
    ],
  },
];

/**
 * Spoke-pattern mobile navigation: a large light sheet over the dimmed
 * dark app. Personal/Projects segmented control only reorganizes links.
 */
export function MobileMenu({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"personal" | "projects">("personal");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pushedRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    // Browser-back pushed an entry on open; going back through it keeps
    // history honest. Direct closes just hide the sheet.
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      setOpen(false);
    }
  }, []);

  const openMenu = useCallback(() => {
    window.history.pushState({ vicusMenu: true }, "");
    pushedRef.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPopState = () => {
      pushedRef.current = false;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const groups = tab === "personal" ? PERSONAL_GROUPS : PROJECT_GROUPS;

  return (
    <>
      <button
        type="button"
        className="menu-trigger"
        aria-expanded={open}
        aria-controls="vicus-menu-sheet"
        aria-label="Open menu"
        onClick={() => (open ? close() : openMenu())}
      >
        <span aria-hidden="true" className="menu-trigger-lines" />
        Menu
      </button>

      {open ? (
        <div className="m-menu-root">
          <button type="button" className="m-menu-backdrop" aria-label="Close menu" onClick={close} />
          <div
            className="m-menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            id="vicus-menu-sheet"
          >
            <span className="m-menu-grab" aria-hidden="true" />
            <div className="m-menu-head">
              <strong>Menu</strong>
              <button
                ref={closeRef}
                type="button"
                className="m-menu-close"
                aria-label="Close menu"
                onClick={close}
              >
                ✕
              </button>
            </div>
            <div className="m-menu-seg" role="group" aria-label="Menu sections">
              {(["personal", "projects"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  className={tab === key ? "is-active" : undefined}
                  onClick={() => setTab(key)}
                >
                  {key === "personal" ? "Personal" : "Projects"}
                </button>
              ))}
            </div>
            <div className="m-menu-scroll">
              {groups.map((group) => {
                const folded = collapsed[group.heading] ?? false;
                const groupId = `m-menu-group-${group.heading.toLowerCase().replace(/[^a-z]+/g, "-")}`;
                return (
                  <section className="m-menu-group" key={group.heading}>
                    <button
                      type="button"
                      className="m-menu-group-head"
                      aria-expanded={!folded}
                      aria-controls={groupId}
                      onClick={() => setCollapsed((prev) => ({ ...prev, [group.heading]: !folded }))}
                    >
                      {group.heading}
                      <span aria-hidden="true" className="m-menu-chev">
                        {folded ? "▸" : "▾"}
                      </span>
                    </button>
                    {!folded ? (
                      <ul className="m-menu-list" id={groupId}>
                        {group.items.map((item) => {
                          const pathname =
                            typeof window !== "undefined" ? window.location.pathname : "";
                          const isActive =
                            pathname === item.href ||
                            (active === item.section && PRIMARY_HREF[item.section] === item.href);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={isActive ? "is-active" : undefined}
                                onClick={() => {
                                  pushedRef.current = false;
                                  setOpen(false);
                                }}
                              >
                                <Glyph name={item.icon} size={20} />
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
