"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { SearchResult } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";

const DEBOUNCE_MS = 200;

/** Live player search (ARIA combobox). Without JavaScript it submits to /search. */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLFormElement>(null);

  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) {
          setResults(await res.json());
          setActive(-1);
          setOpen(true);
        }
      } catch {
        // Aborted by a newer keystroke, or offline: keep the previous results.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    router.push(`/players/${result.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && term.length >= 2;

  return (
    <form ref={boxRef} action="/search" role="search" className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search players
      </label>
      <input
        id={`${listId}-input`}
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search players…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching players"
          className="absolute inset-x-0 top-full mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No players found</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => {
                  e.preventDefault();
                  go(r);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-surface-muted" : ""}`}
              >
                <span className="truncate">{r.fullName}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {TOUR_LABEL[r.tour]}
                  {r.currentRank ? ` #${r.currentRank}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </form>
  );
}
