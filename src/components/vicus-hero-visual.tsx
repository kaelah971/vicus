"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const VicusHeroScene = dynamic(() => import("./vicus-hero-scene"), { ssr: false });

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function VicusHeroVisual() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const handleReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), {
      rootMargin: "120px",
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div aria-hidden="true" className="hero-scene" data-ready={ready || undefined} ref={stageRef}>
      <div className="hero-scene-canvas">
        <VicusHeroScene active={active} onReady={handleReady} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
