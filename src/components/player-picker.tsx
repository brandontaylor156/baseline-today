"use client";

import { useEffect, useId, useState } from "react";

import type { SearchResult } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";
import type { Tour } from "@/lib/provider/types";

/** Search-as-you-type player picker for the head-to-head page (same tour only when given). */
export function PlayerPicker({
  label,
  tour,
  onPick,
}: {
  label: string;
  tour?: Tour;
  onPick: (player: SearchResult) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) setResults(((await res.json()) as SearchResult[]).filter((r) => !tour || r.tour === tour));
      } catch {
        // superseded by a newer keystroke
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, tour]);

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder={tour ? `Search ${TOUR_LABEL[tour]} players…` : "Search players…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {term.length >= 2 && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="truncate">{r.fullName}</span>
                <span className="shrink-0 text-xs text-muted">
                  {TOUR_LABEL[r.tour]}
                  {r.currentRank ? ` #${r.currentRank}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
