// Court pace from scorelines alone (pure, unit tested). Faster conditions make serve harder to
// break: more 6-4s and 7-6s, fewer 6-1s, for the same two players. For each event, find the
// serve-point rate that makes the observed set scores most likely given each match's pre-match
// chance (exact set-score probabilities from the serve model), shrunk toward the tour average.

import { setScores } from "@/lib/scorelines";

export interface PaceMatch {
  /** Pre-match chance for player 1, the format, and each set's games [player 1, player 2]. */
  p1: number;
  bestOf: 3 | 5;
  sets: [number, number][];
}

export const PACE_GRID = Array.from({ length: 36 }, (_, i) => Math.round((0.4 + i * 0.01) * 100) / 100);

type Row = { s: number; lp: Map<string, number> };
const tables = new Map<number, Row[]>();

/** For a serve rate: set-score log-probabilities for a range of serve gaps, with each gap's set-win chance. */
function table(rate: number): Row[] {
  let t = tables.get(rate);
  if (!t) {
    t = [];
    for (let d = -0.3; d <= 0.3001; d += 0.005) {
      const model = { a: rate + d / 2, b: rate - d / 2, bestOf: 3 as const };
      const merged = new Map<string, number>();
      for (const o of [...setScores(model, 1), ...setScores(model, 0)]) merged.set(`${o.a}-${o.b}`, (merged.get(`${o.a}-${o.b}`) ?? 0) + o.p / 2);
      const s = [...merged].filter(([k]) => Number(k.split("-")[0]) > Number(k.split("-")[1])).reduce((x, [, v]) => x + v, 0);
      t.push({ s, lp: new Map([...merged].map(([k, v]) => [k, Math.log(Math.max(1e-9, v))])) });
    }
    tables.set(rate, t);
  }
  return t;
}

/** The per-set chance that gives a match chance, treating sets as independent. */
function setChance(p: number, bestOf: 3 | 5): number {
  const match = (s: number) => (bestOf === 3 ? s * s * (3 - 2 * s) : s ** 3 * (10 - 15 * s + 6 * s * s));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (match(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Log-probability of each possible set score (player 1's side) for a match chance, format and serve rate. */
function setLogProbs(p: number, bestOf: 3 | 5, rate: number): Map<string, number> {
  const target = setChance(Math.min(0.995, Math.max(0.005, p)), bestOf);
  const t = table(rate);
  let best = t[0];
  for (const row of t) if (Math.abs(row.s - target) < Math.abs(best.s - target)) best = row;
  return best.lp;
}

/** Total log-likelihood of an event's set scores at a serve rate. */
export function logLikelihood(matches: PaceMatch[], rate: number): number {
  let ll = 0;
  for (const m of matches) {
    const lp = setLogProbs(m.p1, m.bestOf, rate);
    for (const [a, b] of m.sets) ll += lp.get(`${a}-${b}`) ?? Math.log(1e-9);
  }
  return ll;
}

/**
 * The event's serve rate: the grid value with the highest likelihood plus a normal prior around the
 * tour average (sd `priorSd`), so small events stay near average. Returns the rate and its sets.
 */
export function fitPace(matches: PaceMatch[], tourAverage: number, priorSd = 0.02): { rate: number; sets: number } {
  const sets = matches.reduce((s, m) => s + m.sets.length, 0);
  let best = tourAverage;
  let bestScore = -Infinity;
  for (const rate of PACE_GRID) {
    const score = logLikelihood(matches, rate) - (rate - tourAverage) ** 2 / (2 * priorSd ** 2);
    if (score > bestScore) {
      bestScore = score;
      best = rate;
    }
  }
  return { rate: best, sets };
}

/**
 * Tiebreaks played against tiebreaks expected (given each match's chance, at a serve rate), as
 * percentage points of sets: a simpler pace signal that doesn't need the rate to be identified.
 */
export function tiebreakExcess(matches: PaceMatch[], rate: number): { excess: number; sets: number } {
  let expected = 0;
  let observed = 0;
  let sets = 0;
  for (const m of matches) {
    const lp = setLogProbs(m.p1, m.bestOf, rate);
    const pTb = Math.exp(lp.get("7-6") ?? -20) + Math.exp(lp.get("6-7") ?? -20);
    for (const [a, b] of m.sets) {
      expected += pTb;
      observed += a + b === 13 ? 1 : 0;
      sets++;
    }
  }
  return { excess: sets ? ((observed - expected) / sets) * 100 : 0, sets };
}
