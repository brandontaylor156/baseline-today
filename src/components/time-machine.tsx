"use client";

import { useEffect, useMemo, useState } from "react";

import { PlayerPicker } from "@/components/player-picker";
import type { RatingWeek } from "@/lib/data/lab";
import { bestOfFive, calibrate, winProbability, type Rating, type Surface } from "@/lib/model/elo";

type History = { id: number; name: string; tour: "atp" | "wta"; weeks: RatingWeek[] };
type Choice = { history: History | null; when: string };

const label = (week: string) => new Date(`${week}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** Moments to pick from: their peak, then the end of each season they played. */
function moments(h: History): { value: string; text: string }[] {
  const peak = h.weeks.reduce((b, w) => (w.overall > b.overall ? w : b), h.weeks[0]);
  const seasonEnds = new Map<string, RatingWeek>();
  for (const w of h.weeks) if (w.matches >= 10) seasonEnds.set(w.week.slice(0, 4), w);
  return [
    { value: peak.week, text: `Peak (${label(peak.week)}, ${Math.round(peak.overall)})` },
    ...[...seasonEnds.entries()].reverse().map(([year, w]) => ({ value: w.week, text: `End of ${year} (${Math.round(w.overall)})` })),
  ];
}

const toRating = (w: RatingWeek): Rating => ({
  overall: w.overall,
  surface: { hard: w.hard, clay: w.clay, grass: w.grass },
  matches: w.matches,
  surfaceMatches: { hard: 99, clay: 99, grass: 99 },
});

function Side({ title, choice, setChoice, tour, initialId }: { title: string; choice: Choice; setChoice: (c: Choice) => void; tour?: "atp" | "wta"; initialId?: number }) {
  async function load(id: number) {
    const res = await fetch(`/api/lab/ratings/${id}`);
    if (!res.ok) return setChoice({ history: null, when: "" });
    const h = (await res.json()) as History;
    setChoice({ history: h, when: moments(h)[0].value });
  }
  useEffect(() => {
    if (initialId) void load(initialId);
    // Load the example once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const opts = choice.history ? moments(choice.history) : [];
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {choice.history && <p className="font-semibold">{choice.history.name}</p>}
      <PlayerPicker label={choice.history ? "Change player" : "Player"} tour={tour} onPick={(p) => void load(p.id)} />
      {opts.length > 0 && (
        <label className="block text-sm">
          <span className="text-xs text-muted">When</span>
          <select value={choice.when} onChange={(e) => setChoice({ ...choice, when: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5">
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Two players at any point in their careers: the model's chance on any surface. */
export function TimeMachine({ calibration, example }: { calibration: Record<string, number>; example: [number, number] | null }) {
  const [a, setA] = useState<Choice>({ history: null, when: "" });
  const [b, setB] = useState<Choice>({ history: null, when: "" });
  const [surface, setSurface] = useState<Surface | "">("hard");
  const [bestOf, setBestOf] = useState<3 | 5>(3);

  const result = useMemo(() => {
    const wa = a.history?.weeks.find((w) => w.week === a.when);
    const wb = b.history?.weeks.find((w) => w.week === b.when);
    if (!wa || !wb || !a.history || !b.history || a.history.tour !== b.history.tour) return null;
    const q = calibrate(winProbability(toRating(wa), toRating(wb), surface || null), calibration[a.history.tour] ?? 1);
    return { p: bestOf === 5 ? bestOfFive(q) : q, wa, wb };
  }, [a, b, surface, bestOf, calibration]);

  const tourMismatch = a.history && b.history && a.history.tour !== b.history.tour;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Side title="Player 1" choice={a} setChoice={setA} initialId={example?.[0]} />
        <Side title="Player 2" choice={b} setChoice={setB} tour={a.history?.tour} initialId={example?.[1]} />
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <label>
          <span className="mr-2 text-xs text-muted">Surface</span>
          <select value={surface} onChange={(e) => setSurface(e.target.value as Surface | "")} className="rounded-lg border border-border bg-background px-3 py-1.5">
            <option value="hard">Hard</option>
            <option value="clay">Clay</option>
            <option value="grass">Grass</option>
            <option value="">Any (overall)</option>
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
      {tourMismatch && <p className="text-sm text-muted">Pick two players from the same tour: ATP and WTA ratings aren’t on the same scale.</p>}
      {result && a.history && b.history && (
        <section aria-live="polite" className="rounded-xl border border-accent/50 bg-accent-soft p-4 sm:p-5">
          <p className="text-sm text-muted">
            {a.history.name} ({label(a.when)}) vs {b.history.name} ({label(b.when)})
          </p>
          <div className="mt-2 flex items-center justify-between text-2xl font-semibold tabular-nums">
            <span>{Math.round(result.p * 100)}%</span>
            <span className="text-sm font-normal text-muted">chance to win</span>
            <span>{Math.round((1 - result.p) * 100)}%</span>
          </div>
          <div aria-hidden className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface">
            <span className="bg-chart-line" style={{ width: `${result.p * 100}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Ratings {Math.round(result.wa.overall)} vs {Math.round(result.wb.overall)} overall
            {surface ? `, ${Math.round(result.wa[surface])} vs ${Math.round(result.wb[surface])} on ${surface}` : ""}. Ratings are relative
            to each era’s field, so a cross-era matchup asks who dominated their own time more, not who would win on the same day.
          </p>
        </section>
      )}
    </div>
  );
}
