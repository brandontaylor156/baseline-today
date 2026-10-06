"use client";

import { useEffect, useMemo, useState } from "react";

import { PlayerPicker } from "@/components/player-picker";
import type { RatingWeek } from "@/lib/data/lab";
import { reachChances, seededBracket } from "@/lib/lab/bracket";
import { bestOfFive, calibrate, winProbability, type Rating, type Surface } from "@/lib/model/elo";

export type Seed = { id: number; name: string };
type Slot = Seed & { when: "now" | "peak" };
type History = { weeks: RatingWeek[] };

const toRating = (w: RatingWeek): Rating => ({ overall: w.overall, surface: { hard: w.hard, clay: w.clay, grass: w.grass }, matches: 99, surfaceMatches: { hard: 99, clay: 99, grass: 99 } });
const pct = (p: number) => (p >= 0.995 ? "99%+" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const ROUNDS: Record<number, string[]> = { 8: ["SF", "Final", "Title"], 16: ["QF", "SF", "Final", "Title"] };

/** Any 8 or 16 players (now or at their peak) in a seeded draw: exact chances to reach every round. */
export function DreamDraw({ presets, calibration }: { presets: Record<string, { tour: "atp" | "wta"; when: "now" | "peak"; players: Seed[] }>; calibration: Record<string, number> }) {
  const first = Object.keys(presets)[0];
  const [preset, setPreset] = useState(first);
  const [size, setSize] = useState<8 | 16>(8);
  const [slots, setSlots] = useState<Slot[]>(() => presets[first].players.slice(0, 8).map((p) => ({ ...p, when: presets[first].when })));
  const [history, setHistory] = useState<Map<number, History>>(new Map());
  const [surface, setSurface] = useState<Surface>("hard");
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const tour = presets[preset].tour;

  // Rating histories for everyone in the draw (fetched once each).
  useEffect(() => {
    const missing = slots.map((s) => s.id).filter((id) => !history.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      // No history yet: the model's starting rating, so the draw still computes.
      const fallback: History = { weeks: [{ week: "", overall: 1500, hard: 1500, clay: 1500, grass: 1500, matches: 0 }] };
      const got = await Promise.all(
        missing.map(async (id) => {
          const res = await fetch(`/api/lab/ratings/${id}`).catch(() => null);
          const h = res?.ok ? ((await res.json()) as History) : null;
          return [id, h?.weeks?.length ? h : fallback] as const;
        }),
      );
      if (!cancelled) setHistory((h) => new Map([...h, ...got]));
    })();
    return () => {
      cancelled = true;
    };
  }, [slots, history]);

  function load(name: string, n: 8 | 16) {
    setPreset(name);
    setSize(n);
    setSlots(presets[name].players.slice(0, n).map((p) => ({ ...p, when: presets[name].when })));
  }

  const ratingOf = (s: Slot): RatingWeek | null => {
    const weeks = history.get(s.id)?.weeks;
    if (!weeks?.length) return null;
    return s.when === "peak" ? weeks.reduce((b, w) => (w.overall > b.overall ? w : b), weeks[0]) : weeks[weeks.length - 1];
  };

  const result = useMemo(() => {
    const rated = slots.map((s) => ({ s, w: ratingOf(s) }));
    if (rated.some((r) => !r.w)) return null;
    // Seed by overall rating, best first.
    const seeded = [...rated].sort((a, b) => b.w!.overall - a.w!.overall);
    const keyOf = (r: (typeof rated)[number]) => `${r.s.id}|${r.s.when}`;
    const byKey = new Map(seeded.map((r) => [keyOf(r), r]));
    const tree = seededBracket(seeded.map(keyOf));
    if (!tree) return null;
    const c = calibration[tour] ?? 1;
    const p = (a: string, b: string) => {
      const q = calibrate(winProbability(toRating(byKey.get(a)!.w!), toRating(byKey.get(b)!.w!), surface), c);
      return bestOf === 5 ? bestOfFive(q) : q;
    };
    const reach = reachChances(tree, p);
    return seeded.map((r, i) => ({ seed: i + 1, ...r, reach: reach.get(keyOf(r))! })).sort((a, b) => b.reach.at(-1)! - a.reach.at(-1)!);
    // ratingOf depends on history, already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, history, surface, bestOf, tour, calibration]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {Object.keys(presets).map((name) => (
          <span key={name} className="inline-flex overflow-hidden rounded-lg border border-border">
            {([8, 16] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => load(name, n)}
                aria-pressed={preset === name && size === n}
                className={`px-2.5 py-1.5 ${preset === name && size === n ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}
              >
                {name} · {n}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <label>
          <span className="mr-2 text-xs text-muted">Surface</span>
          <select value={surface} onChange={(e) => setSurface(e.target.value as Surface)} className="rounded-lg border border-border bg-background px-3 py-1.5">
            <option value="hard">Hard</option>
            <option value="clay">Clay</option>
            <option value="grass">Grass</option>
          </select>
        </label>
        <label>
          <span className="mr-2 text-xs text-muted">Format</span>
          <select value={bestOf} onChange={(e) => setBestOf(Number(e.target.value) as 3 | 5)} className="rounded-lg border border-border bg-background px-3 py-1.5">
            <option value={3}>Best of three</option>
            <option value={5}>Best of five</option>
          </select>
        </label>
      </div>

      {!result ? (
        <p className="text-sm text-muted">Loading ratings…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Chances to reach each round in this draw</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Seed</th>
                <th scope="col" className="px-2 py-2 font-medium">Player</th>
                <th scope="col" className="px-2 py-2 font-medium">Version</th>
                {ROUNDS[size].map((r) => (
                  <th key={r} scope="col" className="px-2 py-2 text-right font-medium">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map((r) => (
                <tr key={`${r.s.id}-${r.s.when}`}>
                  <td className="px-3 py-2 text-muted">{r.seed}</td>
                  <th scope="row" className="px-2 py-2 text-left font-medium">
                    {r.s.name}
                  </th>
                  <td className="px-2 py-2">
                    <select
                      aria-label={`${r.s.name}: current or peak rating`}
                      value={r.s.when}
                      onChange={(e) => setSlots((all) => all.map((x) => (x.id === r.s.id ? { ...x, when: e.target.value as "now" | "peak" } : x)))}
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                    >
                      <option value="now">Now ({Math.round(history.get(r.s.id)!.weeks.at(-1)!.overall)})</option>
                      <option value="peak">Peak ({Math.round(Math.max(...history.get(r.s.id)!.weeks.map((w) => w.overall)))})</option>
                    </select>
                  </td>
                  {r.reach.slice(1).map((x, i) => (
                    <td key={i} className={`px-2 py-2 text-right ${i === r.reach.length - 2 ? "font-semibold" : ""}`}>
                      {pct(x)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-accent">Swap a player</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-muted">Take out</span>
            <select id="swap-out" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5">
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <PlayerPicker
            label="Put in"
            tour={tour}
            onPick={(p) => {
              const out = Number((document.getElementById("swap-out") as HTMLSelectElement | null)?.value);
              if (slots.some((s) => s.id === p.id)) return;
              setSlots((all) => all.map((s) => (s.id === out ? { id: p.id, name: p.fullName, when: "now" } : s)));
            }}
          />
        </div>
      </details>
    </div>
  );
}
