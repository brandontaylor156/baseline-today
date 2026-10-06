"use client";

import { useState } from "react";

import type { RatingWeek } from "@/lib/data/lab";

import { RatingChart } from "./rating-chart";

const VIEWS = [
  { key: "overall", label: "All courts" },
  { key: "hard", label: "Hard" },
  { key: "clay", label: "Clay" },
  { key: "grass", label: "Grass" },
] as const;

/** A player's weekly rating since 2015, overall or on one surface. */
export function RatingArc({ weeks }: { weeks: RatingWeek[] }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("overall");
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Surface" className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setView(v.key)}
            className={`px-2.5 py-1.5 ${view === v.key ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <RatingChart key={view} history={weeks.map((w) => ({ week: w.week, elo: w[view] }))} />
    </div>
  );
}
