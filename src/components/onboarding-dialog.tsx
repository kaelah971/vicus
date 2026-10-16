"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Glyph } from "@/components/vicus-ui";
import { INTERESTS } from "@/lib/interests";

export function OnboardingDialog({
  open,
  initialSelected,
  onComplete,
}: {
  open: boolean;
  initialSelected: string[];
  /** Called with the final selection (possibly empty). Never with null. */
  onComplete: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);

  // Sync when reopened for editing; focus the heading for screen readers.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelected(initialSelected);
      headingRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open, initialSelected]);

  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onComplete(selectedRef.current);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onComplete]);

  if (!open) return null;

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key]));
  }

  const cta = selected.length === 0 ? "Explore all assets" : "Explore my interests";

  return (
    <div className="v-onboard-root">
      <button type="button" className="v-onboard-backdrop" aria-label="Skip onboarding" onClick={() => onComplete(selected)} />
      <div
        className="v-onboard-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v-onboard-scroll">
          <p className="v-eyebrow">First visit · Stellar is home</p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            What are you interested in exploring?
          </h2>
          <p className="v-onboard-sub">
            Pick a few interests. We&apos;ll bring relevant assets forward so you can explore what they are
            and what you can do with them.
          </p>
          <div className="v-onboard-grid" role="group" aria-label="Asset interests">
            {INTERESTS.map((interest) => {
              const pressed = selected.includes(interest.key);
              return (
                <button
                  key={interest.key}
                  type="button"
                  aria-pressed={pressed}
                  className={`v-onboard-card${pressed ? " is-active" : ""}`}
                  onClick={() => toggle(interest.key)}
                >
                  <span className="v-onboard-mark" aria-hidden="true">
                    {interest.visual.type === "brand" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={interest.visual.src} alt="" loading="lazy" />
                    ) : (
                      <Glyph name={interest.visual.name} size={26} />
                    )}
                  </span>
                  <strong>{interest.label}</strong>
                  <small>{interest.blurb}</small>
                  <span className={`v-onboard-check${pressed ? " is-active" : ""}`} aria-hidden="true">
                    {pressed ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="v-onboard-actions">
            <button type="button" className="button button-violet" onClick={() => onComplete(selected)}>
              {cta}
            </button>
            <button type="button" className="button button-text" onClick={() => onComplete(selected)}>
              Skip for now
            </button>
          </div>
          <p className="v-onboard-fine">
            No wallet needed. Interests only order browsing on this device — they never grant access or imply suitability.
          </p>
        </div>
      </div>
    </div>
  );
}
