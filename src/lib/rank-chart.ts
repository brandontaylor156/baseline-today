// Pure geometry for the ranking-history chart (unit tested).

export interface RankPoint {
  date: string; // YYYY-MM-DD
  rank: number;
  points: number | null;
}

/**
 * Splits a player's history into continuous runs: a run breaks when the tour published a
 * ranking week in between in which the player was not in our top 100.
 */
export function segments(history: RankPoint[], tourDates: string[]): RankPoint[][] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const weeks = [...tourDates].sort();
  const indexOf = new Map(weeks.map((d, i) => [d, i]));
  const runs: RankPoint[][] = [];
  for (const p of sorted) {
    const prev = runs.at(-1)?.at(-1);
    const gap = prev && (indexOf.get(p.date) ?? 0) - (indexOf.get(prev.date) ?? 0) > 1;
    if (!prev || gap) runs.push([p]);
    else runs.at(-1)!.push(p);
  }
  return runs;
}

/** Rank axis: 1 at the top, down to a clean bound just past the worst rank shown. */
export function rankDomain(history: RankPoint[]): [number, number] {
  const worst = Math.max(1, ...history.map((p) => p.rank));
  const steps = [5, 10, 20, 50, 100, 150, 200];
  return [1, steps.find((s) => s >= worst) ?? Math.ceil(worst / 50) * 50];
}

const TICKS: Record<number, number[]> = {
  5: [1, 3, 5],
  10: [1, 5, 10],
  20: [1, 10, 20],
  50: [1, 10, 25, 50],
  100: [1, 25, 50, 75, 100],
  150: [1, 50, 100, 150],
  200: [1, 50, 100, 150, 200],
};

/** Clean rank ticks for the domain, always including 1 and the bound. */
export function rankTicks([, max]: [number, number]): number[] {
  return TICKS[max] ?? [1, Math.round(max / 2), max];
}

/** Month starts between two dates, thinned to at most `max` ticks. */
export function monthTicks(from: string, to: string, max = 6): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  if (d.toISOString().slice(0, 10) < from) d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) out.push(d.toISOString().slice(0, 10));
  const every = Math.max(1, Math.ceil(out.length / max));
  return out.filter((_, i) => i % every === 0);
}

/** Index of the point nearest to a date (for the crosshair). */
export function nearestIndex(points: RankPoint[], time: number): number {
  let best = 0;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const dist = Math.abs(Date.parse(`${p.date}T00:00:00Z`) - time);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}
