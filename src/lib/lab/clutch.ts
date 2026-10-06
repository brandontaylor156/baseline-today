// Clutch index (pure, unit tested). For each match, the point-level model (fitted to the
// pre-match chance) gives the chance of winning a tiebreak and a deciding set in that matchup.
// A player's clutch score compares tiebreaks and deciders actually won with those expectations.

import { liveChance, serveModelFor } from "@/lib/live-prob";
import { SERVE_AVERAGE } from "@/lib/party";

export interface ClutchMatch {
  tour: "atp" | "wta";
  key1: string;
  key2: string;
  winner: 1 | 2;
  bestOf: 3 | 5;
  /** Player 1's pre-match chance. */
  p1: number;
  /** Completed sets, player 1 first. */
  sets: [number, number][];
}

export interface ClutchTally {
  n: number;
  won: number;
  expected: number;
  /** Sum of p(1 − p): the variance of the number won, for a z-score. */
  variance: number;
}

export interface ClutchRow {
  key: string;
  tour: "atp" | "wta";
  tiebreaks: ClutchTally;
  deciders: ClutchTally;
}

const cache = new Map<string, { tiebreak: number; decider: number }>();

/** Player 1's chance to win a tiebreak and a deciding set, from their pre-match chance (to 0.005). */
export function expectedFor(p1: number, bestOf: 3 | 5, tour: "atp" | "wta"): { tiebreak: number; decider: number } {
  const p = Math.min(0.995, Math.max(0.005, Math.round(p1 * 200) / 200));
  const key = `${p}|${bestOf}|${tour}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const model = serveModelFor(p, bestOf, SERVE_AVERAGE[tour]);
  const need = Math.ceil(bestOf / 2) - 1;
  // In a deciding set, winning the set is winning the match; average over who serves first.
  const at = (games: number, tiebreak: boolean) =>
    (liveChance(model, { setsA: need, setsB: need, gamesA: games, gamesB: games, pointsA: 0, pointsB: 0, serverA: true, tiebreak }) +
      liveChance(model, { setsA: need, setsB: need, gamesA: games, gamesB: games, pointsA: 0, pointsB: 0, serverA: false, tiebreak })) /
    2;
  const out = { tiebreak: at(6, true), decider: at(0, false) };
  cache.set(key, out);
  return out;
}

const empty = (): ClutchTally => ({ n: 0, won: 0, expected: 0, variance: 0 });
const add = (t: ClutchTally, won: boolean, p: number) => {
  t.n++;
  if (won) t.won++;
  t.expected += p;
  t.variance += p * (1 - p);
};

export function clutchStats(matches: ClutchMatch[]): ClutchRow[] {
  const rows = new Map<string, ClutchRow>();
  const row = (key: string, tour: "atp" | "wta") => {
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { key, tour, tiebreaks: empty(), deciders: empty() }));
    return r;
  };
  for (const m of matches) {
    const e = expectedFor(m.p1, m.bestOf, m.tour);
    const a = row(m.key1, m.tour);
    const b = row(m.key2, m.tour);
    for (const [x, y] of m.sets) {
      if (!((x === 7 && y === 6) || (x === 6 && y === 7))) continue;
      add(a.tiebreaks, x > y, e.tiebreak);
      add(b.tiebreaks, y > x, 1 - e.tiebreak);
    }
    // The match went the distance: its last set was the decider.
    if (m.sets.length === m.bestOf) {
      add(a.deciders, m.winner === 1, e.decider);
      add(b.deciders, m.winner === 2, 1 - e.decider);
    }
  }
  return [...rows.values()];
}

/** Standard score of a tally: how many standard deviations above expectation. */
export const zScore = (t: ClutchTally) => (t.variance > 0 ? (t.won - t.expected) / Math.sqrt(t.variance) : 0);
