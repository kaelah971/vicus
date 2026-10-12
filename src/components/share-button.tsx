"use client";

import { useState } from "react";

export function ShareButton({ title, path }: { title: string; path: string }) {
  const [state, setState] = useState<"idle" | "copied" | "shared" | "failed">("idle");

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        setState("shared");
        return;
      }
      throw new Error("no-native-share");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setState("copied");
      } catch {
        setState("failed");
      }
    }
  }

  return (
    <button className="button button-glass button-small" onClick={share} type="button">
      Share
      {state === "copied" ? " ✓" : state === "shared" ? " ✓" : state === "failed" ? " — copy the URL" : ""}
    </button>
  );
}
