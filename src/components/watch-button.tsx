"use client";

import { useState } from "react";
import { Icon } from "@/components/vicus";

export function WatchButton() {
  const [isPreviewing, setIsPreviewing] = useState(false);

  return (
    <div className="watch-control">
      <button
        aria-pressed={isPreviewing}
        className="button button-white"
        onClick={() => setIsPreviewing((current) => !current)}
        type="button"
      >
        <span>{isPreviewing ? "Watching in preview" : "Watch circle"}</span>
        <Icon name={isPreviewing ? "check" : "arrow-right"} size={16} />
      </button>
      <span className="control-note">Preview only · nothing is saved</span>
    </div>
  );
}
