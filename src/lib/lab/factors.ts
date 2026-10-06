// What moves a match beyond the ratings (pure, unit tested). For every match, the model's pre-match
// chance plus the gap between the two players on factors the ratings don't see: tiredness from
// earlier rounds, a long last match, a deep run the week before, a long layoff, a change of surface,
// home soil. A logistic regression on top of the model's chance says what each is worth, in rating
// points, with an error bar; a holdout says whether they improve predictions at all.

import { playingDays } from "./comebacks";

export interface FactorMatch {
  /** The match row, for links. */
  id?: number;
  key1: string;
  key2: string;
  winner: 1 | 2;
  /** Model chance that player 1 wins, before the match. */
  p1: number;
  tournamentId: number;
  startDate: string;
  surface: string | null;
  /** Round order within the event (1 = first round). */
  round: number;
  country1: string | null;
  country2: string | null;
  host: string | null;
  bestOf: 3 | 5;
  /** Set scores [player 1, player 2]; empty for walkovers. */
  sets: [number, number][];
  walkover: boolean;
  /** Ended in a retirement. */
  retired?: boolean;
}

export const FACTORS = [
  { key: "load", label: "Games already played this event", unit: "per 10 games" },
  { key: "long", label: "Last match went the distance", unit: "yes vs no" },
  { key: "lastWeek", label: "Deep run the week before (semifinal or better)", unit: "yes vs no" },
  { key: "layoff", label: "First event back after 8+ weeks out", unit: "yes vs no" },
  { key: "newSurface", label: "First event on a new surface", unit: "yes vs no" },
  { key: "home", label: "Playing at home", unit: "yes vs no" },
  { key: "rookie", label: "Fewer than 20 matches on record", unit: "yes vs no" },
] as const;

export type FactorKey = (typeof FACTORS)[number]["key"];

export interface FactorRow {
  /** logit of the model's chance for player 1. */
  logit: number;
  /** Player 1 minus player 2 on each factor. */
  x: number[];
  y: 0 | 1;
  date: string;
}


interface EventState {
  tournamentId: number;
  startDate: string;
  surface: string | null;
  games: number;
  matches: number;
  lastLong: boolean;
}

/** One row per completed match (walkovers skipped), with each factor measured before the match. */
export function factorRows(matches: FactorMatch[]): FactorRow[] {
  const sorted = [...matches].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.tournamentId - b.tournamentId || a.round - b.round);
  const current = new Map<string, EventState>();
  const previous = new Map<string, EventState>();
  const played = new Map<string, number>();
  const rows: FactorRow[] = [];

  const stateFor = (key: string, m: FactorMatch): { now: EventState; prev: EventState | undefined } => {
    let now = current.get(key);
    if (!now || now.tournamentId !== m.tournamentId) {
      if (now) previous.set(key, now);
      now = { tournamentId: m.tournamentId, startDate: m.startDate, surface: m.surface, games: 0, matches: 0, lastLong: false };
      current.set(key, now);
    }
    return { now, prev: previous.get(key) };
  };

  const features = (key: string, now: EventState, prev: EventState | undefined, country: string | null, m: FactorMatch) => {
    const gap = prev ? (Date.parse(`${m.startDate}T00:00:00Z`) - Date.parse(`${prev.startDate}T00:00:00Z`)) / 86_400_000 : Infinity;
    return [
      now.games / 10,
      now.lastLong ? 1 : 0,
      prev && gap >= 5 && gap <= 9 && prev.matches >= 3 ? 1 : 0,
      prev && playingDays(prev.startDate, m.startDate) >= 56 ? 1 : 0,
      prev && m.surface && prev.surface && prev.surface !== m.surface ? 1 : 0,
      country && m.host && country === m.host ? 1 : 0,
      (played.get(key) ?? 0) < 20 ? 1 : 0,
    ];
  };

  for (const m of sorted) {
    const a = stateFor(m.key1, m);
    const b = stateFor(m.key2, m);
    if (!m.walkover && m.p1 > 0 && m.p1 < 1) {
      const fa = features(m.key1, a.now, a.prev, m.country1, m);
      const fb = features(m.key2, b.now, b.prev, m.country2, m);
      rows.push({ logit: Math.log(m.p1 / (1 - m.p1)), x: fa.map((v, i) => v - fb[i]), y: m.winner === 1 ? 1 : 0, date: m.startDate });
    }
    // After the match: games played and whether it went the distance (a deciding set).
    const games = m.sets.reduce((s, [x, y]) => s + x + y, 0);
    const long = m.sets.length === m.bestOf;
    for (const k of [m.key1, m.key2]) played.set(k, (played.get(k) ?? 0) + 1);
    for (const s of [a.now, b.now]) {
      s.games += games;
      s.matches += 1;
      s.lastLong = long;
    }
  }
  return rows;
}

export interface Fit {
  /** Coefficients: the model's logit first, then each factor. */
  beta: number[];
  se: number[];
}

/** Logistic regression (Newton's method) of the outcome on the model's logit and the factors. */
export function fitLogistic(rows: FactorRow[], use: boolean[] = FACTORS.map(() => true), iterations = 25): Fit {
  const cols = (r: FactorRow) => [r.logit, ...r.x.filter((_, i) => use[i])];
  const k = 1 + use.filter(Boolean).length;
  let beta = new Array(k).fill(0);
  beta[0] = 1;
  let info: number[][] = [];
  for (let it = 0; it < iterations; it++) {
    const grad = new Array(k).fill(0);
    info = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const r of rows) {
      const x = cols(r);
      const z = x.reduce((s, v, i) => s + v * beta[i], 0);
      const p = 1 / (1 + Math.exp(-z));
      const w = p * (1 - p);
      for (let i = 0; i < k; i++) {
        grad[i] += (r.y - p) * x[i];
        for (let j = 0; j < k; j++) info[i][j] += w * x[i] * x[j];
      }
    }
    const step = solve(info, grad);
    beta = beta.map((b, i) => b + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  const inv = invert(info);
  return { beta, se: inv.map((row, i) => Math.sqrt(Math.max(0, row[i]))) };
}

/** Mean log loss of a fit on rows (lower is better). */
export function logLoss(rows: FactorRow[], fit: Fit, use: boolean[] = FACTORS.map(() => true)): number {
  let total = 0;
  for (const r of rows) {
    const x = [r.logit, ...r.x.filter((_, i) => use[i])];
    const z = x.reduce((s, v, i) => s + v * fit.beta[i], 0);
    const p = Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-z))));
    total -= r.y ? Math.log(p) : Math.log(1 - p);
  }
  return total / Math.max(1, rows.length);
}

/** A factor's coefficient as rating points (400 points = a factor of 10 in the odds). */
export const asRating = (b: number) => (b * 400) / Math.LN10;

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let j = c; j <= n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

function invert(a: number[][]): number[][] {
  const n = a.length;
  return Array.from({ length: n }, (_, j) => solve(a, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)))).reduce<number[][]>(
    (out, col, j) => {
      col.forEach((v, i) => (out[i][j] = v));
      return out;
    },
    Array.from({ length: n }, () => new Array(n).fill(0)),
  );
}
