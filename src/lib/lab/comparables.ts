// Career comparables (pure, unit tested): a player's rating path over the last two years, relative
// to the field, matched against every earlier player at the same age; what those players did next
// is the projection's range. Also a backtest that only uses data from before its cutoff.

export interface Series {
  key: string;
  birth: string;
  /** Weekly overall ratings, oldest first. */
  weeks: { week: string; overall: number }[];
}

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const ageAt = (birth: string, week: string) => (t(week) - t(birth)) / YEAR;

/** The field's level each calendar year: mean season rating of the year's 100 best (10+ weeks played). */
export function fieldLevels(series: Series[]): Map<number, number> {
  const byYear = new Map<number, number[]>();
  for (const s of series) {
    const seasons = new Map<number, number[]>();
    for (const w of s.weeks) {
      const y = Number(w.week.slice(0, 4));
      seasons.set(y, [...(seasons.get(y) ?? []), w.overall]);
    }
    for (const [y, xs] of seasons) if (xs.length >= 10) byYear.set(y, [...(byYear.get(y) ?? []), xs.reduce((a, b) => a + b, 0) / xs.length]);
  }
  return new Map(
    [...byYear].map(([y, xs]) => {
      const top = xs.sort((a, b) => b - a).slice(0, 100);
      return [y, top.reduce((a, b) => a + b, 0) / top.length];
    }),
  );
}

/** Rating relative to the field at an age: the latest week in the half year up to it, or null. */
export function relAt(s: Series, age: number, field: Map<number, number>, cutoff?: string): number | null {
  for (let i = s.weeks.length - 1; i >= 0; i--) {
    const w = s.weeks[i];
    if (cutoff && w.week > cutoff) continue;
    const a = ageAt(s.birth, w.week);
    if (a > age) continue;
    if (a <= age - 0.5) return null;
    const level = field.get(Number(w.week.slice(0, 4)));
    return level === undefined ? null : w.overall - level;
  }
  return null;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};

export interface Comp {
  key: string;
  /** How far apart the two paths are (rating points, weighted). */
  distance: number;
  /** Their rating relative to the field at this age, and one and two years later. */
  then: number;
  plus1: number | null;
  plus2: number | null;
}

export interface Band {
  low: number;
  mid: number;
  high: number;
}

export interface Projection {
  key: string;
  age: number;
  /** Rating now (absolute), and relative to the field. */
  rating: number;
  rel: number;
  path: (number | null)[];
  comps: Comp[];
  /** Change in rating expected over one and two years: 20th, 50th and 80th percentile of the comps. */
  in1: Band | null;
  in2: Band | null;
}

const WEIGHTS = [1, 0.6, 0.3];
/** 25 comps: in backtests (2021–2025) the 20–80% band then held 58% of outcomes on both tours. */
export const COMPS = 25;

/**
 * Projection for one player as of `asOf` (their latest week on or before it). Only weeks on or
 * before `cutoff` (default: everything) are used for anyone, so a backtest can't see the future.
 */
export function project(target: Series, all: Series[], field: Map<number, number>, asOf: string, cutoff?: string, k = COMPS): Projection | null {
  const last = [...target.weeks].reverse().find((w) => w.week <= asOf);
  if (!last || t(asOf) - t(last.week) > 180 * DAY) return null;
  const age = ageAt(target.birth, asOf);
  const path = WEIGHTS.map((_, i) => relAt(target, age - i, field, asOf));
  if (path[0] === null || path[1] === null) return null;

  const comps: Comp[] = [];
  for (const s of all) {
    if (s.key === target.key) continue;
    const theirs = WEIGHTS.map((_, i) => relAt(s, age - i, field, cutoff));
    if (theirs[0] === null || theirs[1] === null) continue;
    const plus1 = relAt(s, age + 1, field, cutoff);
    if (plus1 === null) continue;
    let sum = 0;
    let weight = 0;
    WEIGHTS.forEach((wt, i) => {
      if (path[i] !== null && theirs[i] !== null) {
        sum += wt * (path[i]! - theirs[i]!) ** 2;
        weight += wt;
      }
    });
    comps.push({ key: s.key, distance: Math.sqrt(sum / weight), then: theirs[0]!, plus1, plus2: relAt(s, age + 2, field, cutoff) });
  }
  comps.sort((a, b) => a.distance - b.distance);
  const near = comps.slice(0, k);
  const band = (xs: number[]): Band | null => (xs.length >= 6 ? { low: quantile(xs, 0.2), mid: quantile(xs, 0.5), high: quantile(xs, 0.8) } : null);
  return {
    key: target.key,
    age,
    rating: last.overall,
    rel: path[0]!,
    path,
    comps: near,
    in1: band(near.map((c) => c.plus1! - c.then)),
    in2: band(near.filter((c) => c.plus2 !== null).map((c) => c.plus2! - c.then)),
  };
}

export interface Backtest {
  asOf: string;
  players: number;
  /** Mean absolute error one year on, in rating points: comparables vs assuming no change. */
  error: number;
  baseline: number;
  /** Share of outcomes inside the 20–80% band (about 60% if the band is honest). */
  coverage: number;
}

/** Projects everyone active at `asOf` using only data up to then, and scores it a year later. */
export function backtest(all: Series[], field: Map<number, number>, asOf: string, k = COMPS, ages: [number, number] = [18, 30]): Backtest {
  let n = 0;
  let err = 0;
  let base = 0;
  let inside = 0;
  for (const s of all) {
    const p = project(s, all, field, asOf, asOf, k);
    if (!p?.in1 || p.age < ages[0] || p.age > ages[1]) continue;
    const actual = relAt(s, p.age + 1, field);
    if (actual === null) continue;
    const change = actual - p.rel;
    n++;
    err += Math.abs(change - p.in1.mid);
    base += Math.abs(change);
    if (change >= p.in1.low && change <= p.in1.high) inside++;
  }
  return { asOf, players: n, error: n ? err / n : 0, baseline: n ? base / n : 0, coverage: n ? inside / n : 0 };
}
